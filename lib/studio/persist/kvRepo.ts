/** DesignRepo on top of a Kv: used for tests (MemoryKv) and local development (StorageKv). */
import { createHash, randomBytes } from "node:crypto";
import type { DesignDocument } from "../schema/document";
import { newNodeId } from "../schema/ids";
import type { Kv } from "./kv";
import {
  ConflictError, ForbiddenError, NotFoundError,
  type DesignMeta, type DesignRecord, type DesignRepo, type Permission, type ShareMeta, type VersionMeta,
} from "./types";

export class ValidationError extends Error { constructor(m: string) { super(m); this.name = "ValidationError"; } }

export const MAX_DOC_BYTES = 2_000_000;
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const now = () => new Date().toISOString();

type StoredVersion = VersionMeta & { data: DesignDocument };
type StoredShare = ShareMeta & { tokenHash: string };

function checkDoc(data: DesignDocument, baselineId?: string) {
  if (JSON.stringify(data).length > MAX_DOC_BYTES) throw new ValidationError("Design is too large");
  if (baselineId && data.baseline.id !== baselineId) throw new ValidationError("A design cannot change its baseline");
}

export class KvDesignRepo implements DesignRepo {
  constructor(private kv: Kv) {}

  // every read-check-write runs one at a time in this process, so two saves with the same revision cannot both win
  private chain: Promise<unknown> = Promise.resolve();
  private atomic<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async own(id: string, ownerId: string): Promise<DesignRecord> {
    const d = await this.kv.get<DesignRecord>(`design/${id}`);
    if (!d) throw new NotFoundError();
    if (d.ownerId !== ownerId) throw new ForbiddenError();
    return d;
  }
  private meta({ data: _data, ...m }: DesignRecord): DesignMeta { void _data; return m; }

  async create(ownerId: string, data: DesignDocument, name?: string) {
    checkDoc(data);
    const t = now();
    const rec: DesignRecord = { id: newNodeId(), ownerId, name: name ?? data.name, baselineId: data.baseline.id, revision: 1, createdAt: t, updatedAt: t, data };
    await this.kv.set(`design/${rec.id}`, rec);
    return rec;
  }
  get(id: string) { return this.kv.get<DesignRecord>(`design/${id}`); }
  async list(ownerId: string, baselineId?: string) {
    const out: DesignMeta[] = [];
    for (const k of await this.kv.list("design/")) {
      const d = await this.kv.get<DesignRecord>(k);
      if (d && d.ownerId === ownerId && (!baselineId || d.baselineId === baselineId)) out.push(this.meta(d));
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  save(id: string, ownerId: string, data: DesignDocument, expectedRevision: number) {
    return this.atomic(async () => this.write(await this.own(id, ownerId), data, expectedRevision));
  }
  private async write(cur: DesignRecord, data: DesignDocument, expectedRevision: number) {
    checkDoc(data, cur.baselineId);
    if (cur.revision !== expectedRevision) throw new ConflictError(cur.revision);
    const next: DesignRecord = { ...cur, data, revision: cur.revision + 1, updatedAt: now() };
    await this.kv.set(`design/${cur.id}`, next);
    return next;
  }
  rename(id: string, ownerId: string, name: string) {
    return this.atomic(async () => {
      const cur = await this.own(id, ownerId);
      const n = name.trim().slice(0, 120);
      if (!n) throw new ValidationError("Name is empty");
      const next = { ...cur, name: n, updatedAt: now() };
      await this.kv.set(`design/${id}`, next);
      return next;
    });
  }
  async remove(id: string, ownerId: string) {
    await this.own(id, ownerId);
    await this.kv.delete(`design/${id}`);
    for (const k of await this.kv.list(`version/${id}/`)) await this.kv.delete(k);
    for (const k of await this.kv.list(`shareof/${id}/`)) {
      const hash = await this.kv.get<string>(k);
      if (hash) await this.kv.delete(`share/${hash}`);
      await this.kv.delete(k);
    }
  }
  async duplicate(id: string, ownerId: string, name?: string) {
    const cur = await this.own(id, ownerId);
    return this.create(ownerId, structuredClone(cur.data), name ?? `${cur.name} (copy)`);
  }

  async addVersion(id: string, ownerId: string, label: string) {
    const cur = await this.own(id, ownerId);
    const v: StoredVersion = { id: newNodeId(), designId: id, label: label.trim().slice(0, 120) || "Version", createdAt: now(), data: cur.data };
    await this.kv.set(`version/${id}/${v.id}`, v);
    return { id: v.id, designId: v.designId, label: v.label, createdAt: v.createdAt };
  }
  async listVersions(id: string, ownerId: string) {
    await this.own(id, ownerId);
    const out: VersionMeta[] = [];
    for (const k of await this.kv.list(`version/${id}/`)) {
      const v = await this.kv.get<StoredVersion>(k);
      if (v) out.push({ id: v.id, designId: v.designId, label: v.label, createdAt: v.createdAt });
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  restoreVersion(id: string, ownerId: string, versionId: string, expectedRevision: number) {
    return this.atomic(async () => {
      const cur = await this.own(id, ownerId);
      const v = await this.kv.get<StoredVersion>(`version/${id}/${versionId}`);
      if (!v) throw new NotFoundError("Version");
      return this.write(cur, v.data, expectedRevision);
    });
  }

  async createShare(id: string, ownerId: string, permission: Permission, expiresAt: Date | null = null) {
    await this.own(id, ownerId);
    const token = randomBytes(24).toString("base64url");
    const s: StoredShare = { id: newNodeId(), designId: id, permission, createdAt: now(), expiresAt: expiresAt ? expiresAt.toISOString() : null, revokedAt: null, tokenHash: hashToken(token) };
    await this.kv.set(`share/${s.tokenHash}`, s);
    await this.kv.set(`shareof/${id}/${s.id}`, s.tokenHash);
    const { tokenHash: _h, ...share } = s; void _h;
    return { token, share };
  }
  async listShares(id: string, ownerId: string) {
    await this.own(id, ownerId);
    const out: ShareMeta[] = [];
    for (const k of await this.kv.list(`shareof/${id}/`)) {
      const hash = await this.kv.get<string>(k);
      const s = hash ? await this.kv.get<StoredShare>(`share/${hash}`) : null;
      if (s) { const { tokenHash: _h, ...m } = s; void _h; out.push(m); }
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async revokeShare(id: string, ownerId: string, shareId: string) {
    await this.own(id, ownerId);
    const hash = await this.kv.get<string>(`shareof/${id}/${shareId}`);
    const s = hash ? await this.kv.get<StoredShare>(`share/${hash}`) : null;
    if (!s) throw new NotFoundError("Share");
    await this.kv.set(`share/${s.tokenHash}`, { ...s, revokedAt: now() });
  }
  private async live(token: string) {
    const s = await this.kv.get<StoredShare>(`share/${hashToken(token)}`);
    if (!s || s.revokedAt || (s.expiresAt && Date.parse(s.expiresAt) < Date.now())) return null;
    const design = await this.get(s.designId);
    return design ? { design, permission: s.permission } : null;
  }
  resolveShare(token: string) { return this.live(token); }
  saveShared(token: string, data: DesignDocument, expectedRevision: number) {
    return this.atomic(async () => {
      const r = await this.live(token);
      if (!r) throw new NotFoundError("Share");
      if (r.permission !== "edit") throw new ForbiddenError();
      return this.write(r.design, data, expectedRevision);
    });
  }
}
