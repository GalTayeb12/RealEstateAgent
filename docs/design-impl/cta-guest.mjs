// Guest (no session) clicks the homepage "start interview" button and screenshots the apartment section.
import { chromium } from "playwright";
const b = await chromium.launch();
for (const [w, h, tag] of [[1440, 900, "d"], [390, 844, "m"]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  await ctx.addCookies([{ name: "haveniq-locale", value: "he", url: "http://localhost:3001" }]);
  const p = await ctx.newPage();
  await p.goto("http://localhost:3001/", { waitUntil: "load" }); await p.waitForTimeout(2500);
  const sec = p.locator("#apartment");
  await sec.scrollIntoViewIfNeeded(); await p.waitForTimeout(1500);
  await sec.screenshot({ path: new URL(`./shots/apt-${tag}.png`, import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1") });
  console.log(tag, "scrollWidth", await p.evaluate(() => document.documentElement.scrollWidth));
  if (tag === "d") {
    await p.locator('a[href="/interview"]').first().click(); await p.waitForTimeout(2500);
    console.log("guest click ->", p.url());
  }
  await ctx.close();
}
await b.close();
