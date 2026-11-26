/**
 * Writes the developer's starting design for an apartment: public/walk/<slug>/seed-design.json.
 * The studio opens it for a visitor who has no saved design yet, and "Developer's design" returns to it.
 *
 *   npx tsx scripts/studio/make-seed.mts <slug>
 *
 * Today the layout is composed with the same deterministic planner the free AI designer uses (living
 * room group, L-shaped kitchen, bedrooms, a work corner), compiled and validated against the
 * apartment's own baseline with the editor's rules, so it can only contain legal, published pieces.
 * A developer-authored design will replace this file without any code change (same format).
 */
import fs from "node:fs";
import path from "node:path";
import type { Baseline } from "../../lib/studio/baseline/fromTwin";
import { apply } from "../../lib/studio/commands/apply";
import { compilePlan } from "../../lib/studio/ai/compile";
import { dryRunPlan } from "../../lib/studio/ai/dryrun";
import { catalogFrom, MaterialManifest, ModelManifest } from "../../lib/studio/schema/catalog";
import { DesignDocument, emptyDocument } from "../../lib/studio/schema/document";
import { validateProposals } from "../../lib/studio/validation/architecture";
import { errorsOf, validateDocument } from "../../lib/studio/validation/placement";

const slug = process.argv[2];
if (!slug) { console.error("usage: npx tsx scripts/studio/make-seed.mts <slug>"); process.exit(2); }
const dir = path.join("public", "walk", slug);
const file = JSON.parse(fs.readFileSync(path.join(dir, "baseline.json"), "utf8")) as { id: string; version: number; baseline: Baseline };
const index = JSON.parse(fs.readFileSync("public/studio/catalog/index.json", "utf8")) as { models: unknown[]; materials: unknown[] };
const models = index.models.map((m) => ModelManifest.parse(m));
const materials = index.materials.map((m) => MaterialManifest.parse(m));
const catalog = catalogFrom(models, materials);
const ref = { id: file.id, version: file.version, twinHash: file.baseline.twinHash };

// each request is one room; the rooms an apartment does not have are simply dropped by the compiler
const REQUESTS = [
  "Furnish the living room",
  "L-shaped kitchen",
  "master bedroom with a bed and a wardrobe",
  "bedroom 2 with a bed and a wardrobe",
  "bedroom 3 as a home office with a desk and shelves reading corner",
];

let n = 0;
const newId = () => `seed-${++n}`;
let doc = emptyDocument(ref, "Developer's design");
for (const req of REQUESTS) {
  const p = compilePlan(dryRunPlan(req), { doc, baseline: file.baseline, catalog, models, materials, newId });
  if (p.command) doc = apply(doc, p.command, { baseline: file.baseline, catalog }).doc;
  console.log(`${req}: +${p.added.length} pieces${p.dropped.length ? `, dropped ${p.dropped.map((d) => `${d.reason}`).join(",")}` : ""}`);
}
const errors = [...errorsOf(validateDocument(doc, file.baseline, catalog)), ...errorsOf(validateProposals(doc, file.baseline, catalog))];
if (errors.length) { console.error("seed has errors:", errors); process.exit(1); }
DesignDocument.parse(doc);
fs.writeFileSync(path.join(dir, "seed-design.json"), JSON.stringify(doc));
console.log(`seed ${slug}: ${Object.keys(doc.nodes).length} pieces, ${Object.keys(doc.overrides).length} surface overrides`);
