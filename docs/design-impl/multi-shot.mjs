// STATE=<state> node docs/design-impl/multi-shot.mjs <lang> <w> <h> tag=/path [tag=/path ...]  (sets requestedRetake so /interview does not redirect)
import { chromium } from "playwright";
const [lang, w, h, ...pairs] = process.argv.slice(2);
const base = "http://localhost:3001";
const b = await chromium.launch();
for (const pr of pairs) {
  const i = pr.indexOf("="); const tag = pr.slice(0, i), path = pr.slice(i + 1);
  const ctx = await b.newContext({ viewport: { width: +w, height: +h }, ...(process.env.STATE ? { storageState: process.env.STATE } : {}) });
  await ctx.addCookies([{ name: "haveniq-locale", value: lang, url: base }]);
  await ctx.addInitScript(() => sessionStorage.setItem("requestedRetake", "true"));
  if (lang === "en") await ctx.route("**/api/profile", (r) => (r.request().method() === "GET" ? r.fulfill({ status: 404, body: "{}" }) : r.abort()));
  const p = await ctx.newPage(); const errs = [];
  p.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 100))); p.on("pageerror", (e) => errs.push(String(e).slice(0, 100)));
  await p.goto(base + path, { waitUntil: "load" }).catch(() => {}); await p.waitForTimeout(3500);
  const out = new URL(`./shots/${tag}.png`, import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
  await p.screenshot({ path: out, fullPage: !!process.env.FULL, timeout: 60000 });
  console.log(tag, p.url().replace(base, ""), "sw", await p.evaluate(() => document.documentElement.scrollWidth), errs.length ? errs.slice(0, 2) : "no-errors");
  await ctx.close();
}
await b.close();
