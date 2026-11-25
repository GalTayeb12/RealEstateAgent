#!/usr/bin/env node
/**
 * Design Studio material packer: a downloaded PBR set -> web textures + manifest.
 *
 *   node scripts/studio/ingest/material.mjs --src=<dir with <prefix>_Color.jpg ...> --prefix=WoodFloor062_2K-JPG \
 *        --id=parquet-oak-light --category=parquet --name-en="Light oak parquet" --name-he="פרקט אלון בהיר" \
 *        --tile=1.0,1.0 --source=https://ambientcg.com/view?id=WoodFloor062 --author=ambientCG [--max=2048] [--metal=0] [--styles=japandi,scandinavian]
 *
 * Writes public/studio/catalog/<id>/1/{albedo,normal,orm}.webp (ORM: R = ambient occlusion
 * or white, G = roughness, B = metalness, the glTF convention three.js reads) and
 * catalog/manifests/<id>@1.json. Normal maps must be OpenGL (+Y up): the *_NormalGL file is used.
 * Run `npx tsx scripts/studio/ingest/publish.mts` afterwards to refresh the published snapshot.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const a = Object.fromEntries(process.argv.slice(2).filter((x) => x.startsWith("--")).map((x) => { const i = x.indexOf("="); return [x.slice(2, i < 0 ? undefined : i), i < 0 ? "1" : x.slice(i + 1)]; }));
// colour grading flags: --saturation --brightness --hue (degrees)
for (const k of ["src", "prefix", "id", "category", "name-en", "tile", "source"]) if (!a[k]) { console.error(`missing --${k}`); process.exit(2); }
const MAX = Number(a.max ?? 2048);
const METAL = Number(a.metal ?? 0);
const ROOT = path.resolve(import.meta.dirname, "../../..");
const out = path.join(ROOT, "public/studio/catalog", a.id, "1");
fs.mkdirSync(out, { recursive: true });
const f = (suffix) => { const p = path.join(a.src, `${a.prefix}_${suffix}.jpg`); return fs.existsSync(p) ? p : null; };

const color = f("Color"), normal = f("NormalGL"), rough = f("Roughness"), ao = f("AmbientOcclusion");
if (!color || !normal || !rough) { console.error("need Color, NormalGL and Roughness maps in", a.src); process.exit(1); }
const meta = await sharp(color).metadata();
const W = Math.min(MAX, meta.width);
const H = Math.round((meta.height * W) / meta.width); // keep the source aspect (some sets are 2:1)
const rs = (p) => sharp(p).resize(W, H, { fit: "fill" });
// optional colour grade of the albedo only (e.g. a less orange oak): --saturation=0.6 --brightness=1.1 --hue=0 --warm=0.04
const SAT = Number(a.saturation ?? 1), BRI = Number(a.brightness ?? 1), HUE = Number(a.hue ?? 0);

await rs(color).modulate({ saturation: SAT, brightness: BRI, hue: HUE }).webp({ quality: 86 }).toFile(path.join(out, "albedo.webp"));
await rs(normal).webp({ quality: 92 }).toFile(path.join(out, "normal.webp"));
const R = ao ? await rs(ao).greyscale().raw().toBuffer() : Buffer.alloc(W * H, 255);
const G = await rs(rough).greyscale().raw().toBuffer();
const px = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H; i++) { px[i * 3] = R[i]; px[i * 3 + 1] = G[i]; px[i * 3 + 2] = Math.round(METAL * 255); }
await sharp(px, { raw: { width: W, height: H, channels: 3 } }).webp({ quality: 88 }).toFile(path.join(out, "orm.webp"));

// average albedo = the flat fallback colour used on Low quality / before textures load
const { channels } = await sharp(path.join(out, "albedo.webp")).stats().then((s) => ({ channels: s.channels.map((c) => Math.round(c.mean)) })); // from the graded output (stats() ignores pipeline operations)
const hex = "#" + channels.slice(0, 3).map((c) => c.toString(16).padStart(2, "0")).join("");
const roughMean = (await sharp(rough).greyscale().stats()).channels[0].mean / 255;
const [tu, tv] = a.tile.split(",").map(Number);
const manifest = {
  type: "material", id: a.id, version: 1,
  name: { he: a["name-he"] ?? a["name-en"], en: a["name-en"] },
  category: a.category,
  styles: (a.styles ?? "").split(",").filter(Boolean),
  tileSize: [tu, tv ?? tu],
  pbr: { baseColor: hex, roughness: +roughMean.toFixed(2), metalness: METAL, maps: { albedo: "albedo.webp", normal: "normal.webp", orm: "orm.webp" } },
  license: { spdx: "CC0-1.0", sourceUrl: a.source, author: a.author ?? "ambientCG", retrievedAt: new Date().toISOString().slice(0, 10) },
};
fs.writeFileSync(path.join(ROOT, "catalog/manifests", `${a.id}@1.json`), JSON.stringify(manifest, null, 2));
const total = fs.readdirSync(out).reduce((s, n) => s + fs.statSync(path.join(out, n)).size, 0);
console.log(JSON.stringify({ id: a.id, size: `${W}x${H}`, sourceSize: `${meta.width}x${meta.height}`, kb: Math.round(total / 1024), baseColor: hex, roughness: manifest.pbr.roughness }));
