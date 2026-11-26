/**
 * LIVE test of the AI designer against the real Claude API (paid; run only with the owner's approval).
 *   npx tsx scripts/studio/live-ai.mts <slug> "<request>" ["<request>" ...]
 * Reads ANTHROPIC_API_KEY from .env.local (never printed). Each request is one API call on an empty apartment;
 * prints what Claude proposed, what the compiler kept/dropped, and the validation verdict.
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import type { Baseline } from "../../lib/studio/baseline/fromTwin";
import { runDesigner } from "../../lib/studio/ai/designer";
import { catalogFrom, MaterialManifest, ModelManifest } from "../../lib/studio/schema/catalog";
import { emptyDocument } from "../../lib/studio/schema/document";

dotenv.config({ path: ".env.local", quiet: true });
const [slug, ...requests] = process.argv.slice(2);
if (!slug || !requests.length) { console.error('usage: live-ai.mts <slug> "<request>"...'); process.exit(2); }
if (!process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY is not set"); process.exit(2); }
const file = JSON.parse(fs.readFileSync(path.join("public/walk", slug, "baseline.json"), "utf8")) as { id: string; version: number; baseline: Baseline };
const index = JSON.parse(fs.readFileSync("public/studio/catalog/index.json", "utf8")) as { models: unknown[]; materials: unknown[] };
const models = index.models.map((m) => ModelManifest.parse(m));
const materials = index.materials.map((m) => MaterialManifest.parse(m));
const catalog = catalogFrom(models, materials);
const doc = emptyDocument({ id: file.id, version: file.version, twinHash: file.baseline.twinHash }, "live test");

for (const prompt of requests) {
  const lang = /[֐-׿]/.test(prompt) ? "he" : "en";
  const t0 = Date.now();
  const r = await runDesigner({ prompt, lang, doc, baseline: file.baseline, catalog, models, materials }, "claude");
  const p = r.proposal;
  console.log(`\n■ [${slug}] ${prompt}\n  ${((Date.now() - t0) / 1000).toFixed(1)} s${r.error ? `  ERROR: ${r.error}` : ""}`);
  console.log(`  summary: ${p.summary}`);
  const adds = (p.command?.commands ?? []) as { type: string; node?: { catalog?: { id: string }; transform?: { x: number; y: number } } }[];
  console.log(`  added ${p.added.length}: ${adds.filter((c) => c.type === "add").map((c) => c.node?.catalog?.id ?? "?").join(", ")}; changed ${p.changed.length}, surfaces ${p.surfaces.length}`);
  if (p.dropped.length) console.log(`  dropped ${p.dropped.length}: ${p.dropped.map((d) => `${d.reason}(${(d as { detail?: string }).detail ?? ""})`).join("; ")}`);
  console.log(`  advisories: ${p.advisories.length}${p.advisories.length ? " " + [...new Set(p.advisories.map((a) => a.code))].join(",") : ""}`);
}
