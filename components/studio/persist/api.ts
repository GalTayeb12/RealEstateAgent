/** Typed fetch helpers for /api/studio/* (owner routes use the session cookie; share routes need no login). */
import type { DesignDocument } from "@/lib/studio/schema/document";
import type { DesignMeta, DesignRecord, Permission, ShareMeta, VersionMeta } from "@/lib/studio/persist/types";

export class ApiError extends Error {
  constructor(public status: number, public body: { error?: string; currentRevision?: number; message?: string }) { super(body.message ?? body.error ?? `HTTP ${status}`); }
}

async function call<T>(method: string, url: string, body?: unknown, keepalive = false): Promise<T> {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, keepalive, credentials: "same-origin" });
  let json: unknown = {};
  try { json = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new ApiError(res.status, json as ApiError["body"]);
  return json as T;
}

const D = "/api/studio/designs";
export const designsApi = {
  list: (baseline: string) => call<{ designs: DesignMeta[] }>("GET", `${D}?baseline=${encodeURIComponent(baseline)}`),
  create: (data: DesignDocument, name?: string) => call<{ design: DesignRecord }>("POST", D, { data, name }),
  get: (id: string) => call<{ design: DesignRecord }>("GET", `${D}/${id}`),
  save: (id: string, data: DesignDocument, revision: number, keepalive = false) => call<{ design: DesignRecord }>("PUT", `${D}/${id}`, { data, revision }, keepalive),
  rename: (id: string, name: string) => call<{ design: DesignRecord }>("PATCH", `${D}/${id}`, { name }),
  duplicate: (id: string, name?: string) => call<{ design: DesignRecord }>("POST", `${D}/${id}/duplicate`, { name }),
  versions: (id: string) => call<{ versions: VersionMeta[] }>("GET", `${D}/${id}/versions`),
  addVersion: (id: string, label: string) => call<{ version: VersionMeta }>("POST", `${D}/${id}/versions`, { label }),
  restore: (id: string, versionId: string, revision: number) => call<{ design: DesignRecord }>("POST", `${D}/${id}/versions/${versionId}/restore`, { revision }),
  shares: (id: string) => call<{ shares: ShareMeta[] }>("GET", `${D}/${id}/shares`),
  createShare: (id: string, permission: Permission) => call<{ token: string; share: ShareMeta }>("POST", `${D}/${id}/shares`, { permission }),
  revokeShare: (id: string, shareId: string) => call<{ ok: true }>("DELETE", `${D}/${id}/shares/${shareId}`),
};

export const sharedApi = {
  get: (token: string) => call<{ design: Omit<DesignRecord, "ownerId">; permission: Permission }>("GET", `/api/studio/shared/${token}`),
  save: (token: string, data: DesignDocument, revision: number, keepalive = false) =>
    call<{ design: Omit<DesignRecord, "ownerId"> }>("PUT", `/api/studio/shared/${token}`, { data, revision }, keepalive),
};
