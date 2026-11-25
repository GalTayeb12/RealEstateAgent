// Walkthrough performance benchmark (non-invasive: counts WebGL draw calls by
// wrapping the GL context, so the viewer code is untouched).
//
//   node scripts/studio/bench.mjs [baseUrl=http://localhost:3001] [path ...] [--seconds=8] [--out=file.json]
//
// Numbers are "desktop measured (headless Edge, ANGLE/D3D11)". They are NOT
// phone measurements; label them accordingly in PROGRESS.md.
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")));
const pos = args.filter((a) => !a.startsWith("--"));
const base = (pos[0] && pos[0].startsWith("http") ? pos[0] : "http://localhost:3001").replace(/\/$/, "");
const paths = pos.filter((p) => p.startsWith("/"));
if (!paths.length) paths.push("/walk/yarkon");
const seconds = Number(flags.seconds ?? 8);

const initScript = () => {
  const stats = { frames: 0, draws: 0, tris: 0, lastFrameDraws: 0, perFrame: [], t: [] };
  window.__bench = stats;
  const wrap = (proto) => {
    const hook = (name, trisOf) => {
      const orig = proto[name];
      if (!orig) return;
      proto[name] = function (...a) {
        stats.draws++;
        stats.tris += trisOf(a);
        return orig.apply(this, a);
      };
    };
    const modeTris = (mode, n) => (mode === 4 ? n / 3 : mode === 5 || mode === 6 ? Math.max(0, n - 2) : 0);
    hook("drawElements", (a) => modeTris(a[0], a[1]));
    hook("drawArrays", (a) => modeTris(a[0], a[2]));
    hook("drawElementsInstanced", (a) => modeTris(a[0], a[1]) * (a[4] ?? 1));
    hook("drawArraysInstanced", (a) => modeTris(a[0], a[2]) * (a[3] ?? 1));
  };
  if (window.WebGL2RenderingContext) wrap(WebGL2RenderingContext.prototype);
  if (window.WebGLRenderingContext) wrap(WebGLRenderingContext.prototype);
  let prevDraws = 0;
  let prevTris = 0;
  const tick = (t) => {
    if (stats.recording) {
      stats.frames++;
      stats.t.push(t);
      stats.perFrame.push([stats.draws - prevDraws, stats.tris - prevTris]);
    }
    prevDraws = stats.draws;
    prevTris = stats.tris;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"],
});

const results = [];
for (const p of paths) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript(initScript);
  const t0 = Date.now();
  await page.goto(base + p, { waitUntil: "load", timeout: 120000 });
  await page.waitForSelector("canvas", { state: "attached", timeout: 120000 });
  await page.waitForLoadState("networkidle", { timeout: 120000 }).catch(() => {});
  const loadMs = Date.now() - t0;
  await page.waitForTimeout(2000);
  const bytes = await page.evaluate(() => {
    const r = performance.getEntriesByType("resource");
    const sum = (f) => r.filter(f).reduce((a, e) => a + (e.encodedBodySize || 0), 0);
    return { total: sum(() => true), glb: sum((e) => e.name.includes(".glb")) };
  });
  await page.evaluate(() => {
    window.__bench.recording = true;
  });
  await page.waitForTimeout(seconds * 1000);
  const m = await page.evaluate(() => {
    const s = window.__bench;
    s.recording = false;
    const dts = s.t.slice(1).map((v, i) => v - s.t[i]).sort((a, b) => a - b);
    const q = (f) => dts[Math.min(dts.length - 1, Math.floor(dts.length * f))] ?? 0;
    const draws = s.perFrame.map((x) => x[0]).sort((a, b) => a - b);
    const tris = s.perFrame.map((x) => x[1]).sort((a, b) => a - b);
    const med = (a) => a[Math.floor(a.length / 2)] ?? 0;
    const span = (s.t[s.t.length - 1] - s.t[0]) / 1000;
    return {
      frames: s.frames,
      fpsAvg: +(s.frames / (span || 1)).toFixed(1),
      frameMsP50: +q(0.5).toFixed(2),
      frameMsP95: +q(0.95).toFixed(2),
      drawCallsMedian: med(draws),
      trianglesMedian: Math.round(med(tris)),
      jsHeapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(0) : null,
    };
  });
  results.push({ path: p, loadMs, transferredMB: +(bytes.total / 1048576).toFixed(1), glbMB: +(bytes.glb / 1048576).toFixed(1), ...m });
  console.log(JSON.stringify(results[results.length - 1]));
  await ctx.close();
}
await browser.close();
const out = { kind: "desktop measured (headless Edge, ANGLE/D3D11, 1920x1080, DPR 1)", date: new Date().toISOString(), results };
if (flags.out) writeFileSync(flags.out, JSON.stringify(out, null, 2));
