// node docs/design-impl/results-shot.mjs <tag> [lang] [w] [h]  (env STATE, MATCH) — viewport shot of /results with saved match data
import { chromium } from "playwright"; import fs from "node:fs";
const [tag, lang="en", w="1440", h="1500"] = process.argv.slice(2);
const b = await chromium.launch(); const ctx = await b.newContext({ storageState: process.env.STATE, viewport:{width:+w,height:+h} });
await ctx.addCookies([{name:"haveniq-locale",value:lang,url:"http://localhost:3001"}]);
const mr = fs.readFileSync(process.env.MATCH,"utf8"); await ctx.addInitScript(v => sessionStorage.setItem("matchResults", v), mr);
if (lang==="en") await ctx.route("**/api/profile",r=>r.request().method()==="GET"?r.fulfill({status:404,body:"{}"}):r.abort());
const p = await ctx.newPage(); const errs=[]; p.on("console",m=>m.type()==="error"&&errs.push(m.text().slice(0,160)));
await p.goto("http://localhost:3001/results",{waitUntil:"load"}); await p.waitForTimeout(2500);
await p.screenshot({ fullPage: !!process.env.FULL, path:new URL(`./shots/${tag}.png`,import.meta.url).pathname.replace(/^\/([A-Z]:)/,"$1") });
console.log(tag,"errors",errs.length?errs:"none","sw",await p.evaluate(()=>document.documentElement.scrollWidth)); await b.close();
