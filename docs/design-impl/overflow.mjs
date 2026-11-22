// STATE=<state> node docs/design-impl/overflow.mjs <path> [w] — lists elements wider than the viewport (en, saved locale override blocked)
import { chromium } from "playwright";
const [path, w = "390"] = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: +w, height: 844 }, storageState: process.env.STATE });
await ctx.addCookies([{ name: "haveniq-locale", value: "en", url: "http://localhost:3001" }]);
await ctx.route("**/api/profile", (r) => (r.request().method() === "GET" ? r.fulfill({ status: 404, body: "{}" }) : r.abort()));
const p = await ctx.newPage();
await p.goto("http://localhost:3001" + path, { waitUntil: "load" }); await p.waitForTimeout(3500);
console.log(await p.evaluate((vw) => [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > vw + 1).slice(0, 12).map((e) => `${e.tagName}.${String(e.className).slice(0, 40)} right=${Math.round(e.getBoundingClientRect().right)} "${(e.textContent || "").slice(0, 30)}"`).join("\n"), +w));
await b.close();
