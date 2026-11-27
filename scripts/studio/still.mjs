#!/usr/bin/env node
// M12: furnishes the apartment (free dry-run planner), then renders path-traced stills from fixed
// cameras and records time-to-target per view. Also saves the realtime frame for a side-by-side.
//   JWT_SECRET=... node scripts/studio/still.mjs [--base=http://localhost:3001] [--samples=256] [--size=1920x1080] [--only=living] [--cold] [--profile=dir]
import { chromium } from "@playwright/test";
import jwt from "jsonwebtoken";
import fs from "node:fs";

const args = process.argv.slice(2);
const flag = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split("=")[1];
const base = flag("base", "http://localhost:3001");
const samples = Number(flag("samples", "256"));
const [W, H] = flag("size", "1920x1080").split("x").map(Number);
const only = flag("only", "");
const dir = "docs/design-studio/results/m12";
fs.mkdirSync(dir, { recursive: true });
const token = jwt.sign({ userId: `still-${Date.now()}`, email: "still@example.test", role: "admin" }, process.env.JWT_SECRET ?? "studio-bench-dummy", { expiresIn: "1h" });
// --profile=<dir>: a persistent browser profile, so the GPU shader cache survives between runs (what a returning user has)
const profile = flag("profile", "");
const launchArgs = ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--force_high_performance_gpu"];
const ctx = profile
  ? await chromium.launchPersistentContext(profile, { channel: "msedge", headless: true, args: launchArgs, viewport: { width: W, height: H }, deviceScaleFactor: 1 })
  : await (await chromium.launch({ channel: "msedge", headless: true, args: launchArgs })).newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const browser = { close: () => ctx.close() };
await ctx.addCookies([{ name: "hq_session", value: token, domain: "localhost", path: "/" }, { name: "haveniq-locale", value: "en", domain: "localhost", path: "/" }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
// ?warm: background shader warm-up (opt-in since M13), so --wait measures the warmed path
// --cold: no warm-up, i.e. the first photo of a real visit (the default product behaviour since M13)
await page.goto(`${base}/studio/yarkon-twin-shell?debug${args.includes("--cold") ? "" : "&warm"}`);
await page.waitForFunction(() => window.__studio?.getState().ready, null, { timeout: 90000 });
await page.addStyleTag({ content: ".st-ui, nextjs-portal { display: none !important }" });
await page.waitForTimeout(4000);
for (const prompt of ["living room", "dining", "bedroom", "kitchen"]) {
  await page.evaluate(async (prompt) => {
    const s = window.__studio.getState();
    const res = await fetch("/api/studio/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baselineId: s.doc.baseline.id, doc: s.doc, prompt }) });
    const j = await res.json();
    if (j.batch) s.dispatch(j.batch);
  }, prompt);
}
// --wait=<s>: how long the user spends before asking for a still (the shader warms up in the background meanwhile)
const wait = Number(flag("wait", "0"));
if (wait) await page.waitForTimeout(wait * 1000);
console.log("shader warm-up:", await page.evaluate(() => window.__stillWarmMs ?? "not finished"), "ms");
await page.evaluate(() => window.__studio.getState().setMode("design"));
await page.waitForTimeout(3000);

const views = [
  ["living", 7.6, 2.3, Math.PI / 2],
  ["dining", 6.2, 3.9, Math.PI * 0.75],
];
// bedroom: in front of the nightstand, wherever the planner put it
const ns = await page.evaluate(() => Object.values(window.__studio.getState().doc.nodes).find((n) => n.kind === "item" && n.catalog.id === "nightstand-01")?.transform ?? null);
if (ns) views.push(["bedroom", ns.x - Math.sin(ns.rot) * 2.6 + Math.cos(ns.rot) * 0.6, ns.y + Math.cos(ns.rot) * 2.6 + Math.sin(ns.rot) * 0.6, ns.rot + Math.PI + 0.2]);

const gpu = await page.evaluate(() => { const g = document.createElement("canvas").getContext("webgl2"); const e = g.getExtension("WEBGL_debug_renderer_info"); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : "unknown"; });
console.log("GPU:", gpu);
const rows = [];
const tunes = JSON.parse(flag("tunes", "null") ?? "null");
if (tunes) { const v = views.find((v) => !only || v[0] === only); views.length = 0; tunes.forEach((tu, i) => views.push([`${v[0]}-t${i}`, v[1], v[2], v[3], tu])); }
for (const [name, x, y, yaw, tuneOne] of views) {
  if (only && !tunes && name !== only) continue;
  await page.evaluate(([a, b, c]) => { window.__studioInput.teleport = { x: a, y: b, yaw: c }; }, [x, y, yaw]);
  await page.waitForTimeout(2500);
  await page.locator("canvas").screenshot({ path: `${dir}/${name}-realtime.png` });
  await page.evaluate(([n, tune]) => { window.__stillTune = tune; window.__studio.getState().startStill(n); }, [samples, tuneOne ?? JSON.parse(flag("tune", "{}"))]);
  const r = await page.waitForFunction(() => { const s = window.__studio.getState().still; return s && (s.status === "done" || s.status === "error") ? { status: s.status, ms: s.ms, prepMs: s.prepMs, compileMs: s.compileMs, nanFrac: s.nanFrac, samples: s.samples, error: s.error } : null; }, null, { timeout: Number(flag("timeout", "300000")), polling: 500 }).then((h) => h.jsonValue()).catch(async () => ({ status: "timeout", ...(await page.evaluate(() => window.__studio.getState().still)), url: undefined }));
  if (r.status === "done") {
    const url = await page.evaluate(() => window.__studio.getState().still.url);
    fs.writeFileSync(`${dir}/${name}-still.png`, Buffer.from(url.split(",")[1], "base64"));
  }
  rows.push({ name, ...r });
  if (tuneOne) console.log(JSON.stringify(tuneOne));
  console.log(`${name}: ${r.status} ${r.samples} spp in ${(r.ms / 1000).toFixed(1)} s (prep ${((r.prepMs ?? 0) / 1000).toFixed(1)} s, first sample at ${((r.compileMs ?? 0) / 1000).toFixed(1)} s, invalid px ${((r.nanFrac ?? 0) * 100).toFixed(2)}%)${r.error ? " " + r.error : ""}`);
  await page.evaluate(() => window.__studio.getState().setStill(null));
  await page.waitForTimeout(1500);
}
fs.writeFileSync(`${dir}/timings.json`, JSON.stringify({ size: `${W}x${H}`, samples, gpu, rows }, null, 2));
if (errors.length) console.log("page errors:", errors.slice(0, 5).join(" | "));
await browser.close();
