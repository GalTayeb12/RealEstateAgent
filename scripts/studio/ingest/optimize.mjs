#!/usr/bin/env node
/**
 * Design Studio asset optimizer (pipeline v0): raw normalized GLB -> web GLB.
 *
 *   node scripts/studio/ingest/optimize.mjs <raw.glb> <out.glb> [--tex=1024] [--ratio=1]
 *
 * dedup (names kept: material slots are addressed by name) -> weld -> optional
 * simplify -> WebP textures (max --tex px) -> meshopt. Prints a JSON report.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, weld, simplify, textureCompress, meshopt } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";

const [src, out] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flag = (k, d) => Number((process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split("=")[1]);
if (!src || !out) { console.error("usage: node optimize.mjs <raw.glb> <out.glb> [--tex=1024] [--ratio=1]"); process.exit(2); }
const TEX = flag("tex", 1024);
const RATIO = flag("ratio", 1);

// two sharp copies in one process clash on Windows (libvips): use the one ndarray-pixels bundles
const require = createRequire(import.meta.url);
const sharp = (() => {
  try { return require(require.resolve("sharp", { paths: [path.dirname(require.resolve("ndarray-pixels"))] })); }
  catch { return require("sharp"); }
})();

await MeshoptDecoder.ready; await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(src);
const steps = [dedup({ keepUniqueNames: true }), prune({ keepAttributes: true }), weld()];
if (RATIO < 1) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio: RATIO, error: 0.001 }));
steps.push(textureCompress({ encoder: sharp, targetFormat: "webp", quality: 85, resize: [TEX, TEX] }), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
await doc.transform(...steps);
fs.mkdirSync(path.dirname(out), { recursive: true });
await io.write(out, doc);

let tris = 0;
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3;
console.log(JSON.stringify({
  file: out, mb: +(fs.statSync(out).size / 1048576).toFixed(2), triangles: Math.round(tris),
  materials: doc.getRoot().listMaterials().map((m) => m.getName()),
  textures: doc.getRoot().listTextures().length,
}));
