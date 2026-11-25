/**
 * Persistence contracts for saved designs. A design is a user-owned
 * DesignDocument pinned to an immutable baseline; saving uses optimistic
 * concurrency (revision numbers) so two tabs cannot silently overwrite each other.
 */
import type { DesignDocument } from "../schema/document";

export type Permission = "view" | "edit";

export type DesignMeta = {
  id: string;
  ownerId: string;
  name: string;
  baselineId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
export type DesignRecord = DesignMeta & { data: DesignDocument };

export type VersionMeta = { id: string; designId: string; label: string; createdAt: string };
export type ShareMeta = { id: string; designId: string; permission: Permission; createdAt: string; expiresAt: string | null; revokedAt: string | null };

export class NotFoundError extends Error { constructor(what = "Design") { super(`${what} not found`); this.name = "NotFoundError"; } }
export class ForbiddenError extends Error { constructor() { super("Not allowed"); this.name = "ForbiddenError"; } }
export class ConflictError extends Error {
  constructor(public currentRevision: number) { super(`Revision conflict (current ${currentRevision})`); this.name = "ConflictError"; }
}

export interface DesignRepo {
  create(ownerId: string, data: DesignDocument, name?: string): Promise<DesignRecord>;
  get(id: string): Promise<DesignRecord | null>;
  list(ownerId: string, baselineId?: string): Promise<DesignMeta[]>;
  /** Saves `data` when `expectedRevision` is still current; otherwise throws ConflictError. */
  save(id: string, ownerId: string, data: DesignDocument, expectedRevision: number): Promise<DesignRecord>;
  rename(id: string, ownerId: string, name: string): Promise<DesignRecord>;
  remove(id: string, ownerId: string): Promise<void>;
  duplicate(id: string, ownerId: string, name?: string): Promise<DesignRecord>;

  addVersion(id: string, ownerId: string, label: string): Promise<VersionMeta>;
  listVersions(id: string, ownerId: string): Promise<VersionMeta[]>;
  /** Restores a snapshot as a NEW revision (history is never rewritten). */
  restoreVersion(id: string, ownerId: string, versionId: string, expectedRevision: number): Promise<DesignRecord>;

  /** The raw token is returned once; only its hash is stored. */
  createShare(id: string, ownerId: string, permission: Permission, expiresAt?: Date | null): Promise<{ token: string; share: ShareMeta }>;
  listShares(id: string, ownerId: string): Promise<ShareMeta[]>;
  revokeShare(id: string, ownerId: string, shareId: string): Promise<void>;
  resolveShare(token: string): Promise<{ design: DesignRecord; permission: Permission } | null>;
  /** Saving through an edit-permission link. */
  saveShared(token: string, data: DesignDocument, expectedRevision: number): Promise<DesignRecord>;
}
