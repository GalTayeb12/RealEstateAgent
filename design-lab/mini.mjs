import { chromium } from "playwright";
const b=await chromium.launch({args:["--use-gl=swiftshader","--enable-webgl","--ignore-gpu-blocklist"]});
const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
await p.goto("http://localhost:3001/design-lab/c3?lang=en",{waitUntil:"networkidle"}); await p.waitForTimeout(1500);
await p.evaluate(()=>{const r=document.querySelector(".dl-root");r.style.scrollBehavior="auto";document.querySelector("#building").scrollIntoView({block:"center"})}); await p.waitForTimeout(4000);
await p.locator(".c3-floors button").nth(3).click(); await p.mouse.move(5,5); await p.waitForTimeout(2500);
await p.screenshot({path:"shots/v3-mini-test.png",timeout:120000}); await p.screenshot({path:"shots/v3-hero-test.png",timeout:60000}).catch(()=>{});
await b.close();
