import { chromium } from "playwright";
const b = await chromium.launch(); const errs=[];
const ctx = await b.newContext({ viewport:{width:390,height:844}, reducedMotion:"reduce" });
await ctx.addCookies([{name:"haveniq-locale",value:"en",url:"http://localhost:3001"}]);
const p = await ctx.newPage(); p.on("console",m=>m.type()==="error"&&errs.push(m.text())); p.on("pageerror",e=>errs.push(String(e)));
await p.goto("http://localhost:3001/",{waitUntil:"load"}); await p.waitForTimeout(1500);
console.log("reduced: hidden reveals", await p.evaluate(()=>document.querySelectorAll("[data-rv=hide]").length), "score", await p.locator(".score").innerText());
await p.click(".hv-burger"); await p.waitForTimeout(500);
console.log("menu links", await p.locator(".hv-menu a").allInnerTexts());
await p.click(".hv-menu a[href='#developers']"); await p.waitForTimeout(800);
console.log("scrollY after anchor", await p.evaluate(()=>Math.round(scrollY)), "devTop", await p.evaluate(()=>Math.round(document.querySelector("#developers").getBoundingClientRect().top)));
const hrefs = await p.evaluate(()=>[...document.querySelectorAll(".hv a[href^='/']")].map(a=>a.getAttribute("href")));
console.log("routes", [...new Set(hrefs)]);
await p.setViewportSize({width:1440,height:900}); await p.click(".hv-lang button:first-child"); await p.waitForTimeout(1500);
console.log("after toggle lang/dir", await p.evaluate(()=>[document.documentElement.lang, document.querySelector(".hv").dir]));
// keyboard focus
await p.keyboard.press("Tab"); console.log("first focus:", await p.evaluate(()=>document.activeElement.textContent.trim()));
console.log("errors", errs.length?errs:"none"); await b.close();
