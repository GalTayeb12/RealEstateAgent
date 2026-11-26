#!/usr/bin/env node
/**
 * Normalizes a downloaded glTF (e.g. Poly Haven, already in real metres) to the catalog
 * contract WITHOUT scaling: optional turn about the vertical axis so the front faces -Z,
 * then a translation so the item stands on the floor (y = 0), is centred left-right and
 * has its back at z = 0 (front towards -z). Writes a raw GLB plus <out>.json with the
 * measured size and the material names (slot targets).
 *
 *   node scripts/studio/ingest/normalize-gltf.mjs <in.gltf> <out.glb> [--rot=180]
 */
import fs from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { getBounds } from "@gltf-transform/functions";

const args = process.argv.slice(2);
const [src, out] = args.filter((a) => !a.startsWith("--"));
const rot = Number((args.find((a) => a.startsWith("--rot=")) ?? "--rot=180").split("=")[1]);
if (!src || !out) { console.error("usage: normalize-gltf.mjs <in.gltf> <out.glb> [--rot=deg]"); process.exit(2); }

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
const root = doc.createNode("item");
for (const c of scene.listChildren()) { scene.removeChild(c); root.addChild(c); }
scene.addChild(root);
const t = (rot * Math.PI) / 180;
root.setRotation([0, Math.sin(t / 2), 0, Math.cos(t / 2)]);
const b = getBounds(scene);
root.setTranslation([-(b.min[0] + b.max[0]) / 2, -b.min[1], -b.max[2]]);
const n = getBounds(scene);
const size = { w: +(n.max[0] - n.min[0]).toFixed(3), h: +(n.max[1] - n.min[1]).toFixed(3), d: +(n.max[2] - n.min[2]).toFixed(3) };
await io.write(out, doc);
const materials = doc.getRoot().listMaterials().map((m) => m.getName());
fs.writeFileSync(out.replace(/\.glb$/, ".json"), JSON.stringify({ size, materials, rot, min: n.min, max: n.max }, null, 2));
console.log(JSON.stringify({ out, size, materials }));
