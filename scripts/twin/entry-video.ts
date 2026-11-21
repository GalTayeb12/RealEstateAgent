/**
 * The building → apartment fly-in clip for one apartment type (Seedance 2.0 on
 * Higgsfield): starts on the building picture, ends on the first room still of
 * that apartment, so the apartment shown is the real one.
 *
 *   npx tsx scripts/twin/entry-video.ts <slug> <projectId> [--floor N] [--yes]
 *
 * Without --yes it only shows what it would send and exits: each generation is billed
 * by Higgsfield. Needs HIGGSFIELD_API_KEY in .env.local. Result: public/projects/<slug>/entry.mp4,
 * experience.json updated, and one line per generation in .storage/costs/higgsfield/<projectId>.json.
 */
import dotenv from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getStorage } from "../../lib/storage";
import { STAGE_EXTS, stageKey } from "../../lib/stage";
import { entryVideoRequest, generateVideo, uploadImage } from "../../lib/higgsfield";

dotenv.config({ path: ".env.local" });
dotenv.config();

const args = process.argv.slice(2);
const flag = (k: string) => args.includes(k);
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const [slug, projectId] = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--floor");
if (!slug || !projectId) { console.error("usage: npx tsx scripts/twin/entry-video.ts <slug> <projectId> [--floor N] [--yes]"); process.exit(2); }
const floor = opt("--floor") ? Number(opt("--floor")) : undefined;

const TYPES: Record<string, string> = { webp: "image/webp", jpg: "image/jpeg", png: "image/png" };

async function main() {
  const storage = getStorage();
  // start picture: the lights-off view when there is one (the lights "switch on" in the clip), else the night one
  let start: { bytes: Buffer; ext: string; name: string } | null = null;
  for (const kind of ["off", "on"]) {
    for (const ext of STAGE_EXTS) {
      const bytes = await storage.get(stageKey(projectId, `${kind}.${ext}`));
      if (bytes) { start = { bytes, ext, name: `${kind}.${ext}` }; break; }
    }
    if (start) break;
  }
  if (!start) { console.error(`no building image for project ${projectId} (upload it on the stage page first)`); process.exit(1); }

  const expFile = path.join("public", "projects", slug, "experience.json");
  if (!existsSync(expFile)) { console.error(`no experience for ${slug}: build the apartment first`); process.exit(1); }
  const exp = JSON.parse(readFileSync(expFile, "utf8"));
  const endPath: string | undefined = exp.photoStage?.enter?.room;
  if (!endPath) { console.error("the apartment has no room pictures yet (the stills step has not run)"); process.exit(1); }
  const endFile = path.join("public", endPath);
  if (!existsSync(endFile)) { console.error(`missing ${endFile}`); process.exit(1); }
  const endExt = path.extname(endFile).slice(1);

  console.log(`apartment: ${slug}\nstart:     ${start.name} (${Math.round(start.bytes.length / 1024)} KB)\nend:       ${endPath}\nmodel:     bytedance/seedance-2.0/image-to-video, 8 s, 720p${floor ? `, floor ${floor}` : ""}`);
  if (!flag("--yes")) { console.log("\nNothing was sent. Higgsfield bills each generation; run again with --yes to generate."); return; }

  const key = process.env.HIGGSFIELD_API_KEY?.trim();
  if (!key) { console.error("HIGGSFIELD_API_KEY is not set in .env.local"); process.exit(1); }

  console.log("uploading the two pictures…");
  const startUrl = await uploadImage(start.bytes, TYPES[start.ext], { key });
  const endUrl = await uploadImage(readFileSync(endFile), TYPES[endExt] ?? "image/webp", { key });
  console.log("generating (usually 1-3 minutes)…");
  const result = await generateVideo(entryVideoRequest(startUrl, endUrl, { floor }), { key, pollMs: 4000 });

  const video = Buffer.from(await (await fetch(result.videoUrl)).arrayBuffer());
  const outDir = path.join("public", "projects", slug);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "entry.mp4"), video);

  exp.photoStage.enter.video = `/projects/${slug}/entry.mp4`;
  exp.photoStage.enter.wide = true;
  writeFileSync(expFile, JSON.stringify(exp, null, 2) + "\n");

  const ledgerKey = `costs/higgsfield/${projectId}.json`;
  const prev = await storage.get(ledgerKey);
  const rows = prev ? (JSON.parse(prev.toString("utf8")) as unknown[]) : [];
  rows.push({ at: new Date().toISOString(), slug, model: result.model, requestId: result.requestId, duration: 8, resolution: "720p" });
  await storage.put(ledgerKey, new TextEncoder().encode(JSON.stringify(rows, null, 2)), { contentType: "application/json" });
  console.log(`done: ${outDir}/entry.mp4 (${Math.round(video.length / 1024)} KB), generations for this project so far: ${rows.length}`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
