/**
 * Design operations behind the HTTP routes. Framework-free so they are unit
 * tested directly: each takes a repository and (for owner routes) the signed-in
 * user and returns `{ status, body }`. Errors map to stable statuses; another
 * user's design is reported as 404, never 403, so ids cannot be probed.
 */
import { ZodError } from "zod";
import { migrateDocument, MigrationError } from "../migrations";
import type { DesignDocument } from "../schema/document";
import { ValidationError } from "./kvRepo";
import { ConflictError, ForbiddenError, NotFoundError, type DesignRepo, type Permission } from "./types";

export type Result = { status: number; body: unknown };
export type User = { id: string };

export const ok = (body: unknown, status = 200): Result => ({ status, body });

export function toHttp(err: unknown): Result {
  if (err instanceof ConflictError) return { status: 409, body: { error: "conflict", currentRevision: err.currentRevision } };
  if (err instanceof NotFoundError || err instanceof ForbiddenError) return { status: 404, body: { error: "not_found" } };
  if (err instanceof ValidationError) return { status: 400, body: { error: "invalid", message: err.message } };
  if (err instanceof MigrationError) return { status: 400, body: { error: "invalid", message: err.message } };
  if (err instanceof ZodError) return { status: 400, body: { error: "invalid", message: "Design document is not valid" } };
  throw err;
}

/** Runs an operation and converts known errors into HTTP results. */
export async function run(fn: () => Promise<Result>): Promise<Result> {
  try { return await fn(); } catch (e) { return toHttp(e); }
}

/** Validates (and migrates forward) a document received from a client. */
export function parseDocument(raw: unknown): DesignDocument {
  return migrateDocument(raw);
}

const rev = (v: unknown): number => {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1) throw new ValidationError("revision must be a positive integer");
  return v;
};
const str = (v: unknown, what: string): string => {
  if (typeof v !== "string" || !v.trim()) throw new ValidationError(`${what} is required`);
  return v;
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

export const ops = {
  list: (repo: DesignRepo, u: User, baseline?: string) => run(async () => ok({ designs: await repo.list(u.id, baseline) })),
  create: (repo: DesignRepo, u: User, body: unknown) => run(async () => {
    const b = obj(body);
    return ok({ design: await repo.create(u.id, parseDocument(b.data), typeof b.name === "string" ? b.name : undefined) }, 201);
  }),
  get: (repo: DesignRepo, u: User, id: string) => run(async () => {
    const d = await repo.get(id);
    if (!d || d.ownerId !== u.id) throw new NotFoundError();
    return ok({ design: d });
  }),
  save: (repo: DesignRepo, u: User, id: string, body: unknown) => run(async () => {
    const b = obj(body);
    return ok({ design: await repo.save(id, u.id, parseDocument(b.data), rev(b.revision)) });
  }),
  rename: (repo: DesignRepo, u: User, id: string, body: unknown) => run(async () => ok({ design: await repo.rename(id, u.id, str(obj(body).name, "name")) })),
  remove: (repo: DesignRepo, u: User, id: string) => run(async () => { await repo.remove(id, u.id); return ok({ ok: true }); }),
  duplicate: (repo: DesignRepo, u: User, id: string, body: unknown) => run(async () => {
    const n = obj(body).name;
    return ok({ design: await repo.duplicate(id, u.id, typeof n === "string" ? n : undefined) }, 201);
  }),
  versions: (repo: DesignRepo, u: User, id: string) => run(async () => ok({ versions: await repo.listVersions(id, u.id) })),
  addVersion: (repo: DesignRepo, u: User, id: string, body: unknown) => run(async () => ok({ version: await repo.addVersion(id, u.id, str(obj(body).label, "label")) }, 201)),
  restore: (repo: DesignRepo, u: User, id: string, versionId: string, body: unknown) => run(async () => ok({ design: await repo.restoreVersion(id, u.id, versionId, rev(obj(body).revision)) })),
  shares: (repo: DesignRepo, u: User, id: string) => run(async () => ok({ shares: await repo.listShares(id, u.id) })),
  createShare: (repo: DesignRepo, u: User, id: string, body: unknown) => run(async () => {
    const b = obj(body);
    const permission: Permission = b.permission === "edit" ? "edit" : "view";
    const days = typeof b.expiresInDays === "number" && b.expiresInDays > 0 && b.expiresInDays <= 365 ? b.expiresInDays : null;
    return ok(await repo.createShare(id, u.id, permission, days ? new Date(Date.now() + days * 86_400_000) : null), 201);
  }),
  revokeShare: (repo: DesignRepo, u: User, id: string, shareId: string) => run(async () => { await repo.revokeShare(id, u.id, shareId); return ok({ ok: true }); }),
  // public, token-addressed
  sharedGet: (repo: DesignRepo, token: string) => run(async () => {
    const r = await repo.resolveShare(token);
    if (!r) throw new NotFoundError();
    // the owner id is not exposed through a link
    const { ownerId: _o, ...design } = r.design; void _o;
    return ok({ design, permission: r.permission });
  }),
  sharedSave: (repo: DesignRepo, token: string, body: unknown) => run(async () => {
    const b = obj(body);
    const d = await repo.saveShared(token, parseDocument(b.data), rev(b.revision));
    const { ownerId: _o, ...design } = d; void _o;
    return ok({ design });
  }),
};
