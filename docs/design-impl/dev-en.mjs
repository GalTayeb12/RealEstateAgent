// English check of developer screens. Blocks GET /api/profile so the account's saved locale (he) can't override the cookie; writes nothing.
// STATE=<dev storage state> node docs/design-impl/dev-en.mjs [w] [h]
import { chromium } from "playwright";
const [w = "1440", h = "900"] = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: +w, height: +h }, storageState: process.env.STATE });
await ctx.addCookies([{ name: "haveniq-locale", value: "en", url: "http://localhost:3001" }]);
await ctx.route("**/api/profile", (r) => (r.request().method() === "GET" ? r.fulfill({ status: 404, body: "{}" }) : r.abort()));
const p = await ctx.newPage(); const errs = [];
p.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 160))); p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
const out = (t) => new URL("./shots/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1") + `${t}.png`;
const rep = async (tag) => console.log(tag, "lang", await p.evaluate(() => document.documentElement.lang + "/" + document.documentElement.dir), "sw", await p.evaluate(() => document.documentElement.scrollWidth), "hebrew-chars", await p.evaluate(() => (document.body.innerText.match(/[֐-׿]/g) || []).length));
await p.goto("http://localhost:3001/dev/dashboard", { waitUntil: "load" }); await p.waitForTimeout(3500);
await rep("dash"); await p.screenshot({ path: out("g-dash-en"), fullPage: true, timeout: 60000 });
// expand first project, then open the first unit-type page if a link exists
await p.locator("main h2, main h3").filter({ hasText: /Towers|Rainbow|Dmeri|Sharon|Tel Aviv/i }).first().click({ timeout: 4000 }).catch(() => {});
await p.waitForTimeout(800); await p.screenshot({ path: out("g-dash-en-open"), fullPage: true, timeout: 60000 });
const hrefs = await p.$$eval('a[href^="/dev/properties/"]', (a) => a.map((x) => x.getAttribute("href")));
console.log("property links", hrefs.length);
for (const t of ["Reservations", "Offers", "Groups", "Group"]) {
  const tab = p.getByRole("button", { name: new RegExp(t, "i") }).first();
  if (await tab.count()) { await tab.click().catch(() => {}); await p.waitForTimeout(800); await rep("tab-" + t); await p.screenshot({ path: out("g-tab-" + t.toLowerCase()), fullPage: true, timeout: 60000 }); }
}
if (hrefs[0]) { await p.goto("http://localhost:3001" + hrefs[0], { waitUntil: "load" }); await p.waitForTimeout(3000); await rep("property"); await p.screenshot({ path: out("g-property-en"), fullPage: true, timeout: 60000 }); }
console.log("errors", errs.length ? errs : "none");
await b.close();
