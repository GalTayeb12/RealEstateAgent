// node docs/design-impl/dev-flow.mjs <tag> [w] [h]   (env STATE) — dashboard expanded + unit-type page + stage page
import { chromium } from "playwright";
const [tag, w="1440", h="900"] = process.argv.slice(2);
const out = (n) => new URL(`./shots/${tag}-${n}.png`, import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const b = await chromium.launch(); const ctx = await b.newContext({ storageState: process.env.STATE, viewport:{width:+w,height:+h} });
await ctx.addCookies([{name:"haveniq-locale",value:"en",url:"http://localhost:3001"}]);
const p = await ctx.newPage(); const errs=[]; p.on("console",m=>m.type()==="error"&&errs.push(m.text().slice(0,140))); p.on("pageerror",e=>errs.push(String(e).slice(0,140)));
await p.goto("http://localhost:3001/dev/dashboard",{waitUntil:"load"}); await p.waitForTimeout(2500);
await p.getByText("מגדלי דמרי").first().click().catch(()=>{}); await p.waitForTimeout(800); await p.getByText("מגדלי השרון").first().click().catch(()=>{}); await p.waitForTimeout(1500);
await p.screenshot({ path: out("dash-open"), fullPage:true, timeout:60000 });
const unit = await p.locator("a[href^='/dev/properties/']").first().getAttribute("href").catch(()=>null);
const stage = await p.locator("a[href*='/stage']").first().getAttribute("href").catch(()=>null);
console.log("links", unit, stage);
for (const [n,u] of [["unit",unit],["stage",stage]]) if (u) { await p.goto("http://localhost:3001"+u,{waitUntil:"load"}); await p.waitForTimeout(4000); await p.screenshot({ path: out(n), fullPage:true, timeout:90000 }); }
console.log(tag,"errors",errs.length?[...new Set(errs)]:"none","sw",await p.evaluate(()=>document.documentElement.scrollWidth)); await b.close();
