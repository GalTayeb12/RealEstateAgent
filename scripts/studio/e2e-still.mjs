#!/usr/bin/env node
// Path-traced still (M12) end to end: furnish the living room, render a still, check the 60 s gate,
// the image, cancel, and that the live view comes back unchanged afterwards.
//   node scripts/studio/e2e-still.mjs [--base=http://localhost:3001] [--lang=he] [--preset=standard] [--mobile]
// JWT_SECRET: environment, .env.local or .env (same as the dev server). Output: docs/design-studio/results/m12/.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import jwt from "jsonwebtoken";

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split("=").slice(1).join("=");
const base = arg("base", "http://localhost:3001");
const lang = arg("lang", "en");
const preset = arg("preset", "standard");
const mobile = process.argv.includes("--mobile");
const tag = `${mobile ? "mobile" : "desktop"}-${lang}`;
const OUT = "docs/design-studio/results/m12";
fs.mkdirSync(OUT, { recursive: true });

function secret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  for (const f of [".env.local", ".env"]) {
    if (!fs.existsSync(f)) continue;
    const m = fs.readFileSync(f, "utf8").match(/^JWT_SECRET\s*=\s*"?([^"\r\n]*)"?/m);
    if (m && m[1]) return m[1];
  }
  return "studio-bench-dummy";
}
const sign = () => jwt.sign({ userId: `e2e-still-${Date.now()}`, email: "e2e@example.test", role: "admin" }, secret(), { expiresIn: "1h" });

const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };

// ANGLE's Direct3D11 backend (the browser default on Windows) is ~10-20x slower for the path tracer's shader than Vulkan,
// so the gate is measured on Vulkan; --backend=d3d11 measures the default.
const backend = arg("backend", "vulkan");
const gpu = backend === "d3d11" ? ["--use-angle=d3d11"] : ["--use-angle=vulkan", "--enable-features=Vulkan"];
const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--enable-gpu", ...gpu, "--ignore-gpu-blocklist", "--force_high_performance_gpu"] });
const ctx = await browser.newContext(mobile
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { viewport: { width: 1500, height: 900 }, acceptDownloads: true });
await ctx.addCookies([{ name: "hq_session", value: sign(), domain: "localhost", path: "/" }, { name: "haveniq-locale", value: lang, domain: "localhost", path: "/" }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
// lm-B.webp: the walk viewer probes for an optional second lightmap that this shell does not have (pre-existing, harmless)
page.on("response", (r) => { if (r.status() === 404 && !/lm-B(-2k)?.webp/.test(r.url())) errors.push("404 " + r.url().slice(0, 120)); });
await page.goto(`${base}/studio/yarkon-twin-shell?debug&seed=none`);
await page.waitForFunction(() => window.__studio?.getState().ready, null, { timeout: 120000 });
await page.addStyleTag({ content: "nextjs-portal { display: none !important }" });
await page.waitForTimeout(3000);
const S = (fn, a) => page.evaluate(fn, a);

// furnish the living room through the real (dry-run) AI path, accept it
await S(() => { window.__studioInput.teleport = { x: 5.4, y: 2.3, yaw: Math.PI / 2 }; });
await page.locator(".st-ai-btn").click();
await page.locator('.st-ai [data-sample="living"]').click();
await page.waitForFunction(() => window.__studio.getState().ai?.status === "ready", null, { timeout: 30000 });
await page.locator(".st-ai__accept").click();
await page.waitForFunction(() => window.__studio.getState().ai?.status === "applied", null, { timeout: 30000 });
await page.locator(".st-ai-btn").click(); // close the panel
await page.waitForTimeout(3500);
const items = await S(() => Object.keys(window.__studio.getState().doc.nodes).length);
check("living room furnished before the still", items === 6, String(items));
await page.locator("canvas").screenshot({ path: `${OUT}/live-before-${tag}.png` });
const sizeBefore = await S(() => { const c = document.querySelector("canvas"); return [c.width, c.height]; });

// 1. start from the button; progress shows; finishes inside the gate
check("the Render still control is in the bar", await page.locator(".st-still-btn").isVisible());
await page.locator(".st-still-ctl select").selectOption(preset);
const t0 = Date.now();
await page.locator(".st-still-btn").click();
check("an overlay with a progress bar appears", await page.locator(".st-still").isVisible());
await page.waitForFunction(() => window.__studio.getState().still.status === "rendering", null, { timeout: 90000 }).catch(() => {});
const mid = await S(() => { const s = window.__studio.getState().still; return { status: s.status, w: s.width, h: s.height }; });
await page.waitForTimeout(4000);
await page.locator(".st-still").screenshot({ path: `${OUT}/progress-${tag}.png` });
await page.waitForFunction(() => ["done", "error"].includes(window.__studio.getState().still.status), null, { timeout: 300000 });
const total = (Date.now() - t0) / 1000;
const st = await S(() => { const s = window.__studio.getState().still; return { status: s.status, samples: s.samples, target: s.target, truncated: s.truncated, w: s.width, h: s.height, error: s.error, hasUrl: !!s.url }; });
console.log(`[${backend}] still ${preset}: ${st.status}, ${st.samples.toFixed(1)}/${st.target} samples, ${st.w}x${st.h}, ${total.toFixed(1)} s total (click to image)`, st.error ?? "");
check("the render finished (no error)", st.status === "done" && st.hasUrl, JSON.stringify(st));
check("it reported rendering at the output size", mid.status === "rendering" && mid.w >= 1000, JSON.stringify(mid));
if (preset === "standard") check("M12 gate: the standard still is ready in under 60 s", total < 60, `${total.toFixed(1)} s`);
check("it reached its sample target or ended at the time limit", st.samples >= st.target || st.truncated, `${st.samples.toFixed(1)}/${st.target}`);

// 2. the image itself
const img = await S(async () => {
  const el = document.querySelector(".st-still__img");
  await el.decode();
  const c = document.createElement("canvas"); c.width = 64; c.height = 36;
  const g = c.getContext("2d"); g.drawImage(el, 0, 0, 64, 36);
  const d = g.getImageData(0, 0, 64, 36).data; let sum = 0, lo = 255, hi = 0;
  for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += l; lo = Math.min(lo, l); hi = Math.max(hi, l); }
  return { w: el.naturalWidth, h: el.naturalHeight, mean: sum / (d.length / 4), lo, hi };
});
check("the PNG has the requested size", img.w === st.w && img.h === st.h, `${img.w}x${img.h}`);
check("the picture is lit and has contrast (not black, not blown out)", img.mean > 25 && img.mean < 215 && img.hi - img.lo > 60, JSON.stringify(img));
await page.locator(".st-still").screenshot({ path: `${OUT}/done-${tag}.png` });
if (!mobile) {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.locator(".st-still__dl").click()]);
  check("download gives a .png with a plain name", /^haveniq-.*-(draft|standard|fine)-\d{8}\.png$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  await dl.saveAs(`${OUT}/still-${preset}-${tag}.png`);
}

// 3. close: the live view is back at its own size and the design is unchanged
await page.locator(".st-still__row button").last().click();
await page.waitForTimeout(2500);
const sizeAfter = await S(() => { const c = document.querySelector("canvas"); return [c.width, c.height]; });
check("closing returns the canvas to its normal size", sizeAfter[0] === sizeBefore[0] && sizeAfter[1] === sizeBefore[1], `${sizeBefore} -> ${sizeAfter}`);
check("the design still has its 6 pieces", (await S(() => Object.keys(window.__studio.getState().doc.nodes).length)) === 6);
await page.locator("canvas").screenshot({ path: `${OUT}/live-after-${tag}.png` });

// 4. cancel mid-render restores everything
await page.locator(".st-still-ctl select").selectOption("fine");
await page.locator(".st-still-btn").click();
await page.waitForFunction(() => window.__studio.getState().still.status === "rendering", null, { timeout: 90000 });
await page.waitForTimeout(1500);
await page.keyboard.press("Escape");
await page.waitForTimeout(2500);
check("Escape cancels a running render", (await S(() => window.__studio.getState().still.status)) === "idle" && !(await page.locator(".st-still").isVisible()));
const sizeCancel = await S(() => { const c = document.querySelector("canvas"); return [c.width, c.height]; });
check("and the canvas is restored", sizeCancel[0] === sizeBefore[0] && sizeCancel[1] === sizeBefore[1], `${sizeCancel}`);

// 5. not offered where it cannot work
await S(() => window.__studio.getState().setMode("plan"));
await page.waitForTimeout(500);
check("the control is hidden outside Walk mode", (await page.locator(".st-still-btn").count()) === 0);

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
const fails = results.filter((r) => !r).length;
console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);
