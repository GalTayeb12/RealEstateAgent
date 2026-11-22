import { chromium } from "playwright";
const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2})).newPage();
await p.goto("http://localhost:3001/design-lab/c2?lang=en",{waitUntil:"networkidle"}); await p.waitForTimeout(1500);
await p.evaluate(()=>document.querySelector("#building").scrollIntoView({block:"center"})); await p.waitForTimeout(600);
await p.locator(".c2-band").nth(4).click({force:true}); await p.mouse.move(5,5); await p.waitForTimeout(2500);
const v=await p.locator(".c2-viewport").boundingBox(); await p.screenshot({path:"shots/v2-fx-zoom.png",clip:v});
console.log(await p.evaluate(()=>getComputedStyle(document.querySelector(".c2-lit")).clipPath));
await b.close();
