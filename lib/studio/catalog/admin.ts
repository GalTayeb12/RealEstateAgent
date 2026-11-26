/**
 * Catalog administration (pure): lifecycle states, per-asset audit and the
 * version-immutability rule. Used by the admin page, the status API and the
 * publish script, so the same rules hold everywhere.
 *
 * Lifecycle: draft -> review -> published -> retired (-> published again).
 * Only published and retired entries enter the published index; retired ones stay
 * resolvable for designs that pin them but are no longer offered in the catalog.
 * A published (id, version) is immutable: any content change needs a new version.
 */
import { createHash } from "node:crypto";
import type { MaterialManifest, ModelManifest } from "../schema/catalog";
import { verifyGenerated } from "./generators/verify";

export const STATUSES = ["draft", "review", "published", "retired"] as const;
export type Status = (typeof STATUSES)[number];
export type Action = "submit" | "publish" | "retire" | "reopen" | "return";

/** Legal transitions; anything else is refused. */
const NEXT: Record<Status, Partial<Record<Action, Status>>> = {
  draft: { submit: "review" },
  review: { publish: "published", return: "draft" },
  published: { retire: "retired" },
  retired: { reopen: "published" },
};

export function transition(from: Status, action: Action): Status | null {
  return NEXT[from][action] ?? null;
}

export const statusOf = (m: { status?: Status }): Status => m.status ?? "published";
export const inIndex = (m: { status?: Status }) => statusOf(m) === "published" || statusOf(m) === "retired";
/** What the catalog drawer, swatches and the AI may offer. */
export const offered = (m: { status?: Status }) => statusOf(m) === "published";

type Any = ModelManifest | MaterialManifest;

/** Stable content hash of a manifest, ignoring its lifecycle status (retiring is not a content change). */
export function contentHash(m: Any): string {
  const copy = { ...m } as Record<string, unknown>;
  delete copy.status;
  const canon = (v: unknown): unknown => (Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])])) : v);
  return createHash("sha256").update(JSON.stringify(canon(copy))).digest("hex").slice(0, 16);
}

/** Entries that were published before and whose content changed without a version bump. */
export function immutabilityViolations(previous: Any[], next: Any[]): string[] {
  const prev = new Map(previous.map((m) => [`${m.type}:${m.id}@${m.version}`, contentHash(m)]));
  const out: string[] = [];
  for (const m of next) {
    const key = `${m.type}:${m.id}@${m.version}`;
    const h = prev.get(key);
    if (h && h !== contentHash(m)) out.push(`${key} changed after it was published: bump "version" instead of editing it`);
  }
  // a published version may never disappear (designs pin it): retire it instead
  const now = new Set(next.filter(inIndex).map((m) => `${m.type}:${m.id}@${m.version}`));
  for (const k of prev.keys()) if (!now.has(k)) out.push(`${k} was published and is missing now: retire it instead of deleting it`);
  return out;
}

export type AuditRow = {
  type: "model" | "material"; id: string; version: number; status: Status; name: string; category: string;
  license: string; source: string; preview?: string; issues: string[]; warnings: string[];
};

/**
 * Audit of one manifest against the catalog rules. `exists` checks a published file path
 * (relative to public/studio/catalog); `materials` lets slot defaults be checked.
 */
export function auditManifest(m: Any, exists: (rel: string) => boolean, materials: MaterialManifest[] = []): AuditRow {
  const issues: string[] = [], warnings: string[] = [];
  const lic = m.license;
  if (lic.spdx === "CC-BY-4.0" && !lic.attributionText) issues.push("CC-BY needs attribution text");
  if (!/^https?:\/\//.test(lic.sourceUrl)) issues.push("license source must be a URL");
  if (m.type === "model") {
    if (m.assets.glb && !exists(m.assets.glb)) issues.push(`missing GLB ${m.assets.glb}`);
    if (!exists(m.assets.preview)) issues.push(`missing preview ${m.assets.preview}`);
    if (!m.styles.length) issues.push("no style tags");
    for (const s of m.slots) {
      if (!s.default) continue;
      const mat = materials.find((x) => x.id === s.default!.id && x.version === s.default!.version);
      if (!mat) issues.push(`slot ${s.id}: default material ${s.default.id}@${s.default.version} is not in the catalog`);
      else if (!s.allowed.includes(mat.category)) issues.push(`slot ${s.id}: default material is a ${mat.category}, not allowed here`);
      else if (!offered(mat)) warnings.push(`slot ${s.id}: default material is ${statusOf(mat)}`);
    }
    for (const s of m.slots) if (!materials.some((x) => offered(x) && s.allowed.includes(x.category))) warnings.push(`slot ${s.id}: no published material can be chosen`);
    issues.push(...verifyGenerated(m));
    if (m.license.spdx !== "HAVENIQ-ORIGINAL" && m.license.sourceUrl.includes("haveniq.local")) issues.push("third-party license with a HAVENIQ source URL");
  } else {
    for (const f of Object.values(m.pbr.maps)) if (f && !exists(`${m.id}/${m.version}/${f}`)) issues.push(`missing texture ${f}`);
    if (!m.pbr.maps.albedo) warnings.push("flat colour (no textures)");
  }
  return {
    type: m.type, id: m.id, version: m.version, status: statusOf(m), name: m.name.en, category: m.category,
    license: lic.spdx, source: lic.sourceUrl, preview: m.type === "model" ? m.assets.preview : undefined, issues, warnings,
  };
}
