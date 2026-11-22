// node docs/design-impl/page-shot.mjs <tag> <path> [locale] [w] [h]
import { chromium } from "playwright";
const [tag, path, lang="en", w="1440", h="900"] = process.argv.slice(2);
const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:+w,height:+h}, ...(process.env.STATE ? { storageState: process.env.STATE } : {}) });
await ctx.addCookies([{name:"haveniq-locale",value:lang,url:"http://localhost:3001"}]);
const p = await ctx.newPage(); const errs=[];
p.on("console",m=>m.type()==="error"&&errs.push(m.text().slice(0,200))); p.on("pageerror",e=>errs.push(String(e).slice(0,200)));
await p.goto("http://localhost:3001"+path,{waitUntil:"load"}).catch(e=>console.log("GOTO",String(e).slice(0,120))); await p.waitForTimeout(3000);
const out=new URL("./shots/",import.meta.url).pathname.replace(/^\/([A-Z]:)/,"$1")+`${tag}.png`;
await p.screenshot({path:out,fullPage:true,timeout:60000});
console.log(tag,"url",p.url(),"errors",errs.length?errs:"none","sw",await p.evaluate(()=>document.documentElement.scrollWidth));
await b.close();
