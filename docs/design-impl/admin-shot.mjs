// STATE=<admin storageState> node docs/design-impl/admin-shot.mjs <tag> <locale> [w] — screenshots both admin tabs (no writes)
import { chromium } from "playwright";
const [tag, lang = "he", w = "1440"] = process.argv.slice(2);
const b = await chromium.launch(); const ctx = await b.newContext({ storageState: process.env.STATE, viewport: { width: +w, height: 900 } });
await ctx.addCookies([{ name: "haveniq-locale", value: lang, url: "http://localhost:3001" }]);
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 100)));
if (lang === "en") await p.route("**/api/profile", (r) => r.request().method() === "GET" ? r.abort() : r.continue());
const out = (n) => new URL(`./shots/${n}.png`, import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
await p.goto("http://localhost:3001/dev/admin/approvals", { waitUntil: "load" }); await p.waitForTimeout(3000);
await p.screenshot({ path: out(`${tag}-ov`), fullPage: true });
await p.locator("main button").filter({ hasText: /אישורי יזמים|Developer approvals/ }).first().click(); await p.waitForTimeout(1500);
await p.locator("main button[aria-pressed]").last().click().catch(() => {}); await p.waitForTimeout(500);
await p.screenshot({ path: out(`${tag}-ap`), fullPage: true });
console.log("sw", await p.evaluate(() => document.documentElement.scrollWidth), "errors", errs.length ? errs : "none");
await b.close();
