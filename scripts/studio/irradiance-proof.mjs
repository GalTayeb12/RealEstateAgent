#!/usr/bin/env node
/**
 * Irradiance proof (Design Studio M2).
 *
 * Claim: the shell lightmap stores irradiance, not surface colour, so wall and
 * floor materials can be swapped at runtime without re-baking.
 *
 * Method: bake the empty shell three times at the same settings -
 *   base   original materials, seed 0
 *   noise  original materials, seed 1   (Monte-Carlo + denoiser noise floor)
 *   alt    floor -> dark walnut, walls -> deep green, seed 0 (studio_variant.py)
 * then compare lit texels. If colour were baked in, the dark variant would be
 * several times darker. Light bouncing off darker surfaces legitimately shifts
 * the indirect part a little, so the pre-registered pass rule is:
 *   median relative change (base vs alt) <= 0.20  AND  p95 <= 0.60
 * whereas the albedo luminance dropped by far more than 4x.
 *
 * Variants (pass thresholds fixed BEFORE the numbers were seen):
 *   extreme   albedo ~9x darker  : median <= 0.20 and p95 <= 0.60   (stress test; bounce light changes a lot)
 *   moderate  albedo ~1.6-2.5x   : median <= 0.15 and p95 <= 0.50   (a realistic material swap)
 * Base and noise bakes are reused when already present (--force to redo).
 *
 *   node scripts/studio/irradiance-proof.mjs <slug> [--variant=extreme|moderate] [--size=2048] [--samples=256] [--out=result.json]
 *
 * Needs the shell built first: node scripts/twin/build-walk.mjs yarkon <slug> --shell-only --preview
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "../..");
const args = process.argv.slice(2);
const flag = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split("=")[1];
const slug = args.find((a) => !a.startsWith("--"));
if (!slug) { console.error("usage: node scripts/studio/irradiance-proof.mjs <slug> [--size=2048] [--samples=256]"); process.exit(2); }
const BLENDER = process.env.BLENDER ?? "C:/Program Files/Blender Foundation/Blender 5.3/blender.exe";
const ASSETS = process.env.ASSETS_SRC ?? (fs.existsSync(path.join(ROOT, "assets-src")) ? path.join(ROOT, "assets-src") : "C:/RealEstateAgent/assets-src");
const SRC = path.join(ASSETS, slug);
const BLEND = path.join(SRC, "blender/twin_walk.blend");
const variant = flag("variant", "extreme");
const RULES = { extreme: { median: 0.2, p95: 0.6 }, moderate: { median: 0.15, p95: 0.5 } };
if (!RULES[variant]) { console.error("unknown variant", variant); process.exit(2); }
const ALT = path.join(SRC, `blender/twin_walk_alt-${variant}.blend`);
const size = Number(flag("size", 2048));
const samples = Number(flag("samples", 256));
if (!fs.existsSync(BLEND)) { console.error("missing", BLEND, "- run the shell build first"); process.exit(1); }

function blender(blend, extra, label) {
  const t = Date.now();
  const r = spawnSync(BLENDER, ["-b", blend, ...extra], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
  if (r.status !== 0) { console.error(r.stdout?.slice(-2000), r.stderr?.slice(-2000)); throw new Error(`${label} failed`); }
  console.log(`✔ ${label} ${((Date.now() - t) / 1000).toFixed(0)}s`);
  return r.stdout;
}
const bake = (blend, name, seed) => {
  const out = path.join(SRC, "proof", name);
  if (fs.existsSync(path.join(out, "LM_A.png")) && !args.includes("--force") && !name.startsWith("alt")) return out;
  fs.mkdirSync(out, { recursive: true });
  const cfg = { out, twin: SRC, lm_size: size, samples, probe_samples: 16, seed, steps: ["realize", "box_uvs", "lm_A", "bake_A"] };
  blender(blend, ["--python", "scripts/blender/apartment_bake.py", "--", JSON.stringify(cfg)], `bake ${name}`);
  return out;
};

const variantLog = blender(BLEND, ["--python", "scripts/blender/studio_variant.py", "--", ALT, variant], "make dark variant");
const albedo = JSON.parse(variantLog.split("\n").find((l) => l.startsWith("ALBEDO")).slice(7));
const dirs = { base: bake(BLEND, "base", 0), noise: bake(BLEND, "noise", 1), alt: bake(ALT, "alt-" + variant, 0) };

const srgbToLin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
async function load(dir) {
  const scale = JSON.parse(fs.readFileSync(path.join(dir, "lightmaps.json"), "utf8")).LM_A.scale;
  const { data, info } = await sharp(path.join(dir, "LM_A.png")).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const lum = new Float32Array(info.width * info.height);
  for (let i = 0; i < lum.length; i++) {
    const r = srgbToLin(data[i * 3] / 255), g = srgbToLin(data[i * 3 + 1] / 255), b = srgbToLin(data[i * 3 + 2] / 255);
    lum[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) * scale;
  }
  return { lum, scale };
}
const [B, N, A] = await Promise.all([load(dirs.base), load(dirs.noise), load(dirs.alt)]);
const q = (arr, f) => arr[Math.min(arr.length - 1, Math.floor(arr.length * f))];
function compare(x, y) {
  const floor = 0.05 * B.scale; // "lit" texels only: skip padding and deep shadow
  const rel = [];
  let sx = 0, sy = 0;
  for (let i = 0; i < x.lum.length; i++) {
    if (B.lum[i] < floor) continue;
    const a = x.lum[i], b = y.lum[i];
    rel.push(Math.abs(a - b) / Math.max(a, b, 1e-6));
    sx += a; sy += b;
  }
  rel.sort((p, c) => p - c);
  return { texels: rel.length, median: +q(rel, 0.5).toFixed(4), p95: +q(rel, 0.95).toFixed(4), meanRatio: +(sy / sx).toFixed(4) };
}
const noise = compare(B, N);
const signal = compare(B, A);
const rule = RULES[variant];
const pass = signal.median <= rule.median && signal.p95 <= rule.p95;
const result = { slug, variant, size, samples, albedo, noise, signal, rule: `median<=${rule.median} && p95<=${rule.p95}`, pass };
console.log(JSON.stringify(result, null, 2));
const out = args.find((a) => a.startsWith("--out="))?.slice(6);
if (out) fs.writeFileSync(out, JSON.stringify(result, null, 2));
process.exit(pass ? 0 : 3);
