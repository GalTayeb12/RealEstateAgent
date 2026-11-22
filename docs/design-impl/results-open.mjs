// Opens (does not submit) the hero offer panel and the group modal, screenshots the hero; then follows "property details" and screenshots the back button.
import { chromium } from "playwright"; import fs from "node:fs";
const b = await chromium.launch(); const ctx = await b.newContext({ storageState: process.env.STATE, viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: "haveniq-locale", value: "he", url: "http://localhost:3001" }]);
await ctx.addInitScript((v) => sessionStorage.setItem("matchResults", v), fs.readFileSync(process.env.MATCH, "utf8"));
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
const shot = (n) => p.screenshot({ path: new URL(`./shots/${n}.png`, import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1") });
await p.goto("http://localhost:3001/results", { waitUntil: "load" }); await p.waitForTimeout(2500);
await p.locator(".rh-act button").first().click(); await p.waitForTimeout(600); await shot("r-offer");
await p.locator(".rh-card").nth(2).click(); await p.waitForTimeout(1500); await shot("r-sel3");
await p.locator(".rh-act a").first().click(); await p.waitForTimeout(3500); console.log("details url", p.url()); await shot("r-details");
console.log("history", await p.evaluate(() => window.history.length)); await p.locator(".av-backbtn").click({ force: true }); await p.waitForTimeout(5000); console.log("after back", p.url(), "errors", errs.length ? errs : "none");
await b.close();
