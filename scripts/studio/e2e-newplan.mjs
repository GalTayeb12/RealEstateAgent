#!/usr/bin/env node
// A freshly built apartment (from the build worker) works end to end for a buyer: the tour has the studio button,
// the studio opens the automatic starter design, an edit is saved and survives a reload.
//   node scripts/studio/e2e-newplan.mjs <walk-slug> [--base=http://localhost:3001]
import { chromium } from "@playwright/test";
import fs from "node:fs";
import jwt from "jsonwebtoken";

const slug = process.argv[2];
if (!slug) { console.error("usage: e2e-newplan.mjs <walk-slug>"); process.exit(2); }
const base = (process.argv.find((a) => a.startsWith("--base=")) ?? "--base=http://localhost:3001").slice(7);
const OUT = "docs/design-studio/results/newplan";
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
const userId = `e2e-newplan-${slug}-${Date.now()}`; // a fresh visitor every run: no saved design from an earlier run
const token = jwt.sign({ userId, email: "e2e@example.test", role: "buyer" }, secret(), { expiresIn: "1h" });
const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };

const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
await ctx.addCookies([{ name: "hq_session", value: token, domain: "localhost", path: "/" }, { name: "haveniq-locale", value: "en", domain: "localhost", path: "/" }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
page.on("response", (r) => { if (r.status() >= 400 && !/lm-B(-2k)?\.webp|\/studio\/lighting\//.test(r.url())) errors.push(`${r.status()} ${r.url().slice(0, 120)}`); });
const S = (fn, a) => page.evaluate(fn, a);
const count = () => S(() => Object.keys(window.__studio.getState().doc.nodes).length);

await page.goto(`${base}/walk/${slug}`, { timeout: 120000 });
await page.waitForSelector(".aw-studio a", { timeout: 90000 }).catch(() => {});
check("the tour renders and shows the Design Studio button", (await page.locator(".aw-studio a").count()) === 1);
await page.screenshot({ path: `${OUT}/${slug}-tour.png` });
await page.locator(".aw-studio a").click();
await page.waitForURL(new RegExp(`/studio/${slug}-shell`), { timeout: 60000 });
await page.goto(`${base}/studio/${slug}-shell?debug`);
await page.waitForFunction(() => window.__studio?.getState().ready, null, { timeout: 120000 });
await page.addStyleTag({ content: "nextjs-portal { display: none !important }" });
await page.waitForTimeout(4000);
const seedN = await S(() => Object.keys(window.__studio.getState().seed.nodes).length);
// a returning test user may already have a saved design: start from the developer's design
page.on("dialog", (d) => d.accept());
if ((await count()) !== seedN) { await page.getByRole("button", { name: "Developer's design" }).click(); await page.waitForTimeout(800); }
check("the studio opens the automatic starter design", (await count()) === seedN && seedN > 0, `${await count()} pieces`);
await page.locator("canvas").screenshot({ path: `${OUT}/${slug}-studio.png` });
await S(() => window.__studio.getState().setMode("plan"));
await page.waitForTimeout(2500);
await page.locator("canvas").screenshot({ path: `${OUT}/${slug}-plan.png` });
await S(() => window.__studio.getState().setMode("walk"));

// edit -> explicit Save -> reload -> the edit is still there
await S(() => { const st = window.__studio.getState(); st.dispatch({ type: "remove", id: Object.keys(st.doc.nodes)[0] }); });
check("a piece can be removed", (await count()) === seedN - 1);
await page.locator(".st-save").click();
await page.waitForTimeout(2500);
await page.goto(`${base}/studio/${slug}-shell?debug`);
await page.waitForFunction(() => window.__studio?.getState().ready, null, { timeout: 120000 });
await page.waitForFunction((n) => Object.keys(window.__studio.getState().doc.nodes).length === n, seedN - 1, { timeout: 15000 }).catch(() => {});
check("the saved design survives a reload", (await count()) === seedN - 1, `${await count()} pieces`);
check("no page errors or failed requests", errors.length === 0, errors.slice(0, 4).join(" | "));
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
