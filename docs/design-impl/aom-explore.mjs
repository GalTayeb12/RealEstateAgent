// Drills into the building explorer on an /aom page (floor -> apartment) and screenshots each state. No data is written.
// STATE=<storageState> node docs/design-impl/aom-explore.mjs <aomId> [locale]
import { chromium } from "playwright";
const [id, lang = "he"] = process.argv.slice(2);
const b = await chromium.launch(); const ctx = await b.newContext({ storageState: process.env.STATE, viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{ name: "haveniq-locale", value: lang, url: "http://localhost:3001" }]);
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
const shot = (n) => p.screenshot({ path: new URL(`./shots/${n}.png`, import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1") });
await p.goto("http://localhost:3001/aom/" + id, { waitUntil: "load" }); await p.waitForTimeout(3500); await shot("ax-0");
const floor = p.locator(".hn-ps-floor").first();
if (await floor.count()) { await floor.click({ force: true }); await p.waitForTimeout(2500); await shot("ax-1"); }
await p.mouse.click(1280, 260); await p.waitForTimeout(3500); await p.mouse.click(718, 310); await p.waitForTimeout(4500); await shot("ax-2");
console.log("errors", errs.length ? errs : "none");
await b.close();
