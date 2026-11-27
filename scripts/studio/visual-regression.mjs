// M13 visual regression set: fixed cameras over a deterministic furnished design (free dry-run
// planner), the floor planner, the design UI in en + he, and the untouched /walk/yarkon viewer.
//
//   JWT_SECRET=... node scripts/studio/visual-regression.mjs            compare with the baselines
//   JWT_SECRET=... node scripts/studio/visual-regression.mjs --update   (re)write the baselines
//   [--base=http://localhost:3001] [--only=name,name] [--threshold=0.5]
//
// A pixel "differs" when any channel moves by more than 16/255; a view fails when more than
// --threshold percent of its pixels differ (default 0.5 %, MASTER_PLAN section 13). This guards
// against REGRESSIONS only: a low diff is never evidence of visual quality (QUALITY_GATES).
// Baselines: docs/design-studio/results/m13/vr/baseline/*.webp (lossless). Failures write
// <name>.actual.webp and <name>.diff.webp next to them. Baselines are GPU/driver specific: refresh
// them with --update on a new machine, after inspecting the images by eye.
import { chromium } from "@playwright/test";
import { mkdirSync, existsSync } from "node:fs";
import sharp from "sharp";
import jwt from "jsonwebtoken";

const flag = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1] ?? d;
const base = flag("base", "http://localhost:3001");
const UPDATE = process.argv.includes("--update");
const only = flag("only", null)?.split(",");
const threshold = Number(flag("threshold", "0.5"));
const dir = "docs/design-studio/results/m13/vr";
mkdirSync(`${dir}/baseline`, { recursive: true });
const W = 960, H = 540;

const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--force_high_performance_gpu"] });
const shots = []; // [name, Buffer]
const want = (name) => !only || only.includes(name);

async function studioPage(lang) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const token = jwt.sign({ userId: `vr-${lang}-${Date.now()}`, email: "vr@example.test", role: "admin" }, process.env.JWT_SECRET ?? "studio-bench-dummy", { expiresIn: "1h" });
  await ctx.addCookies([{ name: "hq_session", value: token, domain: new URL(base).hostname, path: "/" }, { name: "haveniq-locale", value: lang, domain: new URL(base).hostname, path: "/" }]);
  const page = await ctx.newPage();
  await page.goto(`${base}/studio/yarkon-twin-shell?debug`);
  await page.waitForFunction(() => window.__studio?.getState().ready, null, { timeout: 120000 });
  await page.evaluate(() => window.__studio.getState().setQuality("high")); // no adaptive tier changes mid-run
  await page.waitForTimeout(3000);
  for (const prompt of ["living room", "dining", "bedroom", "kitchen"]) {
    await page.evaluate(async (prompt) => {
      const s = window.__studio.getState();
      const r = await fetch("/api/studio/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baselineId: s.doc.baseline.id, doc: s.doc, prompt }) });
      const j = await r.json();
      if (j.batch) s.dispatch(j.batch);
    }, prompt);
  }
  await page.waitForTimeout(4000);
  return { ctx, page };
}

const settle = (page, ms = 2500) => page.waitForTimeout(ms);
const canvasShot = async (page, name) => { if (want(name)) shots.push([name, await page.locator("canvas").first().screenshot()]); };
const teleport = (page, x, y, yaw) => page.evaluate(([a, b, c]) => { window.__studioInput.teleport = { x: a, y: b, yaw: c }; }, [x, y, yaw]);

// 1. walkthrough cameras + plan (3D only, UI hidden)
{
  const { ctx, page } = await studioPage("en");
  await page.addStyleTag({ content: ".st-ui, nextjs-portal { display: none !important }" });
  const views = [["walk-living", 7.6, 2.3, Math.PI / 2], ["walk-dining", 6.2, 3.9, Math.PI * 0.75], ["walk-sofa", 4.0, 0.6, 0], ["walk-kitchen", 5.9, 6.1, Math.PI / 4]];
  for (const [name, x, y, yaw] of views) { await teleport(page, x, y, yaw); await settle(page); await canvasShot(page, name); }
  // bedroom: a fixed free spot facing the nightstand the planner places (a target inside a collision box
  // would be pushed out over a frame-rate dependent number of frames and never repeat exactly)
  await teleport(page, 0.54, 7.1, 4.9124); await settle(page); await canvasShot(page, "walk-bedroom");
  await page.evaluate(() => window.__studio.getState().setMode("plan"));
  await settle(page, 3000);
  await canvasShot(page, "plan-top");
  await ctx.close();
}
// 2. design UI with a selected sofa, English and Hebrew (full page: panels + scene)
for (const lang of ["en", "he"]) {
  const name = `design-ui-${lang}`;
  if (!want(name)) continue;
  const { ctx, page } = await studioPage(lang);
  await page.evaluate(() => {
    const s = window.__studio.getState();
    s.setMode("design");
    const sofa = Object.values(s.doc.nodes).find((n) => n.kind === "item" && /^sofa/.test(n.catalog.id));
    s.select(sofa?.id ?? null);
  });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important }" }); // dev-only badge
  await teleport(page, 7.6, 2.3, Math.PI / 2);
  await settle(page, 3000);
  await page.mouse.move(0, 0);
  shots.push([name, await page.screenshot({ animations: "disabled", caret: "hide" })]);
  await ctx.close();
}
// 3. the existing walkthrough (must never change because of studio work)
if (want("walk-yarkon")) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(`${base}/walk/yarkon`, { timeout: 180000 });
  await page.waitForSelector("canvas", { timeout: 120000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await settle(page, 6000);
  shots.push(["walk-yarkon", await page.locator("canvas").first().screenshot()]);
  await ctx.close();
}
await browser.close();

let failed = 0;
for (const [name, png] of shots) {
  const ref = `${dir}/baseline/${name}.webp`;
  if (UPDATE || !existsSync(ref)) {
    await sharp(png).webp({ lossless: true }).toFile(ref);
    console.log(`${name.padEnd(16)} baseline written`);
    continue;
  }
  const a = await sharp(ref).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) { failed++; console.log(`${name.padEnd(16)} FAIL size ${b.info.width}x${b.info.height} vs ${a.info.width}x${a.info.height}`); continue; }
  const n = a.info.width * a.info.height;
  const diff = Buffer.alloc(n * 3);
  let bad = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.max(Math.abs(a.data[i * 3] - b.data[i * 3]), Math.abs(a.data[i * 3 + 1] - b.data[i * 3 + 1]), Math.abs(a.data[i * 3 + 2] - b.data[i * 3 + 2]));
    const g = b.data[i * 3] * 0.3 + b.data[i * 3 + 1] * 0.59 + b.data[i * 3 + 2] * 0.11;
    if (d > 16) { bad++; diff[i * 3] = 255; diff[i * 3 + 1] = 0; diff[i * 3 + 2] = 60; } else diff.fill(Math.round(g * 0.35), i * 3, i * 3 + 3);
  }
  const pct = (100 * bad) / n;
  const ok = pct <= threshold;
  if (!ok) {
    failed++;
    await sharp(png).webp({ lossless: true }).toFile(`${dir}/${name}.actual.webp`);
    await sharp(diff, { raw: { width: a.info.width, height: a.info.height, channels: 3 } }).webp({ lossless: true }).toFile(`${dir}/${name}.diff.webp`);
  }
  console.log(`${name.padEnd(16)} ${ok ? "PASS" : "FAIL"} ${pct.toFixed(3)} % pixels differ (limit ${threshold} %)`);
}
console.log(failed ? `FAIL: ${failed} view(s)` : `PASS: ${shots.length} view(s)`);
process.exit(failed ? 1 : 0);
