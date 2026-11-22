import { chromium } from "playwright";
const [,, outDir, ...specs] = process.argv; // spec: name|url|w|h|full|cookieLocale
const b = await chromium.launch();
for (const s of specs) {
  const [name, url, w, h, full, locale, sc] = s.split("|");
  const ctx = await b.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
  if (locale) await ctx.addCookies([{ name: "haveniq-locale", value: locale, url: "http://localhost:3001" }]);
  const p = await ctx.newPage();
  await p.goto("http://localhost:3001" + url, { waitUntil: "networkidle" }).catch(()=>{});
  await p.waitForTimeout(2500);
  if (sc) { await p.evaluate((m)=>{const r=document.querySelector(".dl-root");r.style.scrollBehavior="auto";r.scrollTop=m*innerHeight},+sc); await p.waitForTimeout(900); }
  if (full === "1") { await p.addStyleTag({content:"body>header,body>footer,body>nav{display:none!important}.dl-root{position:static!important;overflow:visible!important}"}); await p.evaluate(()=>document.querySelectorAll("[data-in]").forEach(e=>e.setAttribute("data-in","1"))); await p.waitForTimeout(2500); }
  await p.screenshot({ path: `${outDir}/${name}.png`, fullPage: full === "1" });
  await ctx.close();
}
await b.close();
