// Usage: node docs/design-impl/shots.mjs <tag> [path]   (dev server on :3001)
import { chromium } from "playwright";
const tag = process.argv[2] ?? "run", path = (process.argv[3] ?? "").startsWith("/") && !process.argv[3].includes(":") ? process.argv[3] : "/";
const out = new URL("./shots/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const b = await chromium.launch();
for (const [lang, w, h, d] of [["he",1440,900,"d"],["en",1440,900,"d"],["he",390,844,"m"],["en",390,844,"m"]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  await ctx.addCookies([{ name: "haveniq-locale", value: lang, url: "http://localhost:3001" }]);
  const p = await ctx.newPage(); const errs = [];
  p.on("console", m => { if (m.type() === "error") errs.push(m.text()); }); p.on("pageerror", e => errs.push(String(e)));
  await p.goto("http://localhost:3001" + path, { waitUntil: "load" }).catch(e => console.log("GOTO", String(e).slice(0,200))); await p.waitForTimeout(2500);
  const n = `${tag}-${d}-${lang}`;
  await p.screenshot({ path: `${out}${n}-hero.png` });
  // scroll through so reveal-on-scroll content shows, then capture full page
  const H = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += h * 0.6) { await p.evaluate(v => window.scrollTo(0, v), y); await p.waitForTimeout(350); }
  await p.waitForTimeout(2000); await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}${n}-full.png`, fullPage: true, timeout: 90000 });
  const sw = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  console.log(n, "errors:", errs.length ? errs : "none", "scrollWidth", sw[0], "viewport", sw[1]);
  await ctx.close();
}
await b.close();
