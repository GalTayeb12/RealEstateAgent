#!/usr/bin/env node
// Derives the per-room, per-direction item-light correction from the BAKE (see lib/studio/lighting.ts).
//
//   node scripts/studio/item-light.mjs [slug=yarkon-twin-shell] [--global=<n>] [--lambda=0.03]
//
// For every room with a probe: reads the shell GLB (architecture group "A|<room>|...", lightmap on uv1)
// and the lightmap, takes the area-weighted median lightmap value of the room's surfaces that face INTO
// the room along each world axis (x lightmap scale x the shell's white balance) as the target, computes
// what the probe gives per axis through three's PMREM diffuse lobe, and solves the gain cube that makes
// the corrected probe meet the target. Writes public/studio/lighting/<slug>.json. `global` and the
// per-room `gain`s are kept from an existing file (or --global) and are fitted in the renderer:
// `light-tone.mjs --fit-global`, then `light-tone.mjs --fit-rooms`. Re-run both after a re-bake.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import {
  AXES, AXIS_NAMES, correctedIrradiance, cubeWeights, lobeMatrix, parseItemLight, pmremDiffuseLobe, probeIrradiance, solveCube, srgbToLinear, weightedMedian,
} from "../../lib/studio/lighting.ts";

const slug = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "yarkon-twin-shell";
const globalArg = process.argv.find((a) => a.startsWith("--global="));
const lambda = Number((process.argv.find((a) => a.startsWith("--lambda=")) ?? "--lambda=0.03").split("=")[1]);
const dir = `public/walk/${slug}`;
const outFile = `public/studio/lighting/${slug}.json`;
// must match components/walk/ApartmentWalk.tsx (WHITE_BALANCE applied to the shell's lightmap)
const WHITE_BALANCE = [0.93, 0.98, 1.1];

const walk = JSON.parse(fs.readFileSync(`${dir}/walk.json`, "utf8"));
const rooms = Object.keys(walk.probes);
const baseline = JSON.parse(fs.readFileSync(`${dir}/baseline.json`, "utf8")).baseline;
/** Room polygon (plan metres) by twin room id. */
const polys = Object.fromEntries(Object.values(baseline.rooms).map((r) => [r.twinId, r.polygon]));
const inPoly = (poly, x, y) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
/** A surface counts for a room only if it faces INTO it: a point 20 cm off its centroid along the normal lies inside the room (plan) and below the ceiling. */
const facesInto = (room, cen, n) => {
  const p = [cen[0] + 0.2 * n[0], cen[1] + 0.2 * n[1], cen[2] + 0.2 * n[2]];
  return p[1] > 0.01 && p[1] < baseline.wallHeight - 0.01 && inPoly(polys[room], p[0], -p[2]);
};

// ---- lightmap A (sRGB 8-bit of value / scale) ----
const lm = await sharp(`${dir}/lm-A.webp`).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const LW = lm.info.width, LH = lm.info.height, LD = lm.data;
/** Bilinear lightmap sample at glTF uv (origin top-left), linear RGB x scale. */
function sampleLm(u, v) {

  const x = Math.min(LW - 1, Math.max(0, u * LW - 0.5)), y = Math.min(LH - 1, Math.max(0, v * LH - 0.5));
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(LW - 1, x0 + 1), y1 = Math.min(LH - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const out = [0, 0, 0];
  for (const [xx, yy, w] of [[x0, y0, (1 - fx) * (1 - fy)], [x1, y0, fx * (1 - fy)], [x0, y1, (1 - fx) * fy], [x1, y1, fx * fy]]) {
    const i = (yy * LW + xx) * 3;
    for (let c = 0; c < 3; c++) out[c] += srgbToLinear(LD[i + c]) * w;
  }
  return out.map((v, c) => v * walk.lightmaps.A * WHITE_BALANCE[c]);
}

// ---- shell geometry ----
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const gdoc = await io.read(`${dir}/apartment.glb`);
let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

/** Per room: triangles' {rgb, area, normal}. */
const tris = Object.fromEntries(rooms.map((r) => [r, []]));
let skipped = 0, outward = 0;
for (const node of gdoc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  let n = node, tag = "";
  while (n) { if (n.getName().includes("|")) { tag = n.getName(); break; } n = n.getParentNode?.() ?? null; }
  const [grp, room] = tag.split("|");
  if (grp !== "A" || !tris[room]) continue;
  const M = node.getWorldMatrix();
  const tf = (p) => [M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14]];
  for (const prim of mesh.listPrimitives()) {
    const matName = prim.getMaterial()?.getName() ?? "";
    if (/glass|water/i.test(matName) || (prim.getMaterial()?.getEmissiveFactor?.() ?? [0, 0, 0]).some((v) => v > 0)) { skipped++; continue; }
    const pos = prim.getAttribute("POSITION"), uv = prim.getAttribute("TEXCOORD_1"), nor = prim.getAttribute("NORMAL");
    if (!pos || !uv || !nor) { skipped++; continue; }
    // world normal from the vertex normals (rotation part of the world matrix; renormalised)
    const tn = (v) => { const w = [M[0] * v[0] + M[4] * v[1] + M[8] * v[2], M[1] * v[0] + M[5] * v[1] + M[9] * v[2], M[2] * v[0] + M[6] * v[1] + M[10] * v[2]]; const l = Math.hypot(...w) || 1; return w.map((q) => q / l); };
    const idx = prim.getIndices();
    const count = idx ? idx.getCount() : pos.getCount();
    const at = (i) => (idx ? idx.getScalar(i) : i);
    const P = (i) => tf(pos.getElement(i, [])), U = (i) => uv.getElement(i, []);
    for (let t = 0; t + 2 < count; t += 3) {
      const ia = at(t), ib = at(t + 1), ic = at(t + 2);
      const a = P(ia), b = P(ib), c = P(ic);
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const len = Math.hypot(...cr);
      if (len < 1e-8) continue;
      const area = len / 2;
      const nv = [ia, ib, ic].map((i) => tn(nor.getElement(i, [])));
      const ns0 = [0, 1, 2].map((k) => nv[0][k] + nv[1][k] + nv[2][k]);
      const nl = Math.hypot(...ns0);
      if (nl < 1e-6) continue;
      const nrm = ns0.map((v) => v / nl);
      const cen = [0, 1, 2].map((k) => (a[k] + b[k] + c[k]) / 3);
      if (!facesInto(room, cen, nrm)) { outward++; continue; }
      const ua = U(ia), ub = U(ib), uc = U(ic);
      const ns = Math.max(3, Math.min(200, Math.round(area / 0.004)));
      const sum = [0, 0, 0];
      for (let s = 0; s < ns; s++) {
        let r1 = rand(), r2 = rand();
        if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; }
        const px = sampleLm(ua[0] + r1 * (ub[0] - ua[0]) + r2 * (uc[0] - ua[0]), ua[1] + r1 * (ub[1] - ua[1]) + r2 * (uc[1] - ua[1]));
        for (let k = 0; k < 3; k++) sum[k] += px[k] / ns;
      }
      tris[room].push({ rgb: sum, area, n: nrm });
    }
  }
}

// ---- probes ----
const lobes = new Map();
const lobeFor = (W) => { const lodMax = Math.floor(Math.log2(W / 4)); if (!lobes.has(lodMax)) lobes.set(lodMax, pmremDiffuseLobe(lodMax, 64)); return lobes.get(lodMax); };
async function probeRgb(room) {
  const { data, info } = await sharp(`${dir}/probe-${room}.webp`).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgb = new Float32Array(info.width * info.height * 3);
  for (let i = 0; i < rgb.length; i++) rgb[i] = srgbToLinear(data[i]) * walk.probes[room];
  return { rgb, W: info.width, H: info.height };
}

const prev = fs.existsSync(outFile) ? parseItemLight(JSON.parse(fs.readFileSync(outFile, "utf8"))) : null;
const global = globalArg ? Number(globalArg.split("=")[1]) : prev?.global ?? 1;
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const out = { version: 2, slug, global, globalFrom: globalArg ? "command line" : prev?.globalFrom ?? "not fitted yet", generatedAt: new Date().toISOString(), rooms: {} };

for (const room of rooms) {
  const list = tris[room];
  const target = AXES.map((_, d) => {
    // surfaces mostly facing axis d (cube weight >= 0.5), weighted by area; median is robust to sun patches and downlight scallops
    const sel = list.filter((t) => cubeWeights(...t.n)[d] >= 0.5);
    if (sel.reduce((s, t) => s + t.area, 0) < 0.25) return null; // under 0.25 m2 facing this way: no reliable target
    return [0, 1, 2].map((c) => weightedMedian(sel.map((t) => t.rgb[c]), sel.map((t) => t.area)));
  });
  const { rgb, W, H } = await probeRgb(room);
  // what three.js actually gathers for diffuse light: the PMREM roughness-1 lobe for this probe size, not a cosine
  const M = lobeMatrix(rgb, W, H, lobeFor(W));
  const own = probeIrradiance(M);
  const cube = solveCube(M, target, lambda);
  const got = correctedIrradiance(M, cube);
  out.rooms[room] = {
    cube: cube.map((g) => g.map(r4)),
    gain: prev?.rooms[room]?.gain ?? 1, // fitted in the renderer (light-tone.mjs --fit-rooms); kept across regenerations
    target: target.map((t) => (t ? t.map(r4) : null)),
    probe: own.map((g) => g.map(r4)),
  };
  const lumOf = (v) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  console.log(`${room.padEnd(9)} ${list.length} tris`);
  for (let d = 0; d < 6; d++) {
    const t = target[d];
    console.log(`   ${AXIS_NAMES[d]}  target ${t ? lumOf(t).toFixed(4) : "  -   "}  probe ${lumOf(own[d]).toFixed(4)}  ratio ${t ? (lumOf(t) / lumOf(own[d])).toFixed(2) : "  - "}  -> corrected ${lumOf(got[d]).toFixed(4)}  gain ${cube[d].map((g) => g.toFixed(2)).join("/")}`);
  }
}
if (!parseItemLight(out)) throw new Error("output does not match ItemLightSchema");
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(out, null, 1) + "\n");
console.log(`\nwrote ${outFile} (global ${global}; ${skipped} primitives skipped: glass, emissive or no lightmap UVs; ${outward} triangles not facing into their room)`);
