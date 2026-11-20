/**
 * Parse a PDF or image floor plan into a plan twin with Claude vision.
 *
 *   npx tsx scripts/twin/parse-plan-image.ts <plan.pdf|png|jpg|webp> [outDir]
 *     [--area <m²>] [--page <n>] [--no-tiles] [--note "<text for the model>"]
 *
 * Needs ANTHROPIC_API_KEY (read from .env.local, or the file named by ENV_FILE).
 * Writes <outDir>/twin.json, report.json (validator issues, per-element
 * confidence, scale, notes, token cost), extraction.json (raw model output)
 * and plan.svg. Exit code 1 when the validator reports errors.
 */
import { config } from "dotenv";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { parsePlanImage } from "../../lib/twin/vision";
import { planSvg } from "../../lib/twin/svg";

config({ path: process.env.ENV_FILE ?? ".env.local", quiet: true });

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; };
const area = flag("--area"), page = flag("--page"), note = flag("--note");
const noTiles = args.includes("--no-tiles"); if (noTiles) args.splice(args.indexOf("--no-tiles"), 1);
const [file, outArg] = args;
if (!file) { console.error("usage: npx tsx scripts/twin/parse-plan-image.ts <plan.pdf|png|jpg|webp> [outDir] [--area m2] [--page n] [--no-tiles] [--note text]"); process.exit(2); }
if (!process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY is not set (put it in .env.local or point ENV_FILE at a file that has it)"); process.exit(2); }
const out = outArg ?? join(dirname(file), basename(file).replace(/\.[a-z0-9]+$/i, "") + "-twin");
mkdirSync(out, { recursive: true });

async function main() {
  const t0 = Date.now();
  const res = await parsePlanImage(readFileSync(file), {
    file: basename(file), areaM2: area ? Number(area) : undefined, page: page ? Number(page) : undefined, note, tiles: !noTiles,
  });
  const { twin, report, usage } = res;
  writeFileSync(join(out, "twin.json"), JSON.stringify(twin, null, 2));
  writeFileSync(join(out, "extraction.json"), JSON.stringify(res.extraction, null, 2));
  writeFileSync(join(out, "report.json"), JSON.stringify({ notes: res.notes, scale: res.scale, confidence: res.confidence, usage, views: res.views, ...report }, null, 2));
  writeFileSync(join(out, "plan.svg"), planSvg(twin, { highlight: report.issues.map((i) => i.ref).filter((r): r is string => !!r) }));

  console.log(`${twin.walls.length} walls, ${twin.openings.length} openings, ${twin.rooms.length} rooms, net ${report.netArea} m²`);
  console.log(`scale: ${res.scale.source}, ${(res.scale.mPerPx * 100).toFixed(3)} cm/px, confidence ${res.scale.confidence.toFixed(2)}`);
  console.log(`views: ${res.views.overview.join("×")} overview + ${res.views.tiles} tiles`);
  console.log(`model ${usage.model}: ${usage.inputTokens} in / ${usage.outputTokens} out tokens, $${usage.costUsd.toFixed(3)}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  for (const n of res.notes) console.log(`note: ${n}`);
  for (const i of report.issues) console.log(`${i.level}: ${i.en}`);
  const low = res.confidence.filter((c) => c.score < 0.5);
  if (low.length) console.log(`low confidence: ${low.map((c) => `${c.ref} (${c.score})`).join(", ")}`);
  console.log(report.ok ? "OK" : "ERRORS", "→", out);
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
