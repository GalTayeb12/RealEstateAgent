// node docs/design-impl/login.mjs <stateFile>  (env HQ_EMAIL, HQ_PASS) — saves a Playwright session outside the repo
import { chromium } from "playwright";
const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:1440,height:900} });
await ctx.addCookies([{name:"haveniq-locale",value:"en",url:"http://localhost:3001"}]);
const p = await ctx.newPage();
await p.goto("http://localhost:3001/login",{waitUntil:"load"});
await p.fill('input[type=email]', process.env.HQ_EMAIL); await p.fill('input[type=password]', process.env.HQ_PASS);
await p.click('button[type=submit]'); await p.waitForTimeout(4000);
console.log("after login:", p.url());
await ctx.storageState({ path: process.argv[2] }); await b.close();
