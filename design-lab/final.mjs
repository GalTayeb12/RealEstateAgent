import { chromium } from "playwright";
const b=await chromium.launch();
for (const [lang,w,h,tag] of [["he",1440,900,"d"],["en",1440,900,"d"],["he",390,844,"m"],["en",390,844,"m"]]) {
  const p=await (await b.newContext({viewport:{width:w,height:h}})).newPage();
  const errs=[]; p.on("console",m=>{if(m.type()==="error")errs.push(m.text())}); p.on("pageerror",e=>errs.push(String(e)));
  await p.goto(`http://localhost:3001/design-lab/c3?lang=${lang}`,{waitUntil:"networkidle"}).catch(()=>{}); await p.waitForTimeout(2500);
  const n=`v3-${tag}-${lang}`;
  await p.screenshot({path:`shots/${n}-hero.png`});
  await p.addStyleTag({content:"body>header,body>footer,body>nav{display:none!important}.dl-root{position:static!important;overflow:visible!important}"});
  await p.evaluate(()=>document.querySelectorAll("[data-in]").forEach(e=>e.setAttribute("data-in","1"))); await p.waitForTimeout(2500);
  await p.screenshot({path:`shots/${n}-full.png`,fullPage:true,timeout:90000});
  const sw=await p.evaluate(()=>document.documentElement.scrollWidth); 
  console.log(n,"errors:",errs.length?errs:"none","scrollWidth",sw);
  await p.context().close();
}
await b.close();
