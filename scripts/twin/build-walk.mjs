#!/usr/bin/env node
/**
 * Plan twin → walkthrough assets, end to end (headless Blender).
 *
 *   node scripts/twin/build-walk.mjs <source> <slug> [--preview] [--from <step>] [--only <step>]
 *
 * <source>: fixture name (yarkon, tlv3), architect .dxf, or twin .json — see export-twin.ts.
 * Steps (all by default; "stills" renders the room pictures of the building page):
 *   export  twin.json + layout.json         → assets-src/<slug>/
 *   build   shell + furniture (twin_build.py, twin_furnish.py) from the base .blend
 *                                           → assets-src/<slug>/blender/twin_walk.blend
 *   bake    lightmaps, probes, sky, collision, GLB (apartment_bake.py)
 *                                           → assets-src/<slug>/walk/  (+ twin_walk_baked.blend)
 *   pack    gltf-transform + WebP + walk.json (build-walk-assets.mjs --twin)
 *                                           → public/walk/<slug>/
 * --preview bakes at 2048² / 256 spp (minutes) instead of 4096² / 2048 spp.
 * --shell-only (Design Studio) builds the EMPTY apartment: no furniture, every paintable surface
 * gets its own "S|<surfaceId>" material (studio_shell.py), one lightmap atlas (group A) that
 * holds irradiance only. The slug must end in "-shell" so existing walk assets are never touched.
 *
 * Env: BLENDER (blender.exe), ASSETS_SRC (default C:/RealEstateAgent/assets-src, shared by
 * worktrees), BASE_BLEND (default <ASSETS_SRC>/yarkon-v2/blender/apartment.blend: the Poly
 * Haven materials, furniture assets and sky HDRI).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "../..");
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const pos = argv.filter((a, i) => !a.startsWith("--") && !["--from", "--only"].includes(argv[i - 1]));
const [source, slug] = pos;
if (!source || !slug) {
  console.error("usage: node scripts/twin/build-walk.mjs <fixture|plan.dxf|twin.json> <slug> [--preview] [--from step] [--only step]");
  process.exit(2);
}
const PREVIEW = argv.includes("--preview");
const SHELL = argv.includes("--shell-only");
if (SHELL && !slug.endsWith("-shell")) {
  console.error("--shell-only writes a new asset set: the slug must end in '-shell' (e.g. yarkon-twin-shell)");
  process.exit(2);
}
const BLENDER = process.env.BLENDER ?? "C:/Program Files/Blender Foundation/Blender 5.3/blender.exe";
const SRC = path.join(process.env.ASSETS_SRC ?? (fs.existsSync(path.join(ROOT, "assets-src")) ? path.join(ROOT, "assets-src") : "C:/RealEstateAgent/assets-src"), slug);
const BASE = process.env.BASE_BLEND ?? path.join(path.dirname(SRC), "yarkon-v2/blender/apartment.blend");
const BLEND = path.join(SRC, "blender/twin_walk.blend");
const OUT = path.join(ROOT, "public/walk", slug);
const STEPS = ["export", "build", "stills", "bake", "pack"];
const from = opt("--from"), only = opt("--only");
const run = STEPS.filter((s, i) => (only ? s === only : i >= (from ? STEPS.indexOf(from) : 0))).filter((s) => !(SHELL && s === "stills"));

function sh(cmd, args, label) {
  const t = Date.now();
  console.log(`\n▶ ${label}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT, shell: cmd === npx });
  const s = ((Date.now() - t) / 1000).toFixed(0);
  if (r.status !== 0) { console.error(`✖ ${label} failed (${s}s)`); process.exit(r.status ?? 1); }
  console.log(`✔ ${label} ${s}s`);
  return Number(s);
}
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const times = {};
for (const step of run) {
  if (step === "export")
    times.export = sh(npx, ["tsx", "scripts/twin/export-twin.ts", source, SRC], "export twin");
  if (step === "build") {
    times.build = sh(BLENDER, ["-b", BASE, "--python", "scripts/blender/twin_build.py", "--", SRC, BLEND, ...(SHELL ? ["--no-furnish"] : [])], SHELL ? "build empty shell" : "build shell + furniture");
    if (SHELL) times.surfaces = sh(BLENDER, ["-b", BLEND, "--python", "scripts/blender/studio_shell.py", "--", SRC, BLEND], "split surface materials");
  }
  if (step === "stills") {
    // room pictures + plan view + cutaway for the building page (before the bake: the shell blend is enough)
    const dir = path.join(SRC, "stills");
    times.stills = sh(BLENDER, ["-b", BLEND, "--python", "scripts/blender/twin_stills.py", "--", SRC, dir, PREVIEW ? "48" : "128"], "render stills");
    times.stillsWebp = sh(npx, ["tsx", "scripts/twin/stills-to-web.ts", dir, path.join(OUT, "stills")], "stills to WebP");
  }
  if (step === "bake") {
    const cfg = { out: path.join(SRC, "walk"), twin: SRC, ...(SHELL ? { steps: ["realize", "box_uvs", "lm_A", "bake_A", "probes", "sky", "collision", "export"] } : {}), ...(PREVIEW ? { lm_size: 2048, samples: 256, probe_samples: 64 } : { lm_size: 4096, samples: 2048, probe_samples: 256 }) };
    times.bake = sh(BLENDER, ["-b", BLEND, "--python", "scripts/blender/apartment_bake.py", "--python-expr",
      `import bpy; bpy.ops.wm.save_as_mainfile(filepath=${JSON.stringify(BLEND.replace(/\.blend$/, "_baked.blend"))})`,
      "--", JSON.stringify(cfg)], `bake (${PREVIEW ? "preview" : "final"})`);
  }
  if (step === "pack")
    times.pack = sh(npx, ["tsx", "scripts/blender/build-walk-assets.mjs", path.join(SRC, "walk"), OUT, "--twin", SRC, ...(SHELL ? ["--shell"] : [])], "pack for the web");
}
console.log("\ntimes (s):", JSON.stringify(times));
