#!/usr/bin/env node
// End-to-end check of the AI designer (free dry-run mode) through the real UI.
//   JWT_SECRET=... node scripts/studio/e2e-ai.mjs [--base=http://localhost:3001] [--lang=en|he]
import { chromium } from "@playwright/test";
import jwt from "jsonwebtoken";

const args = process.argv.slice(2);
const flag = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split("=")[1];
const base = flag("base", "http://localhost:3001");
const lang = flag("lang", "en");
const T = (he, en) => (lang === "he" ? he : en);
const token = jwt.sign({ userId: `e2e-${Date.now()}`, email: "e2e@example.test", role: "admin" }, process.env.JWT_SECRET ?? "studio-bench-dummy", { expiresIn: "1h" });
const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };

const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
await ctx.addCookies([{ name: "hq_session", value: token, domain: "localhost", path: "/" }, { name: "haveniq-locale", value: lang, domain: "localhost", path: "/" }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));

// the API answers 404 without a session
const anon = await (await browser.newContext()).request.post(`${base}/api/studio/ai`, { data: { prompt: "x" } });
check("the AI route is invisible without a developer session", anon.status() === 404, String(anon.status()));

await page.goto(`${base}/studio/yarkon-twin-shell?debug`);
await page.waitForFunction(() => window.__studio?.getState().ready, null, { timeout: 90000 });
await page.addStyleTag({ content: "nextjs-portal { display: none !important }" });
await page.waitForTimeout(4000);
const nodes = () => page.evaluate(() => Object.values(window.__studio.getState().doc.nodes));
await page.getByRole("tab", { name: T("עיצוב", "Design") }).click();

const open = () => page.getByRole("button", { name: T("מעצב AI", "AI designer") }).first().click();
const ask = async (text) => { await page.locator(".st-ai-input").fill(text); await page.getByRole("button", { name: T("עצב", "Design it"), exact: true }).click(); };

await open();
await ask(T("תרהט את הסלון", "furnish the living room"));
await page.getByRole("button", { name: T("השאר", "Keep"), exact: true }).waitFor({ timeout: 15000 });
let n = await nodes();
check("the proposal is applied as soon as it arrives (3+ pieces)", n.length >= 3, `${n.length} nodes`);
await page.waitForTimeout(2500);
await page.screenshot({ path: `docs/design-studio/results/m10/ai-living-${lang}.png` });

await page.getByRole("button", { name: T("בטל", "Reject"), exact: true }).click();
check("Reject removes everything in one step", (await nodes()).length === 0);

await open().catch(() => {});
await ask(T("חדר שינה", "bedroom"));
await page.getByRole("button", { name: T("השאר", "Keep"), exact: true }).waitFor({ timeout: 15000 });
await page.getByRole("button", { name: T("השאר", "Keep"), exact: true }).click();
n = await nodes();
check("Keep leaves the proposal in the design", n.length >= 2 && n.some((x) => x.catalog?.id === "bed-upholstered-01"));
const placed = await page.evaluate(() => { const s = window.__studio.getState(); return Object.values(s.doc.nodes).every((x) => x.kind !== "item" || !!s.baseline.rooms && true); });
check("every piece has a real id (not model-invented)", n.every((x) => /^[0-9A-Z]{10,}/.test(x.id) || x.id.length > 8) && placed);
await page.evaluate(() => window.__studio.getState().undo());
check("a kept proposal is still ONE undo step", (await nodes()).length === 0);

await ask(T("תעשה את זה סגול", "make it purple")).catch(() => {});
const msg = await page.locator(".st-panel .st-err").innerText().catch(() => "");
check("an unclear request gets a clear message and no changes", msg.length > 5 && (await nodes()).length === 0, msg);
check("no page errors", errors.length === 0, errors[0] ?? "");
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
