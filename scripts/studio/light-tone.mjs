#!/usr/bin/env node
// Shell vs dynamic tone-match measurement (QUALITY_GATES "shell and dynamic tone match").
//
// In every room, paints all walls and a wardrobe with the SAME material (paint-limewash), stands the
// wardrobe flush against a wall WITHOUT openings, and renders the view twice: without and with the
// wardrobe. The item's pixels in the second shot are compared with the same pixels of the bare wall in
// the first shot, so orientation, albedo, camera and tone mapping are identical and only the lighting
// model differs (baked lightmap for the wall vs realtime sun + room probe for the item). A ratio of 1.0
// means the live item reads exactly as bright as the baked wall behind it; per-channel ratios measure
// colour cast. Two wall sets per room face different directions: A is used to fit the single global
// factor (--fit-global), B is held out.
//
//   node scripts/studio/light-tone.mjs [--set=A|B|all] [--tier=high|medium|low] [--neutral]
//        [--base=http://localhost:3001] [--out=docs/design-studio/results/light] [--json=path]
//        [--gate=0.15] [--cast=0.1] [--only=bed2,...]
//   node scripts/studio/light-tone.mjs --fit-global      fit `global` on set A, write it, then measure A and B
//   node scripts/studio/light-tone.mjs --fit-rooms       fit one `gain` per room on set A, write them, then measure A and B (B held out)
// The studio loads public/studio/lighting/<slug>.json; --neutral measures without it (the "before").
// JWT_SECRET comes from the environment, .env.local or .env (same secret as the dev server).
// Exit code 1 when a measurement falls outside the gate (ratio 1 +- gate, cast <= cast gate) or the page errors.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import sharp from "sharp";
import { parseItemLight } from "../../lib/studio/lighting.ts";

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split("=").slice(1).join("=");
const flag = (k) => process.argv.includes(`--${k}`);
const SLUG = "yarkon-twin-shell";
const base = arg("base", "http://localhost:3001");
const tier = arg("tier", "high");
const out = arg("out", "docs/design-studio/results/light");
const jsonOut = arg("json", "");
const gate = Number(arg("gate", "0.15"));
const castGate = Number(arg("cast", "0.1"));
const only = arg("only", "");
const neutral = flag("neutral");
const fitGlobal = flag("fit-global");
const fitRooms = flag("fit-rooms");
const setArg = fitGlobal || fitRooms ? "all" : arg("set", "all");
const calFile = `public/studio/lighting/${SLUG}.json`;

function secret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  for (const f of [".env.local", ".env"]) {
    if (!fs.existsSync(f)) continue;
    const m = fs.readFileSync(f, "utf8").match(/^JWT_SECRET\s*=\s*"?([^"\r\n]*)"?/m);
    if (m && m[1]) return m[1];
  }
  return "studio-bench-dummy";
}

const PI = Math.PI;
// [room, wardrobe x, y (back on the wall face), rot, width, camera x, y, yaw]; rot 0 = front +y (plan),
// PI = front -y, -PI/2 = front +x, PI/2 = front -x; yaw 0 looks +y, PI looks -y, PI/2 looks -x, -PI/2 looks +x.
const SETS = {
  A: [
    ["living", 1.2, 4.53, PI, 1.2, 1.2, 1.7, 0],
    ["master", 10.0, 4.53, PI, 1.2, 10.0, 1.7, 0],
    ["kitchen", 5.8, 8.49, PI, 1.2, 5.8, 5.2, 0],
    ["bed3", 1.2, 4.67, 0, 1.2, 1.2, 7.6, PI],
    ["bed2", 9.7, 4.67, 0, 1.2, 9.7, 7.6, PI],
    ["bath", 14.0, 4.67, 0, 1.2, 14.0, 7.6, PI],
  ],
  B: [
    ["living", 0.01, 2.6, -PI / 2, 1.2, 3.0, 2.6, PI / 2],
    ["master", 14.99, 2.6, PI / 2, 1.2, 12.4, 2.6, -PI / 2],
    ["kitchen", 3.27, 6.5, -PI / 2, 1.2, 6.2, 6.5, PI / 2],
    ["bed3", 3.13, 6.6, PI / 2, 1.2, 0.8, 6.6, -PI / 2],
    ["bed2", 8.27, 7.3, -PI / 2, 1.2, 10.7, 7.3, PI / 2],
    ["bath", 14.99, 6.5, PI / 2, 1.2, 12.4, 6.5, -PI / 2],
  ],
};
// The corridor is NOT measured: it is 1.2 m wide, so no camera position sees a wardrobe face-on with wall
// behind it (its end walls are the entry door and the open living room). Its correction comes from the
// bake like every other room, but this method cannot verify it.
const sets = setArg === "all" ? ["A", "B"] : [setArg];

// a wardrobe must stand in front of plain wall: refuse placements whose span meets an opening (+10 cm margin)
const baseline = JSON.parse(fs.readFileSync(`public/walk/${SLUG}/baseline.json`, "utf8")).baseline;
for (const s of Object.keys(SETS)) for (const [room, x, y, rot, w] of SETS[s]) {
  const alongX = Math.abs(Math.sin(rot)) < 0.5; // front +-y: the wardrobe runs along x
  for (const o of Object.values(baseline.openings)) {
    const [cx, cy] = o.center;
    const onLine = alongX ? Math.abs(cy - y) < 0.25 : Math.abs(cx - x) < 0.25;
    const lo = (alongX ? x : y) - w / 2, hi = (alongX ? x : y) + w / 2, c = alongX ? cx : cy;
    if (onLine && hi > c - o.width / 2 - 0.1 && lo < c + o.width / 2 + 0.1) {
      console.error(`set ${s} ${room}: the wardrobe would stand in front of ${o.id} (${o.kind}); pick a plain wall`);
      process.exit(2);
    }
  }
}

const LUT = Float64Array.from({ length: 256 }, (_, i) => { const v = i / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });

/** Mean linear luminance (and colour) of the item vs the bare wall over the inner part of the item's silhouette. */
async function compare(bareBuf, itemBuf, maskPath) {
  const a = await sharp(bareBuf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const B = await sharp(itemBuf).removeAlpha().raw().toBuffer();
  const { width: W, height: H } = a.info;
  const A = a.data;
  const L = (buf, i) => 0.2126 * LUT[buf[i]] + 0.7152 * LUT[buf[i + 1]] + 0.0722 * LUT[buf[i + 2]];
  // rows/columns with enough changed pixels bound the silhouette (the floor decal and the wall shadow do not stretch it)
  const rowCount = new Uint32Array(H), colCount = new Uint32Array(W);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 12) { rowCount[y]++; colCount[x]++; }
  }
  const span = (cnt, n, frac) => {
    let max = 0;
    for (const v of cnt) max = Math.max(max, v);
    let lo = 0, hi = n - 1;
    while (lo < n && cnt[lo] < max * frac) lo++;
    while (hi > 0 && cnt[hi] < max * frac) hi--;
    return [lo, hi];
  };
  const [x0, x1] = span(colCount, W, 0.5), [y0, y1] = span(rowCount, H, 0.5);
  if (x1 <= x0 || y1 <= y0) return null;
  // inner box: middle 50 % horizontally, 20..70 % vertically (door fronts, away from plinth, top and edges)
  const ix0 = Math.round(x0 + (x1 - x0) * 0.25), ix1 = Math.round(x0 + (x1 - x0) * 0.75);
  const iy0 = Math.round(y0 + (y1 - y0) * 0.2), iy1 = Math.round(y0 + (y1 - y0) * 0.7);
  let sa = 0, sb = 0, n = 0;
  const ca = [0, 0, 0], cb = [0, 0, 0];
  const mask = Buffer.from(B);
  for (let y = iy0; y < iy1; y++) for (let x = ix0; x < ix1; x++) {
    const i = (y * W + x) * 3;
    sa += L(A, i); sb += L(B, i); n++;
    for (let c = 0; c < 3; c++) { ca[c] += LUT[A[i + c]]; cb[c] += LUT[B[i + c]]; }
    mask[i] = 255; mask[i + 1] = Math.round(mask[i + 1] * 0.6); mask[i + 2] = Math.round(mask[i + 2] * 0.6);
  }
  if (maskPath) await sharp(mask, { raw: { width: W, height: H, channels: 3 } }).png().toFile(maskPath);
  // per-channel item/wall ratio normalised by the luminance ratio: [1, 1, 1] = same colour, R > B = warmer
  const chan = ca.map((v, c) => cb[c] / v / (sb / sa));
  return { wall: sa / n, item: sb / n, ratio: sb / sa, chan, cast: Math.max(...chan) - Math.min(...chan), pixels: n };
}

fs.mkdirSync(out, { recursive: true });
const token = jwt.sign({ userId: `tone-${Date.now()}`, email: "tone@example.test", role: "admin" }, secret(), { expiresIn: "1h" });
const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addCookies([{ name: "hq_session", value: token, domain: "localhost", path: "/" }, { name: "haveniq-locale", value: "en", domain: "localhost", path: "/" }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
await page.goto(`${base}/studio/${SLUG}?debug&seed=none`);
await page.waitForFunction(() => window.__studio?.getState().ready, null, { timeout: 120000 });
// only the 3D view: UI chips and buttons change state when the wardrobe is added (Undo, Saved) and would enter the difference mask
await page.addStyleTag({ content: "nextjs-portal { display: none !important } body * { visibility: hidden !important } canvas { visibility: visible !important }" });
const S = (fn, a) => page.evaluate(fn, a);
await page.waitForTimeout(3000); // the calibration file is fetched on load

await S((t) => {
  const st = window.__studio.getState();
  st.setQuality(t); st.setTier(t);
  const walls = Object.values(st.baseline.surfaces).filter((s) => s.type === "wall");
  st.dispatch({ type: "batch", commands: walls.map((s) => ({ type: "setSurfaceMaterial", surfaceId: s.id, material: { id: "paint-limewash", version: 1 } })) });
}, tier);
if (neutral) await S(() => window.__studio.getState().setItemLight(null));
await page.waitForTimeout(5000);
const loaded = await S(() => window.__studio.getState().itemLight);
console.log(`item light: ${loaded ? `calibration v${loaded.version}, global ${loaded.global}` : "neutral (uncalibrated)"}; tier ${tier}`);

const teleport = async (cx, cy, yaw) => { await S(([a, b, c]) => { window.__studioInput.teleport = { x: a, y: b, yaw: c }; }, [cx, cy, yaw]); await page.waitForTimeout(2500); };
const bares = {};
for (const s of sets) for (const [room, , , , , cx, cy, yaw] of SETS[s]) {
  if (only && !only.split(",").includes(room)) continue;
  await teleport(cx, cy, yaw);
  bares[`${s}-${room}`] = await page.locator("canvas").screenshot();
}

async function measure(label) {
  const rows = [];
  for (const s of sets) for (const [room, x, y, rot, width, cx, cy, yaw] of SETS[s]) {
    if (only && !only.split(",").includes(room)) continue;
    await teleport(cx, cy, yaw);
    await S(([id, a, b, r, w]) => {
      const st = window.__studio.getState();
      const m = st.models.find((q) => q.id === "wardrobe-hinged-01");
      st.dispatch({ type: "add", node: { id, kind: "item", locked: false, catalog: { id: m.id, version: m.version }, slots: {}, params: { width: w, height: 2.0 }, transform: { x: a, y: b, z: 0, rot: r } } });
    }, [`tone-${room}`, x, y, rot, width]);
    await page.waitForTimeout(3500);
    const shot = await page.locator("canvas").screenshot();
    const name = `${s}-${room}-${tier}${label}`;
    fs.writeFileSync(path.join(out, `${name}.png`), shot);
    const r = await compare(bares[`${s}-${room}`], shot, path.join(out, `${name}-mask.png`));
    await S((id) => window.__studio.getState().dispatch({ type: "remove", id }), `tone-${room}`);
    await page.waitForTimeout(600);
    if (!r) { rows.push({ set: s, room, ratio: null, ok: false }); console.log(`FAIL  ${s} ${room.padEnd(9)} no measurement`); continue; }
    const ok = Math.abs(r.ratio - 1) <= gate && r.cast <= castGate;
    rows.push({ set: s, room, ...r, ok });
    console.log(`${ok ? "PASS" : "FAIL"}  ${s} ${room.padEnd(9)} item/wall ${r.ratio.toFixed(3)}  colour r/g/b ${r.chan.map((v) => v.toFixed(2)).join("/")} (cast ${r.cast.toFixed(2)})  wall ${r.wall.toFixed(4)} item ${r.item.toFixed(4)}`);
  }
  return rows;
}

let rows;
if (fitRooms) {
  // one scalar per room, fitted on that room's set-A wall only (two passes: the sun's share does not scale);
  // set B (walls facing other ways) stays held out and is what the result is judged on
  let cal = parseItemLight(JSON.parse(fs.readFileSync(calFile, "utf8")));
  if (!cal) throw new Error(`${calFile} missing or invalid: run scripts/studio/item-light.mjs first`);
  const firstRatio = {};
  for (let pass = 1; pass <= 2; pass++) {
    await S((c) => window.__studio.getState().setItemLight(c), cal);
    await page.waitForTimeout(3000);
    console.log(`\n-- room fit pass ${pass}`);
    sets.splice(0, sets.length, "A");
    const fit = await measure(`-roomfit${pass}`);
    const next = structuredClone(cal);
    for (const r of fit) {
      if (!r.ratio) continue;
      firstRatio[r.room] ??= r.ratio;
      next.rooms[r.room].gain = +Math.min(10, Math.max(0.1, cal.rooms[r.room].gain / r.ratio)).toFixed(4);
    }
    cal = next;
    console.log("   gains", Object.entries(cal.rooms).map(([k, v]) => `${k} ${v.gain}`).join(", "));
  }
  sets.splice(0, sets.length, "A", "B");
  cal.globalFrom += `; room gains fitted ${new Date().toISOString().slice(0, 10)} on set A (one wall per room; ratios before: ${Object.entries(firstRatio).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(", ")}); corridor not measurable, gain 1`;
  fs.writeFileSync(calFile, JSON.stringify(cal, null, 1) + "\n");
  console.log(`wrote room gains to ${calFile}`);
  await S((c) => window.__studio.getState().setItemLight(c), cal);
  await page.waitForTimeout(3000);
  console.log("\n-- verification, sets A (fitted) and B (held out)");
  rows = await measure("");
} else if (fitGlobal) {
  // ONE free parameter, fitted on set A only (geometric mean of the item/wall ratios -> 1); set B stays held out.
  // Two passes, because the sun's share of an item's light does not scale with the factor.
  let cal = parseItemLight(JSON.parse(fs.readFileSync(calFile, "utf8")));
  if (!cal) throw new Error(`${calFile} missing or invalid: run scripts/studio/item-light.mjs first`);
  let first = null;
  for (let pass = 1; pass <= 2; pass++) {
    await S((c) => window.__studio.getState().setItemLight(c), cal);
    await page.waitForTimeout(3000);
    console.log(`\n-- fit pass ${pass} (global ${cal.global})`);
    const saved = sets.slice();
    sets.splice(0, sets.length, "A");
    const fit = await measure(`-fit${pass}`);
    sets.splice(0, sets.length, ...saved);
    const gm = Math.exp(fit.filter((r) => r.ratio).reduce((s, r) => s + Math.log(r.ratio), 0) / fit.filter((r) => r.ratio).length);
    first ??= gm;
    cal = { ...cal, global: +(cal.global / gm).toFixed(4) };
    console.log(`   geometric mean ${gm.toFixed(3)} -> global ${cal.global}`);
  }
  cal.globalFrom = `fitted ${new Date().toISOString().slice(0, 10)} on set A of scripts/studio/light-tone.mjs (7 rooms, geometric mean of item/wall ratios -> 1, tier ${tier}; ratio before the fit ${first.toFixed(3)})`;
  fs.writeFileSync(calFile, JSON.stringify(cal, null, 1) + "\n");
  console.log(`wrote global ${cal.global} to ${calFile}`);
  await S((c) => window.__studio.getState().setItemLight(c), cal);
  await page.waitForTimeout(3000);
  console.log("\n-- verification, sets A (fitted) and B (held out)");
  rows = await measure("");
} else {
  rows = await measure(neutral ? "-neutral" : "");
}
if (errors.length) console.log("page errors:", errors[0]);
await browser.close();
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ tier, gate, castGate, neutral, at: new Date().toISOString(), rows }, null, 1) + "\n");
const failed = rows.filter((r) => !r.ok).length;
const logs = rows.filter((r) => r.ratio).map((r) => Math.abs(Math.log(r.ratio)));
console.log(`\nmean |log ratio| ${(logs.reduce((s, v) => s + v, 0) / logs.length).toFixed(3)}, worst ratio ${rows.filter((r) => r.ratio).map((r) => r.ratio).sort((p, q) => Math.abs(Math.log(q)) - Math.abs(Math.log(p)))[0]?.toFixed(3)}`);
console.log(failed ? `${failed} of ${rows.length} outside the gate (ratio 1 +- ${gate}, cast <= ${castGate})` : `all ${rows.length} within the gate (ratio 1 +- ${gate}, cast <= ${castGate})`);
process.exit(failed || errors.length ? 1 : 0);
