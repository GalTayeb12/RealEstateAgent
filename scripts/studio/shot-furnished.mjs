#!/usr/bin/env node
// Furnishes the apartment through the AI route (free dry-run planner, validated batch) and takes
// review screenshots of each room plus a plan view. Writes docs/design-studio/results/<dir>/.
//   JWT_SECRET=... node scripts/studio/shot-furnished.mjs [--base=http://localhost:3001] [--dir=m11]
import { chromium } from "@playwright/test";
import jwt from "jsonwebtoken";
import fs from "node:fs";

const args = process.argv.slice(2);
const flag = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split("=")[1];
const base = flag("base", "http://localhost:3001");
const dir = `docs/design-studio/results/${flag("dir", "m11")}`;
fs.mkdirSync(dir, { recursive: true });
const token = jwt.sign({ userId: `shots-${Date.now()}`, email: "shots@example.test", role: "admin" }, process.env.JWT_SECRET ?? "studio-bench-dummy", { expiresIn: "1h" });
const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
await ctx.addCookies([{ name: "hq_session", value: token, domain: "localhost", path: "/" }, { name: "haveniq-locale", value: "en", domain: "localhost", path: "/" }]);
const page = await ctx.newPage();
await page.goto(`${base}/studio/yarkon-twin-shell?debug`);
await page.waitForFunction(() => window.__studio?.getState().ready, null, { timeout: 90000 });
await page.addStyleTag({ content: ".st-ui, nextjs-portal { display: none !important }" });
await page.waitForTimeout(4000);

for (const prompt of ["living room", "dining", "bedroom", "kitchen"]) {
  const r = await page.evaluate(async (prompt) => {
    const s = window.__studio.getState();
    const res = await fetch("/api/studio/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baselineId: s.doc.baseline.id, doc: s.doc, prompt }) });
    const j = await res.json();
    if (j.batch) s.dispatch(j.batch);
    return `${prompt}: ${j.accepted} accepted, ${j.rejected.length} rejected - ${j.summary}`;
  }, prompt);
  console.log(r);
}
await page.waitForTimeout(3000);
const shot = async (name, x, y, yaw) => { await page.evaluate(([a, b, c]) => { window.__studioInput.teleport = { x: a, y: b, yaw: c }; }, [x, y, yaw]); await page.waitForTimeout(2200); await page.locator("canvas").screenshot({ path: `${dir}/${name}.png` }); };
await shot("furnished-living", 7.6, 2.3, Math.PI / 2);
await shot("furnished-dining", 6.2, 3.9, Math.PI * 0.75);
await shot("furnished-master", 9.2, 0.6, -Math.PI * 0.25);
await page.evaluate(() => window.__studio.getState().setMode("plan"));
await page.waitForTimeout(2500);
await page.locator("canvas").screenshot({ path: `${dir}/furnished-plan.png` });
const n = await page.evaluate(() => Object.keys(window.__studio.getState().doc.nodes).length);
console.log(`${n} nodes placed`);
await browser.close();
