import { chromium } from "playwright";
const out = process.argv[2]; const b = await chromium.launch();
const L = (l) => `?lang=${l}`;
async function ctx(w,h){ const c = await b.newContext({viewport:{width:w,height:h}}); return c.newPage(); }
const scroll = (p, y) => p.evaluate((y)=>{const r=document.querySelector(".dl-root");r.style.scrollBehavior="auto";r.scrollTop=y*innerHeight},y);
for (const [lang,w,h,tag] of [["he",1440,900,"d"],["en",1440,900,"d"],["he",390,844,"m"],["en",390,844,"m"]]) {
  const p = await ctx(w,h);
  await p.goto(`http://localhost:3001/design-lab/c2${L(lang)}`, {waitUntil:"networkidle"}).catch(()=>{});
  await p.waitForTimeout(2200);
  const n = `v2-${tag}-${lang}`;
  await p.screenshot({path:`${out}/${n}-s0.png`});
  for (const [i,y] of [[1,1.4],[2,2.8],[3,3.9],[4,4.45]]) { await scroll(p,y); await p.waitForTimeout(1300); await p.screenshot({path:`${out}/${n}-s${i}.png`}); }
  // advisor + facade
  await p.evaluate(()=>document.querySelector("#advisor").scrollIntoView()); await p.waitForTimeout(2800); await p.screenshot({path:`${out}/${n}-advisor.png`});
  await p.evaluate(()=>document.querySelector("#building").scrollIntoView({block:"center"})); await p.waitForTimeout(800);
  const band = p.locator(".c2-band").nth(2);
  await band.hover({force:true}).catch(()=>{}); await p.waitForTimeout(1000);
  await band.click({force:true}).catch(()=>{}); await p.waitForTimeout(1000);
  await p.screenshot({path:`${out}/${n}-facade.png`});
  await p.locator(".c2-u").first().click({force:true}).catch(()=>{}); await p.waitForTimeout(1800);
  await p.screenshot({path:`${out}/${n}-tour.png`});
  await p.keyboard.press("Escape");
  await p.evaluate(()=>document.querySelector(".c2-plates").scrollIntoView({block:"center"})); await p.waitForTimeout(1800); await p.screenshot({path:`${out}/${n}-plates.png`});
  await p.evaluate(()=>{const r=document.querySelector(".dl-root");r.scrollTop=r.scrollHeight}); await p.waitForTimeout(1600); await p.screenshot({path:`${out}/${n}-end.png`});
  // results + dev
  for (const pg of ["results","developer"]) { await p.goto(`http://localhost:3001/design-lab/c2/${pg}${L(lang)}`, {waitUntil:"networkidle"}).catch(()=>{}); await p.waitForTimeout(2200); await p.screenshot({path:`${out}/v2-${tag}-${lang}-${pg}.png`});
    await p.addStyleTag({content:"body>header,body>footer,body>nav{display:none!important}.dl-root{position:static!important;overflow:visible!important}"}); await p.evaluate(()=>document.querySelectorAll("[data-in]").forEach(e=>e.setAttribute("data-in","1"))); await p.waitForTimeout(1500); await p.screenshot({path:`${out}/v2-${tag}-${lang}-${pg}-full.png`,fullPage:true}); }
  await p.context().close();
}
await b.close();
