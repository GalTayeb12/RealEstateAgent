#!/usr/bin/env node
// End-to-end check of the M12 photo render through the real UI (needs a GPU; uses the discrete one).
//   JWT_SECRET=... node scripts/studio/e2e-still.mjs [--base=http://localhost:3001] [--lang=en|he] [--samples=32]
import { chromium } from "@playwright/test";
import jwt from "jsonwebtoken";

const args = process.argv.slice(2);
const flag = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split("=")[1];
const base = flag("base", "http://localhost:3001");
const lang = flag("lang", "en");
const samples = Number(flag("samples", "32"));
const T = (he, en) => (lang === "he" ? he : en);
const token = jwt.sign({ userId: `e2e-${Date.now()}`, email: "e2e@example.test", role: "admin" }, process.env.JWT_SECRET ?? "studio-bench-dummy", { expiresIn: "1h" });
const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };

const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--force_high_performance_gpu"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addCookies([{ name: "hq_session", value: token, domain: "localhost", path: "/" }, { name: "haveniq-locale", value: lang, domain: "localhost", path: "/" }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
await page.goto(`${base}/studio/yarkon-twin-shell?debug`);
await page.waitForFunction(() => window.__studio?.getState().ready, null, { timeout: 90000 });
await page.addStyleTag({ content: "nextjs-portal { display: none !important }" });
await page.waitForTimeout(3000);

const btn = page.getByRole("button", { name: new RegExp(T("צילום איכותי", "Photo render")) });
check("the photo render button is offered in walk mode", await btn.isVisible());
await page.getByRole("tab", { name: T("תוכנית", "Plan") }).click();
check("…but not in the floor planner", !(await btn.isVisible()));
await page.getByRole("tab", { name: T("עיצוב", "Design") }).click();

// a small sample target keeps the check short; the real default is STILL_SAMPLES
await page.evaluate((n) => { const s = window.__studio.getState(); const orig = s.startStill; window.__studio.setState({ startStill: () => orig(n) }); }, samples);
await btn.click();
const panel = page.getByRole("complementary", { name: T("צילום באיכות גבוהה", "Photo-quality render") });
check("the render panel opens with progress", await panel.isVisible() && await panel.getByRole("progressbar").count() === 1);
check("the button is disabled while rendering", await btn.isDisabled());
const t0 = Date.now();
const done = await page.waitForFunction(() => { const s = window.__studio.getState().still; return s && (s.status === "done" || s.status === "error") ? s.status : null; }, null, { timeout: 300000, polling: 500 }).then((h) => h.jsonValue());
check("the render finishes", done === "done", `${((Date.now() - t0) / 1000).toFixed(1)} s`);
const link = panel.getByRole("link", { name: T("הורדת PNG", "Download PNG") });
const href = await link.getAttribute("href");
check("a PNG download is offered", !!href && href.startsWith("data:image/png;base64,") && href.length > 50000, `${Math.round((href?.length ?? 0) / 1024)} KB`);
const dl = await Promise.all([page.waitForEvent("download"), link.click()]).then(([d]) => d.suggestedFilename());
check("the download has a sensible name", /^haveniq-render-\d{4}-\d{2}-\d{2}\.png$/.test(dl), dl);
check("the document is untouched by rendering", await page.evaluate(() => window.__studio.getState().canUndo === false));
await page.keyboard.press("Escape");
check("Esc closes the render and returns to the live view", await page.evaluate(() => window.__studio.getState().still === null) && !(await panel.isVisible()));
await page.waitForTimeout(1000);
check("no page errors", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(results.every(Boolean) ? "\nall passed" : "\nSOME FAILED");
process.exit(results.every(Boolean) ? 0 : 1);
