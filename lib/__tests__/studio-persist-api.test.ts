import { describe, expect, it } from "vitest";
import { emptyDocument } from "../studio/schema/document";
import { MemoryKv } from "../studio/persist/kv";
import { KvDesignRepo } from "../studio/persist/kvRepo";
import { ops } from "../studio/persist/ops";

const ref = { id: "yarkon-twin-shell", version: 1, twinHash: "abc" };
const doc = (name = "Mine") => emptyDocument(ref, name);
const setup = () => ({ repo: new KvDesignRepo(new MemoryKv()), u1: { id: "u1" }, u2: { id: "u2" } });
type Body = Record<string, unknown> & { design?: { id: string; revision: number; data: unknown; ownerId?: string }; token?: string };

describe("design operations (HTTP semantics)", () => {
  it("creates a design (201) and lists it for the owner only", async () => {
    const { repo, u1, u2 } = setup();
    const c = await ops.create(repo, u1, { data: doc("A"), name: "Living" });
    expect(c.status).toBe(201);
    expect(((await ops.list(repo, u1)).body as { designs: unknown[] }).designs).toHaveLength(1);
    expect(((await ops.list(repo, u2)).body as { designs: unknown[] }).designs).toHaveLength(0);
    expect(((c.body as Body).design as unknown as { name: string }).name).toBe("Living");
  });

  it("rejects malformed, unknown-version and oversized-structure documents with 400", async () => {
    const { repo, u1 } = setup();
    expect((await ops.create(repo, u1, { data: { nope: true } })).status).toBe(400);
    expect((await ops.create(repo, u1, { data: { ...doc(), schemaVersion: 99 } })).status).toBe(400);
    expect((await ops.create(repo, u1, { data: { ...doc(), nodes: { a: { kind: "item", id: "a", transform: { x: 1, y: 1, scale: 3 } } } } })).status).toBe(400);
    expect((await ops.create(repo, u1, null)).status).toBe(400);
  });

  it("saves with a revision; a stale or missing revision is 409 / 400", async () => {
    const { repo, u1 } = setup();
    const { design } = (await ops.create(repo, u1, { data: doc() })).body as Body;
    const ok = await ops.save(repo, u1, design!.id, { data: doc("v2"), revision: 1 });
    expect(ok.status).toBe(200);
    expect(((ok.body as Body).design!).revision).toBe(2);
    const stale = await ops.save(repo, u1, design!.id, { data: doc("v3"), revision: 1 });
    expect(stale.status).toBe(409);
    expect((stale.body as { currentRevision: number }).currentRevision).toBe(2);
    expect((await ops.save(repo, u1, design!.id, { data: doc() })).status).toBe(400);
    expect((await ops.save(repo, u1, design!.id, { data: doc(), revision: 0 })).status).toBe(400);
  });

  it("another user's design looks like it does not exist (404 everywhere)", async () => {
    const { repo, u1, u2 } = setup();
    const { design } = (await ops.create(repo, u1, { data: doc() })).body as Body;
    const id = design!.id;
    for (const r of [
      await ops.get(repo, u2, id), await ops.save(repo, u2, id, { data: doc(), revision: 1 }), await ops.rename(repo, u2, id, { name: "x" }),
      await ops.remove(repo, u2, id), await ops.duplicate(repo, u2, id, {}), await ops.versions(repo, u2, id), await ops.addVersion(repo, u2, id, { label: "x" }),
      await ops.shares(repo, u2, id), await ops.createShare(repo, u2, id, {}),
    ]) expect(r.status).toBe(404);
    expect((await ops.get(repo, u1, "does-not-exist")).status).toBe(404);
  });

  it("validates names and labels", async () => {
    const { repo, u1 } = setup();
    const { design } = (await ops.create(repo, u1, { data: doc() })).body as Body;
    expect((await ops.rename(repo, u1, design!.id, { name: "  " })).status).toBe(400);
    expect((await ops.rename(repo, u1, design!.id, {})).status).toBe(400);
    expect((await ops.addVersion(repo, u1, design!.id, { label: "" })).status).toBe(400);
    expect((await ops.rename(repo, u1, design!.id, { name: "Nice" })).status).toBe(200);
  });

  it("versions and restore: restore needs the current revision and bumps it", async () => {
    const { repo, u1 } = setup();
    const { design } = (await ops.create(repo, u1, { data: doc("first") })).body as Body;
    const v = ((await ops.addVersion(repo, u1, design!.id, { label: "Draft 1" })).body as { version: { id: string } }).version;
    await ops.save(repo, u1, design!.id, { data: doc("second"), revision: 1 });
    expect((await ops.restore(repo, u1, design!.id, v.id, { revision: 1 })).status).toBe(409);
    const r = await ops.restore(repo, u1, design!.id, v.id, { revision: 2 });
    expect(r.status).toBe(200);
    expect(((r.body as Body).design!.data as { name: string }).name).toBe("first");
    expect((await ops.restore(repo, u1, design!.id, "missing", { revision: 3 })).status).toBe(404);
  });

  it("share links: view reads without the owner id and cannot write; edit can write; revoked is gone", async () => {
    const { repo, u1 } = setup();
    const { design } = (await ops.create(repo, u1, { data: doc() })).body as Body;
    const view = (await ops.createShare(repo, u1, design!.id, { permission: "view" })).body as Body & { share: { id: string } };
    const edit = (await ops.createShare(repo, u1, design!.id, { permission: "edit", expiresInDays: 7 })).body as Body & { share: { id: string; expiresAt: string | null } };
    expect(edit.share.expiresAt).not.toBeNull();
    const g = await ops.sharedGet(repo, view.token!);
    expect(g.status).toBe(200);
    expect(JSON.stringify(g.body)).not.toContain("u1");
    expect((g.body as { permission: string }).permission).toBe("view");
    expect((await ops.sharedSave(repo, view.token!, { data: doc("hax"), revision: 1 })).status).toBe(404);
    const saved = await ops.sharedSave(repo, edit.token!, { data: doc("edited"), revision: 1 });
    expect(saved.status).toBe(200);
    expect(JSON.stringify(saved.body)).not.toContain("ownerId");
    expect((await ops.sharedGet(repo, "bogus")).status).toBe(404);
    expect((await ops.revokeShare(repo, u1, design!.id, view.share.id)).status).toBe(200);
    expect((await ops.sharedGet(repo, view.token!)).status).toBe(404);
  });

  it("out-of-range share expiry is ignored (no expiry)", async () => {
    const { repo, u1 } = setup();
    const { design } = (await ops.create(repo, u1, { data: doc() })).body as Body;
    const s = (await ops.createShare(repo, u1, design!.id, { expiresInDays: 99999 })).body as { share: { expiresAt: string | null } };
    expect(s.share.expiresAt).toBeNull();
  });
});

describe("rate limits on the studio routes (M13)", () => {
  it("a share link answers 429 after 60 requests a minute from one address; other addresses are unaffected", async () => {
    const prev = process.env.STUDIO_ENABLED;
    process.env.STUDIO_ENABLED = "1";
    process.env.JWT_SECRET ??= "unit-test-only-secret"; // lib/auth refuses to load without one; no token is signed here
    try {
      const { shared } = await import("../studio/persist/http");
      const route = shared(async () => ({ status: 200, body: { ok: true } }));
      const call = (ip: string) => route(new Request("http://x/api/studio/shared/t", { headers: { "x-forwarded-for": ip } }), { params: Promise.resolve({ token: "t" }) });
      const codes: number[] = [];
      for (let i = 0; i < 61; i++) codes.push((await call("203.0.113.7")).status);
      expect(codes.slice(0, 60).every((c) => c === 200)).toBe(true);
      expect(codes[60]).toBe(429);
      expect((await call("203.0.113.8")).status).toBe(200);
    } finally {
      process.env.STUDIO_ENABLED = prev;
    }
  });
});
