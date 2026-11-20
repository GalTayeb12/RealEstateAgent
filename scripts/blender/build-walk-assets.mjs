#!/usr/bin/env node
/**
 * Seed Yarkon walkthrough — pack the Blender bake for the web.
 *
 * In:  assets-src/yarkon-v2/walk/   (written by apartment_bake.py, not in git)
 *        apartment_raw.glb, LM_A.png, LM_B.png, probe_<room>.png, sky.png,
 *        lightmaps.json (decode scales), collision.json
 * Out: public/walk/yarkon-v2/
 *        apartment.glb      meshopt geometry + WebP textures (≤ ~25 MB)
 *        lm-A.webp/-B.webp  4096² lightmaps (desktop), lm-A-2k / lm-B-2k (mobile)
 *        probe-<room>.webp  1024×512 equirect reflection probes
 *        sky.webp           equirect sky backdrop
 *        walk.json          scales, rooms, collision boxes, spawn
 *
 * Usage: node scripts/blender/build-walk-assets.mjs [srcDir] [outDir]
 *        npx tsx scripts/blender/build-walk-assets.mjs <srcDir> <outDir> --twin <twinDir>
 *
 * With --twin (a folder holding twin.json from scripts/twin/export-twin.ts) the
 * apartment was generated from a plan twin: walk.json is assembled by
 * lib/twin/walk.ts assembleWalk() — rooms, wall boxes and spawn from the twin,
 * furniture boxes and light scales from the bake. Needs tsx to import the .ts.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, weld, textureCompress, meshopt } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "../..");
const flagAt = process.argv.indexOf("--twin");
const TWIN_DIR = flagAt > 0 ? path.resolve(process.argv[flagAt + 1]) : null;
const args = process.argv.slice(2).filter((_, i, a) => a[i] !== "--twin" && a[i - 1] !== "--twin");
const SRC_DIR = path.resolve(args[0] ?? [
  path.join(ROOT, "assets-src/yarkon-v2/walk"),
  "C:/RealEstateAgent/assets-src/yarkon-v2/walk", // worktrees share the main checkout's assets-src
].find((p) => fs.existsSync(p)));
const OUT = path.resolve(args[1] ?? path.join(ROOT, "public/walk/yarkon-v2"));
fs.mkdirSync(OUT, { recursive: true });
// @gltf-transform/functions pulls in ndarray-pixels, which bundles its own sharp; on Windows two
// sharp versions in one process clash over libvips-42.dll, so use that same copy everywhere.
const require = createRequire(import.meta.url);
const sharp = (() => {
  try { return require(require.resolve("sharp", { paths: [path.dirname(require.resolve("ndarray-pixels"))] })); }
  catch { return require("sharp"); }
})();
const mb = (b) => (b / 1048576).toFixed(2) + " MB";

// ── GLB ─────────────────────────────────────────────────────────────────────
await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

const doc = await io.read(path.join(SRC_DIR, "apartment_raw.glb"));
// Big tiled surfaces (floor, plaster, marble, oak) are seen from 30 cm away -> keep their
// colour at 2048; everything else (furniture, normal/roughness maps) at 1024.
const HERO = /(laminate_floor|marble_01|oak_veneer|painted_plaster|terrazzo|rectangular_parquet)_(Diffuse|diff)/i;
await doc.transform(
  dedup(),
  prune({ keepAttributes: true }),  // TEXCOORD_1 (lightmap UVs) looks unused to glTF -- keep it
  weld(),
  textureCompress({ encoder: sharp, targetFormat: "webp", quality: 84, resize: [2048, 2048], pattern: HERO }),
  // everything else -> 1024 WebP
  textureCompress({ encoder: sharp, targetFormat: "webp", quality: 80, resize: [1024, 1024],
    pattern: new RegExp(`^(?!.*${HERO.source}).*$`, "i") }),
  meshopt({ encoder: MeshoptEncoder, level: "medium" }),
);
const glbOut = path.join(OUT, "apartment.glb");
await io.write(glbOut, doc);
console.log("apartment.glb", mb(fs.statSync(glbOut).size));

// ── lightmaps, probes, sky ──────────────────────────────────────────────────
const meta = JSON.parse(fs.readFileSync(path.join(SRC_DIR, "lightmaps.json"), "utf8"));
for (const g of ["A", "B"]) {
  const src = path.join(SRC_DIR, `LM_${g}.png`);
  if (!fs.existsSync(src)) continue;
  await sharp(src).webp({ quality: 90, smartSubsample: true }).toFile(path.join(OUT, `lm-${g}.webp`));
  await sharp(src).resize(2048, 2048).webp({ quality: 88 }).toFile(path.join(OUT, `lm-${g}-2k.webp`));
  console.log(`lm-${g}`, mb(fs.statSync(path.join(OUT, `lm-${g}.webp`)).size));
}
const probes = {};
for (const f of fs.readdirSync(SRC_DIR)) {
  const m = f.match(/^probe_(\w+)\.png$/);
  if (!m) continue;
  await sharp(path.join(SRC_DIR, f)).webp({ quality: 85 }).toFile(path.join(OUT, `probe-${m[1]}.webp`));
  probes[m[1]] = meta[`probe_${m[1]}`].scale;
}
if (fs.existsSync(path.join(SRC_DIR, "sky.png"))) {
  await sharp(path.join(SRC_DIR, "sky.png")).webp({ quality: 82 }).toFile(path.join(OUT, "sky.webp"));
}

const col = JSON.parse(fs.readFileSync(path.join(SRC_DIR, "collision.json"), "utf8"));
let walk = {
  lightmaps: { A: meta.LM_A?.scale ?? 1, B: meta.LM_B?.scale ?? 1 },
  probes,
  sky: meta.sky?.scale ?? 1,
  skyRot: meta.sky?.rot_z ?? 0,
  probeAt: col.probes,
  rooms: col.rooms,
  boxes: col.boxes,
  spawn: col.spawn,
};
if (TWIN_DIR) {
  const { assembleWalk } = await import("../../lib/twin/walk.ts");
  const twin = JSON.parse(fs.readFileSync(path.join(TWIN_DIR, "twin.json"), "utf8"));
  walk = assembleWalk(twin, { meta, furniture: col.boxes });
}
fs.writeFileSync(path.join(OUT, "walk.json"), JSON.stringify(walk));
let total = 0;
for (const f of fs.readdirSync(OUT)) total += fs.statSync(path.join(OUT, f)).size;
console.log(path.relative(ROOT, OUT), "total", mb(total));
