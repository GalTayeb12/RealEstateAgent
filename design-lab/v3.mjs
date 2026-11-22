import { chromium } from "playwright";
const out="shots"; const b=await chromium.launch({args:["--use-gl=swiftshader","--enable-webgl","--ignore-gpu-blocklist"]});
const scroll=(p,sel,blk="start")=>p.evaluate(([s,k])=>{const r=document.querySelector(".dl-root");r.style.scrollBehavior="auto";document.querySelector(s).scrollIntoView({block:k})},[sel,blk]);
for (const [lang,w,h,tag] of [["he",1440,900,"d"],["en",1440,900,"d"],["he",390,844,"m"],["en",390,844,"m"]]) {
  const p=await (await b.newContext({viewport:{width:w,height:h}})).newPage();
  const errs=[]; p.on("console",m=>{if(m.type()==="error")errs.push(m.text())}); p.on("pageerror",e=>errs.push(String(e)));
  await p.goto(`http://localhost:3001/design-lab/c3?lang=${lang}`,{waitUntil:"networkidle"}).catch(()=>{}); await p.waitForTimeout(2800);
  const n=`v3-${tag}-${lang}`;
  await p.screenshot({path:`${out}/${n}-hero.png`,timeout:120000});
  await scroll(p,"#advisor"); await p.waitForTimeout(3200); await p.screenshot({path:`${out}/${n}-match.png`,timeout:120000});
  await scroll(p,"#building","center"); await p.waitForTimeout(3500); await p.screenshot({path:`${out}/${n}-mini.png`,timeout:120000});
  await p.locator(".c3-floors button").nth(3).click(); await p.waitForTimeout(1500);
  await p.locator(".c3-units button").nth(1).click(); await p.waitForTimeout(1200); await p.screenshot({path:`${out}/${n}-mini2.png`,timeout:120000});
  await scroll(p,".c3-apt-stage","center"); await p.waitForTimeout(2200); await p.screenshot({path:`${out}/${n}-apt1.png`,timeout:120000});
  await p.locator(".c3-apt-bar .seg button").nth(1).click(); await p.waitForTimeout(1600); await p.screenshot({path:`${out}/${n}-apt2.png`,timeout:120000});
  await p.locator(".c3-apt-bar .seg button").nth(0).click(); await p.waitForTimeout(900);
  await scroll(p,".c3-devsec","center"); await p.waitForTimeout(2400); await p.screenshot({path:`${out}/${n}-dev.png`,timeout:120000});
  await p.evaluate(()=>{const r=document.querySelector(".dl-root");r.scrollTop=r.scrollHeight}); await p.waitForTimeout(1800); await p.screenshot({path:`${out}/${n}-end.png`,timeout:120000});
  console.log(n,"errors:",errs.slice(0,3));
  await p.context().close();
}
await b.close();
