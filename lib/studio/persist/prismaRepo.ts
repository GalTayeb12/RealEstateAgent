/**
 * DesignRepo on Prisma/Postgres (production path). Saving is one conditional
 * UPDATE (`WHERE id AND ownerId AND revision = expected`), so concurrent saves
 * cannot both win even across server instances.
 *
 * Integration-tested only when a DEV database is supplied
 * (STUDIO_TEST_DATABASE_URL, see scripts/studio/assert-dev-db.mjs); the shared
 * contract tests in lib/__tests__/studio-persist.test.ts run against it too.
 */
import { createHash, randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@/app/generated/prisma/client";
import { CURRENT_SCHEMA_VERSION, type DesignDocument } from "../schema/document";
import { MAX_DOC_BYTES, ValidationError, hashToken } from "./kvRepo";
import {
  ConflictError, ForbiddenError, NotFoundError,
  type DesignMeta, type DesignRecord, type DesignRepo, type Permission, type ShareMeta, type VersionMeta,
} from "./types";

type Row = { id: string; ownerId: string; name: string; baselineId: string; revision: number; createdAt: Date; updatedAt: Date; data: unknown };
const meta = (r: Omit<Row, "data">): DesignMeta => ({
  id: r.id, ownerId: r.ownerId, name: r.name, baselineId: r.baselineId, revision: r.revision,
  createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
});
const rec = (r: Row): DesignRecord => ({ ...meta(r), data: r.data as DesignDocument });
const json = (d: DesignDocument) => d as unknown as Prisma.InputJsonValue;

function check(data: DesignDocument, baselineId?: string) {
  if (JSON.stringify(data).length > MAX_DOC_BYTES) throw new ValidationError("Design is too large");
  if (baselineId && data.baseline.id !== baselineId) throw new ValidationError("A design cannot change its baseline");
}

export class PrismaDesignRepo implements DesignRepo {
  constructor(private db: PrismaClient) {}

  private async own(id: string, ownerId: string): Promise<DesignRecord> {
    const r = await this.db.studioDesign.findUnique({ where: { id } });
    if (!r) throw new NotFoundError();
    if (r.ownerId !== ownerId) throw new ForbiddenError();
    return rec(r);
  }

  async create(ownerId: string, data: DesignDocument, name?: string) {
    check(data);
    const r = await this.db.studioDesign.create({
      data: { ownerId, name: name ?? data.name, baselineId: data.baseline.id, schemaVersion: CURRENT_SCHEMA_VERSION, data: json(data) },
    });
    return rec(r);
  }
  async get(id: string) {
    const r = await this.db.studioDesign.findUnique({ where: { id } });
    return r ? rec(r) : null;
  }
  async list(ownerId: string, baselineId?: string) {
    const rows = await this.db.studioDesign.findMany({
      where: { ownerId, ...(baselineId ? { baselineId } : {}) }, orderBy: { updatedAt: "desc" },
      select: { id: true, ownerId: true, name: true, baselineId: true, revision: true, createdAt: true, updatedAt: true },
    });
    return rows.map(meta);
  }

  private async writeIf(where: Prisma.StudioDesignWhereInput, id: string, data: DesignDocument, expected: number, baselineId: string) {
    check(data, baselineId);
    const res = await this.db.studioDesign.updateMany({
      where: { ...where, id, revision: expected },
      data: { data: json(data), revision: { increment: 1 }, schemaVersion: CURRENT_SCHEMA_VERSION },
    });
    if (res.count === 0) {
      const cur = await this.db.studioDesign.findUnique({ where: { id }, select: { revision: true } });
      if (!cur) throw new NotFoundError();
      throw new ConflictError(cur.revision);
    }
    return (await this.get(id))!;
  }

  async save(id: string, ownerId: string, data: DesignDocument, expectedRevision: number) {
    const cur = await this.own(id, ownerId);
    return this.writeIf({ ownerId }, id, data, expectedRevision, cur.baselineId);
  }
  async rename(id: string, ownerId: string, name: string) {
    await this.own(id, ownerId);
    const n = name.trim().slice(0, 120);
    if (!n) throw new ValidationError("Name is empty");
    return rec(await this.db.studioDesign.update({ where: { id }, data: { name: n } }));
  }
  async remove(id: string, ownerId: string) {
    await this.own(id, ownerId);
    await this.db.studioDesign.delete({ where: { id } }); // versions and shares cascade
  }
  async duplicate(id: string, ownerId: string, name?: string) {
    const cur = await this.own(id, ownerId);
    return this.create(ownerId, structuredClone(cur.data), name ?? `${cur.name} (copy)`);
  }

  async addVersion(id: string, ownerId: string, label: string) {
    const cur = await this.own(id, ownerId);
    const v = await this.db.studioDesignVersion.create({ data: { designId: id, label: label.trim().slice(0, 120) || "Version", data: json(cur.data) } });
    return { id: v.id, designId: v.designId, label: v.label, createdAt: v.createdAt.toISOString() } satisfies VersionMeta;
  }
  async listVersions(id: string, ownerId: string) {
    await this.own(id, ownerId);
    const rows = await this.db.studioDesignVersion.findMany({ where: { designId: id }, orderBy: { createdAt: "desc" }, select: { id: true, designId: true, label: true, createdAt: true } });
    return rows.map((v) => ({ id: v.id, designId: v.designId, label: v.label, createdAt: v.createdAt.toISOString() }));
  }
  async restoreVersion(id: string, ownerId: string, versionId: string, expectedRevision: number) {
    const cur = await this.own(id, ownerId);
    const v = await this.db.studioDesignVersion.findFirst({ where: { id: versionId, designId: id } });
    if (!v) throw new NotFoundError("Version");
    return this.writeIf({ ownerId }, id, v.data as unknown as DesignDocument, expectedRevision, cur.baselineId);
  }

  private shareMeta(s: { id: string; designId: string; permission: string; createdAt: Date; expiresAt: Date | null; revokedAt: Date | null }): ShareMeta {
    return { id: s.id, designId: s.designId, permission: s.permission as Permission, createdAt: s.createdAt.toISOString(), expiresAt: s.expiresAt?.toISOString() ?? null, revokedAt: s.revokedAt?.toISOString() ?? null };
  }
  async createShare(id: string, ownerId: string, permission: Permission, expiresAt: Date | null = null) {
    await this.own(id, ownerId);
    const token = randomBytes(24).toString("base64url");
    const s = await this.db.studioDesignShare.create({ data: { designId: id, permission, expiresAt, tokenHash: hashToken(token) } });
    return { token, share: this.shareMeta(s) };
  }
  async listShares(id: string, ownerId: string) {
    await this.own(id, ownerId);
    return (await this.db.studioDesignShare.findMany({ where: { designId: id }, orderBy: { createdAt: "desc" } })).map((s) => this.shareMeta(s));
  }
  async revokeShare(id: string, ownerId: string, shareId: string) {
    await this.own(id, ownerId);
    const res = await this.db.studioDesignShare.updateMany({ where: { id: shareId, designId: id }, data: { revokedAt: new Date() } });
    if (res.count === 0) throw new NotFoundError("Share");
  }
  private async live(token: string) {
    const s = await this.db.studioDesignShare.findUnique({ where: { tokenHash: createHash("sha256").update(token).digest("hex") } });
    if (!s || s.revokedAt || (s.expiresAt && s.expiresAt.getTime() < Date.now())) return null;
    const design = await this.get(s.designId);
    return design ? { design, permission: s.permission as Permission } : null;
  }
  resolveShare(token: string) { return this.live(token); }
  async saveShared(token: string, data: DesignDocument, expectedRevision: number) {
    const r = await this.live(token);
    if (!r) throw new NotFoundError("Share");
    if (r.permission !== "edit") throw new ForbiddenError();
    return this.writeIf({}, r.design.id, data, expectedRevision, r.design.baselineId);
  }
}
