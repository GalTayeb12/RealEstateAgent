import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { LocalDiskStorage } from "../storage";
import { emptyDocument, type DesignDocument } from "../studio/schema/document";
import { ItemNode } from "../studio/schema/nodes";
import { hashToken, KvDesignRepo, MAX_DOC_BYTES, ValidationError } from "../studio/persist/kvRepo";
import { MemoryKv, StorageKv } from "../studio/persist/kv";
import { ConflictError, ForbiddenError, NotFoundError, type DesignRepo } from "../studio/persist/types";

const ref = { id: "yarkon-twin-shell", version: 1, twinHash: "abc" };
const doc = (name = "Mine"): DesignDocument => emptyDocument(ref, name);
const withItem = (d: DesignDocument, id: string): DesignDocument => ({
  ...d, nodes: { ...d.nodes, [id]: ItemNode.parse({ id, kind: "item", catalog: { id: "coffee-drum-01", version: 1 }, transform: { x: 3, y: 2, rot: 0 } }) },
});

const dir = mkdtempSync(path.join(os.tmpdir(), "studio-persist-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

type Made = { repo: DesignRepo; kv: MemoryKv | StorageKv | null; storedTokenHashes?: () => Promise<string[]> };
const factories: [string, () => Made | Promise<Made>][] = [
  ["memory", () => { const kv = new MemoryKv(); return { repo: new KvDesignRepo(kv), kv }; }],
  ["local storage", () => { const kv = new StorageKv(new LocalDiskStorage(mkdtempSync(path.join(dir, "s-")))); return { repo: new KvDesignRepo(kv), kv }; }],
];

/**
 * Postgres (PrismaDesignRepo), opt-in: STUDIO_TEST_DATABASE_URL must point at a DEV database and pass
 * scripts/studio/assert-dev-db.mjs (checked here before anything connects). The owners u1/u2 are
 * created as User rows (StudioDesign.ownerId is a foreign key) and everything is removed afterwards.
 */
const dbUrl = process.env.STUDIO_TEST_DATABASE_URL;
if (dbUrl) {
  const guard = spawnSync(process.execPath, ["scripts/studio/assert-dev-db.mjs", `--url=${dbUrl}`], { encoding: "utf8" });
  if (guard.status !== 0) throw new Error(`STUDIO_TEST_DATABASE_URL refused by assert-dev-db: ${guard.stderr.trim()}`);
  process.env.DATABASE_URL = dbUrl;
  const { prisma } = await import("../prisma");
  const { PrismaDesignRepo } = await import("../studio/persist/prismaRepo");
  const owners = ["u1", "u2"];
  for (const id of owners) {
    await prisma.studioDesign.deleteMany({ where: { ownerId: id } });
    await prisma.user.upsert({ where: { id }, update: {}, create: { id, email: `${id}@studio-test.invalid`, passwordHash: "x", role: "developer" } });
  }
  afterAll(async () => {
    await prisma.studioDesign.deleteMany({ where: { ownerId: { in: owners } } });
    await prisma.user.deleteMany({ where: { id: { in: owners } } });
    await prisma.$disconnect();
  });
  // each test starts from a clean slate, like the fresh in-memory stores above (the database is shared)
  factories.push(["postgres", async () => {
    await prisma.studioDesign.deleteMany({ where: { ownerId: { in: owners } } });
    return {
      repo: new PrismaDesignRepo(prisma), kv: null,
      storedTokenHashes: async () => (await prisma.studioDesignShare.findMany({ select: { tokenHash: true } })).map((s) => s.tokenHash),
    };
  }]);
}

describe.each(factories)("design repository (%s)", (_name, make) => {
  it("creates, reads and lists only the owner's designs for a baseline", async () => {
    const { repo } = await make();
    const a = await repo.create("u1", doc("A"));
    await repo.create("u2", doc("B"));
    await repo.create("u1", { ...doc("C"), baseline: { ...ref, id: "other" } });
    expect((await repo.get(a.id))?.name).toBe("A");
    expect((await repo.list("u1")).map((d) => d.name).sort()).toEqual(["A", "C"]);
    expect((await repo.list("u1", "yarkon-twin-shell")).map((d) => d.name)).toEqual(["A"]);
    expect(a.revision).toBe(1);
  });

  it("saves with optimistic concurrency", async () => {
    const { repo } = await make();
    const a = await repo.create("u1", doc());
    const s1 = await repo.save(a.id, "u1", withItem(a.data, "x"), 1);
    expect(s1.revision).toBe(2);
    await expect(repo.save(a.id, "u1", withItem(a.data, "y"), 1)).rejects.toBeInstanceOf(ConflictError);
    const conflict = await repo.save(a.id, "u1", a.data, 1).catch((e) => e as ConflictError);
    expect((conflict as ConflictError).currentRevision).toBe(2);
    expect(Object.keys((await repo.get(a.id))!.data.nodes)).toEqual(["x"]);
  });

  it("refuses other owners, unknown designs, baseline changes and oversized documents", async () => {
    const { repo } = await make();
    const a = await repo.create("u1", doc());
    await expect(repo.save(a.id, "u2", a.data, 1)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(repo.save("nope", "u1", a.data, 1)).rejects.toBeInstanceOf(NotFoundError);
    await expect(repo.save(a.id, "u1", { ...a.data, baseline: { ...ref, id: "other" } }, 1)).rejects.toBeInstanceOf(ValidationError);
    const big = { ...a.data, name: "x".repeat(MAX_DOC_BYTES + 10) };
    await expect(repo.save(a.id, "u1", big, 1)).rejects.toBeInstanceOf(ValidationError);
    await expect(repo.remove(a.id, "u2")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("renames (trimmed, non-empty) and duplicates independently", async () => {
    const { repo } = await make();
    const a = await repo.create("u1", withItem(doc("A"), "x"));
    expect((await repo.rename(a.id, "u1", "  Living  ")).name).toBe("Living");
    await expect(repo.rename(a.id, "u1", "   ")).rejects.toBeInstanceOf(ValidationError);
    const copy = await repo.duplicate(a.id, "u1");
    expect(copy.id).not.toBe(a.id);
    expect(copy.name).toBe("Living (copy)");
    expect(copy.revision).toBe(1);
    await repo.save(copy.id, "u1", doc("changed"), 1);
    expect(Object.keys((await repo.get(a.id))!.data.nodes)).toEqual(["x"]);
  });

  it("keeps named versions and restores one as a new revision", async () => {
    const { repo } = await make();
    const a = await repo.create("u1", doc());
    const s = await repo.save(a.id, "u1", withItem(a.data, "x"), 1); // rev 2
    const v = await repo.addVersion(a.id, "u1", "  First idea ");
    expect(v.label).toBe("First idea");
    await repo.save(a.id, "u1", withItem(s.data, "y"), 2); // rev 3
    expect((await repo.listVersions(a.id, "u1")).map((x) => x.label)).toEqual(["First idea"]);
    await expect(repo.restoreVersion(a.id, "u1", v.id, 2)).rejects.toBeInstanceOf(ConflictError);
    const r = await repo.restoreVersion(a.id, "u1", v.id, 3);
    expect(r.revision).toBe(4);
    expect(Object.keys(r.data.nodes)).toEqual(["x"]);
    await expect(repo.restoreVersion(a.id, "u1", "missing", 4)).rejects.toBeInstanceOf(NotFoundError);
    await expect(repo.listVersions(a.id, "u2")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("shares by unguessable token: view cannot write, edit can, revoke and expiry work", async () => {
    const { repo, kv, storedTokenHashes } = await make();
    const a = await repo.create("u1", doc());
    const view = await repo.createShare(a.id, "u1", "view");
    const edit = await repo.createShare(a.id, "u1", "edit");
    expect(view.token.length).toBeGreaterThanOrEqual(30);
    expect(view.token).not.toBe(edit.token);
    expect((await repo.resolveShare(view.token))?.permission).toBe("view");
    expect(await repo.resolveShare("wrong")).toBeNull();
    await expect(repo.saveShared(view.token, withItem(a.data, "v"), 1)).rejects.toBeInstanceOf(ForbiddenError);
    const saved = await repo.saveShared(edit.token, withItem(a.data, "e"), 1);
    expect(saved.revision).toBe(2);
    await expect(repo.saveShared(edit.token, a.data, 1)).rejects.toBeInstanceOf(ConflictError);
    // only the hash is stored
    if (kv) {
      const keys = await kv.list("");
      expect(keys.some((k) => k.includes(view.token))).toBe(false);
      expect(keys).toContain(`share/${hashToken(view.token)}`);
    } else {
      const hashes = await storedTokenHashes!();
      expect(hashes).toContain(hashToken(view.token));
      expect(hashes).not.toContain(view.token);
    }
    await repo.revokeShare(a.id, "u1", view.share.id);
    expect(await repo.resolveShare(view.token)).toBeNull();
    const old = await repo.createShare(a.id, "u1", "view", new Date(Date.now() - 1000));
    expect(await repo.resolveShare(old.token)).toBeNull();
    expect((await repo.listShares(a.id, "u1")).length).toBe(3);
  });

  it("removing a design removes its versions and share links", async () => {
    const { repo } = await make();
    const a = await repo.create("u1", doc());
    await repo.addVersion(a.id, "u1", "v");
    const s = await repo.createShare(a.id, "u1", "view");
    await repo.remove(a.id, "u1");
    expect(await repo.get(a.id)).toBeNull();
    expect(await repo.resolveShare(s.token)).toBeNull();
    expect(await repo.list("u1")).toEqual([]);
  });

  it("serialises concurrent saves: exactly one wins per revision", async () => {
    const { repo } = await make();
    const a = await repo.create("u1", doc());
    const results = await Promise.allSettled([1, 2, 3].map((i) => repo.save(a.id, "u1", withItem(a.data, `n${i}`), 1)));
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
  });
});
