// Walkthrough performance benchmark (non-invasive: counts WebGL draw calls by
// wrapping the GL context, so the viewer code is untouched).
//
//   node scripts/studio/bench.mjs [baseUrl=http://localhost:3001] [path ...] [--seconds=8] [--out=file.json]
//
// Numbers are "desktop measured (headless Edge, ANGLE/D3D11)". They are NOT
// phone measurements; label them accordingly in PROGRESS.md.
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import jwt from "jsonwebtoken";

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")));
const pos = args.filter((a) => !a.startsWith("--"));
const base = (pos[0] && pos[0].startsWith("http") ? pos[0] : "http://localhost:3001").replace(/\/$/, "");
const paths = pos.filter((p) => p.startsWith("/"));
const seconds = Number(flags.seconds ?? 8);
// --studio: bench /studio/<slug> with the living-room test set (needs STUDIO_ENABLED=1 on the server and the same
// JWT_SECRET here); --tier=low|medium|high pins the quality tier, --ao=0|1 toggles ambient occlusion.
const STUDIO = "studio" in flags;
const slug = flags.slug ?? "yarkon-twin-shell";
const item = (id, catalog, x, y, rot) => ({ type: "add", node: { id, kind: "item", catalog: { id: catalog, version: 1 }, transform: { x, y, z: 0, rot }, slots: {}, locked: false } });
const LIVING = [item("sofa", "sofa-03", 4.0, 4.5, Math.PI), item("table", "coffee-table-modern-01", 4.0, 2.9, 0),
  item("chair", "armchair-modern-01", 6.6, 2.4, Math.PI / 2), item("side", "side-table-01", 6.1, 4.4, Math.PI)];
// --furnish: furnish every room (dry-run AI) and view from the living room toward the dining area;
// --mobile: emulate a mid phone (390x844, DPR 3, touch). Emulated numbers are NOT phone measurements.
const FURNISH = "furnish" in flags;
const MOBILE = "mobile" in flags;
const VIEW = (flags.view ?? "7.6,2.3,1.5708").split(",").map(Number);
if (!paths.length) paths.push(STUDIO ? `/studio/${slug}?debug` : "/walk/yarkon");

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
  args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader", ...(flags.hp ? ["--force_high_performance_gpu"] : []), ...(flags.uncapped ? ["--disable-gpu-vsync", "--disable-frame-rate-limit"] : [])],
});

const results = [];
for (const p of paths) {
  const ctx = await browser.newContext(MOBILE
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36" }
    : { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  if (STUDIO) {
    const token = jwt.sign({ userId: `bench-${Date.now()}`, email: "bench@example.test", role: "admin" }, process.env.JWT_SECRET ?? "studio-bench-dummy", { expiresIn: "1h" });
    await ctx.addCookies([{ name: "hq_session", value: token, domain: new URL(base).hostname, path: "/" }]);
  }
  const page = await ctx.newPage();
  await page.addInitScript(initScript);
  const t0 = Date.now();
  await page.goto(base + p, { waitUntil: "load", timeout: 120000 });
  await page.waitForSelector("canvas", { state: "attached", timeout: 120000 });
  await page.waitForLoadState("networkidle", { timeout: 120000 }).catch(() => {});
  const loadMs = Date.now() - t0;
  if (STUDIO) {
    await page.waitForFunction(() => window.__studio?.getState().ready, null, { timeout: 90000 });
    await page.waitForTimeout(3000);
    await page.evaluate(({ cmds, tier, ao }) => {
      const st = window.__studio.getState();
      if (tier) st.setQuality(tier);
      if (ao !== undefined) st.setLighting({ ao: ao === "1" });
      for (const c of cmds) st.dispatch(c);
      window.__studioInput.teleport = { x: 4.0, y: 0.4, yaw: 0 };
    }, { cmds: FURNISH ? [] : LIVING, tier: flags.tier, ao: flags.ao });
    if (FURNISH) {
      // --furnish: the whole apartment through the free dry-run planner (the M10-M12 furnished scene)
      for (const prompt of ["living room", "dining", "bedroom", "kitchen"]) {
        await page.evaluate(async (prompt) => {
          const s = window.__studio.getState();
          const res = await fetch("/api/studio/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baselineId: s.doc.baseline.id, doc: s.doc, prompt }) });
          const j = await res.json();
          if (j.batch) s.dispatch(j.batch);
        }, prompt);
      }
      await page.evaluate(([x, y, yaw]) => { window.__studioInput.teleport = { x, y, yaw }; }, VIEW);
      await page.waitForTimeout(6000);
    }
    await page.waitForTimeout(4000);
  }
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
  results.push({ path: p, furnished: FURNISH, mobile: MOBILE, items: STUDIO ? await page.evaluate(() => Object.values(window.__studio.getState().doc.nodes).filter((n) => n.kind === "item").length) : null, tier: flags.tier ?? null, ao: flags.ao ?? null, loadMs, transferredMB: +(bytes.total / 1048576).toFixed(1), glbMB: +(bytes.glb / 1048576).toFixed(1), ...m });
  console.log(JSON.stringify(results[results.length - 1]));
  await ctx.close();
}
await browser.close();
const out = { kind: MOBILE ? "mobile EMULATED on desktop GPU (390x844 DPR 3) - not a phone measurement" : "desktop measured (headless Edge, ANGLE/D3D11, 1920x1080, DPR 1)", date: new Date().toISOString(), results };
if (flags.out) writeFileSync(flags.out, JSON.stringify(out, null, 2));
