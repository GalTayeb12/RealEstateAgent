/**
 * Server-only file access for catalog administration: reads every manifest in
 * catalog/manifests (all lifecycle states) and audits it against the published files.
 * Writing a status is allowed only when STUDIO_CATALOG_WRITE=1 (local / dev machines):
 * manifests live in git, so production servers never edit them.
 */
import fs from "node:fs";
import path from "node:path";
import { MaterialManifest, ModelManifest } from "../schema/catalog";
import { auditManifest, statusOf, transition, type Action, type AuditRow } from "./admin";

const ROOT = process.cwd();
const DIR = path.join(ROOT, "catalog/manifests");
const PUB = path.join(ROOT, "public/studio/catalog");

export const catalogWritable = () => process.env.STUDIO_CATALOG_WRITE === "1";

type Entry = { file: string; raw: Record<string, unknown>; manifest: ModelManifest | MaterialManifest | null; error?: string };

export function readManifests(): Entry[] {
  return fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort().map((file) => {
    const raw = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"));
    const clean = { ...raw };
    delete clean._note;
    const parsed = (clean.type === "model" ? ModelManifest : MaterialManifest).safeParse(clean);
    return parsed.success ? { file, raw, manifest: parsed.data } : { file, raw, manifest: null, error: parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ") };
  });
}

export function auditAll(): { rows: AuditRow[]; invalid: { file: string; error: string }[] } {
  const entries = readManifests();
  const materials = entries.map((e) => e.manifest).filter((m): m is MaterialManifest => !!m && m.type === "material");
  const exists = (rel: string) => fs.existsSync(path.join(PUB, rel));
  return {
    rows: entries.filter((e) => e.manifest).map((e) => auditManifest(e.manifest!, exists, materials)),
    invalid: entries.filter((e) => !e.manifest).map((e) => ({ file: e.file, error: e.error ?? "invalid" })),
  };
}

/** Applies a lifecycle action to one manifest file. Refuses illegal transitions and publishing an entry with issues. */
export function applyAction(type: "model" | "material", id: string, version: number, action: Action): { ok: true; status: string } | { ok: false; error: string } {
  if (!catalogWritable()) return { ok: false, error: "Catalog editing is disabled on this server (set STUDIO_CATALOG_WRITE=1 on a dev machine)." };
  const entry = readManifests().find((e) => e.manifest && e.manifest.type === type && e.manifest.id === id && e.manifest.version === version);
  if (!entry || !entry.manifest) return { ok: false, error: "Not found." };
  const next = transition(statusOf(entry.manifest), action);
  if (!next) return { ok: false, error: `Cannot ${action} an entry that is ${statusOf(entry.manifest)}.` };
  if (next === "published") {
    const row = auditAll().rows.find((r) => r.type === type && r.id === id && r.version === version);
    if (row && row.issues.length) return { ok: false, error: `Fix first: ${row.issues[0]}` };
  }
  fs.writeFileSync(path.join(DIR, entry.file), JSON.stringify({ ...entry.raw, status: next }, null, 2) + "\n");
  return { ok: true, status: next };
}
