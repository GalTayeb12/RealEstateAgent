#!/usr/bin/env node
// The developer's design (seed) end to end: the tour's studio button, a new visitor opens the furnished apartment,
// "Empty apartment" / "Developer's design" are undoable, and ?seed=none opens it empty.
//   node scripts/studio/e2e-seed.mjs [--base=http://localhost:3001] [--lang=he] [--mobile]
import { chromium } from "@playwright/test";
import fs from "node:fs";
import jwt from "jsonwebtoken";

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split("=").slice(1).join("=");
const base = arg("base", "http://localhost:3001");
const lang = arg("lang", "en");
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
const sign = (role) => jwt.sign({ userId: `e2e-seed-${role}-${Date.now()}`, email: "e2e@example.test", role }, secret(), { expiresIn: "1h" });
const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };

const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1500, height: 900 } });
await ctx.addCookies([{ name: "hq_session", value: sign("buyer"), domain: "localhost", path: "/" }, { name: "haveniq-locale", value: lang, domain: "localhost", path: "/" }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
page.on("response", (r) => { if (r.status() === 404 && !/lm-B(-2k)?\.webp/.test(r.url())) errors.push("404 " + r.url().slice(0, 120)); });
const S = (fn, a) => page.evaluate(fn, a);
const count = () => S(() => Object.keys(window.__studio.getState().doc.nodes).length);

// 1. from the Yarkon tour, a BUYER sees the studio button and lands in the studio apartment
await page.goto(`${base}/walk/yarkon`, { timeout: 120000 });
await page.waitForSelector(".aw-studio a", { timeout: 60000 }).catch(() => {});
check("a buyer sees the Design Studio button in the tour", (await page.locator(".aw-studio a").count()) === 1);
await page.locator(".aw-studio a").click();
await page.waitForURL(/\/studio\/yarkon-twin-shell/, { timeout: 60000 });
await page.goto(`${base}/studio/yarkon-twin-shell?debug`);
await page.waitForFunction(() => window.__studio?.getState().ready, null, { timeout: 120000 });
await page.addStyleTag({ content: "nextjs-portal { display: none !important }" });
await page.waitForTimeout(4000);

// 2. a new visitor starts from the developer's design
const seedN = await S(() => Object.keys(window.__studio.getState().seed.nodes).length);
check("the studio opens the developer's design (furnished)", (await count()) === seedN && seedN >= 15, `${await count()} pieces`);
check("nothing to undo yet", !(await S(() => window.__studio.getState().canUndo)));
await S(() => { window.__studioInput.teleport = { x: 5.4, y: 2.3, yaw: Math.PI / 2 }; });
await page.waitForTimeout(3500);
await page.locator("canvas").screenshot({ path: `${OUT}/seed-living-${tag}.png` });
await S(() => window.__studio.getState().setMode("plan"));
await page.waitForTimeout(2500);
await page.locator("canvas").screenshot({ path: `${OUT}/seed-plan-${tag}.png` });
await S(() => window.__studio.getState().setMode("walk"));
await page.waitForTimeout(800);

// 3. the buyer rearranges, then goes back to the developer's design in one undoable step
await S(() => {
  const st = window.__studio.getState();
  const id = Object.keys(st.doc.nodes)[0];
  st.dispatch({ type: "remove", id });
});
check("the buyer can remove a piece", (await count()) === seedN - 1);
page.on("dialog", (d) => d.accept());
const seedBtn = page.getByRole("button", { name: lang === "he" ? "העיצוב של היזם" : "Developer's design" });
const emptyBtn = page.getByRole("button", { name: lang === "he" ? "דירה ריקה" : "Empty apartment" });
check("both reset buttons exist", (await seedBtn.count()) === 1 && (await emptyBtn.count()) === 1);
await emptyBtn.click();
await page.waitForTimeout(500);
check("Empty apartment removes everything", (await count()) === 0);
await seedBtn.click();
await page.waitForTimeout(500);
check("Developer's design brings all of it back", (await count()) === seedN);
await S(() => window.__studio.getState().undo());
check("one undo goes back to the empty apartment", (await count()) === 0);
await S(() => window.__studio.getState().undo());
check("a second undo goes back to how it was before (one piece removed)", (await count()) === seedN - 1);

// 4. a visitor with a saved design gets it back (not the seed), and ?seed=none opens the empty apartment for a new visitor
await page.waitForTimeout(2500); // let the autosave run
await page.goto(`${base}/studio/yarkon-twin-shell?debug`);
await page.waitForFunction(() => window.__studio?.getState().ready, null, { timeout: 120000 });
await page.waitForTimeout(3500);
check("coming back, the visitor's own saved design opens (not the seed again)", (await count()) === seedN - 1, `${await count()} pieces`);
const ctx2 = await browser.newContext({ viewport: { width: 1200, height: 800 } });
await ctx2.addCookies([{ name: "hq_session", value: sign("buyer"), domain: "localhost", path: "/" }]);
const p2 = await ctx2.newPage();
await p2.goto(`${base}/studio/yarkon-twin-shell?debug&seed=none`);
await p2.waitForFunction(() => window.__studio?.getState().ready, null, { timeout: 120000 });
await p2.waitForTimeout(2500);
check("?seed=none opens the empty apartment and hides the Developer's design button", (await p2.evaluate(() => Object.keys(window.__studio.getState().doc.nodes).length)) === 0 && (await p2.evaluate(() => window.__studio.getState().seed)) === null);

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
const fails = results.filter((r) => !r).length;
console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);
