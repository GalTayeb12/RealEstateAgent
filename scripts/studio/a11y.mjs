// M13: axe-core accessibility audit of the Design Studio in every UI state, English and Hebrew.
//
//   JWT_SECRET=... node scripts/studio/a11y.mjs [--base=http://localhost:3001] [--lang=en|he|both] [--out=file.json]
//
// axe-core (MPL-2.0) is injected from node_modules; nothing is sent anywhere. Exit code 1 when any
// state has a violation of impact "serious" or "critical" (WCAG 2.x A/AA rules). Colour contrast of
// UI floating over the live 3D canvas cannot be computed by axe (it lands in "incomplete", listed).
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import jwt from "jsonwebtoken";

const require = createRequire(import.meta.url);
const AXE = require.resolve("axe-core/axe.min.js");
const flag = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1] ?? d;
const base = flag("base", "http://localhost:3001");
const langs = flag("lang", "both") === "both" ? ["en", "he"] : [flag("lang", "en")];
const out = flag("out", null);

const STATES = [
  ["walk", async () => {}],
  ["design", async (p) => p.evaluate(() => window.__studio.getState().setMode("design"))],
  ["design-selected", async (p) => p.evaluate(() => {
    const s = window.__studio.getState();
    const id = Object.values(s.doc.nodes).find((n) => n.kind === "item")?.id;
    s.select(id ?? null);
  })],
  ["catalog", async (p) => p.evaluate(() => { const s = window.__studio.getState(); s.select(null); s.setCatalogOpen(true); })],
  ["ai-panel", async (p) => p.evaluate(() => { const s = window.__studio.getState(); s.setCatalogOpen(false); s.setAiOpen(true); })],
  ["kitchen-panel", async (p) => p.evaluate(() => { const s = window.__studio.getState(); s.setAiOpen(false); s.setKitchenOpen(true); })],
  ["still-panel", async (p) => p.evaluate(() => { const s = window.__studio.getState(); s.setKitchenOpen(false); s.setStill({ status: "error", samples: 0, target: 128, startedAt: Date.now(), error: "audit" }); })],
  ["plan", async (p) => p.evaluate(() => { const s = window.__studio.getState(); s.setStill(null); s.setMode("plan"); })],
];

const launch = await chromium.launch({ channel: "msedge", headless: true, args: ["--enable-gpu", "--use-angle=d3d11"] });
const report = [];
let failing = 0;
for (const lang of langs) {
  const ctx = await launch.newContext({ viewport: { width: 1440, height: 900 }, locale: lang === "he" ? "he-IL" : "en-US" });
  const token = jwt.sign({ userId: `a11y-${lang}-${Date.now()}`, email: "a11y@example.test", role: "admin" }, process.env.JWT_SECRET ?? "studio-bench-dummy", { expiresIn: "1h" });
  await ctx.addCookies([{ name: "hq_session", value: token, domain: new URL(base).hostname, path: "/" }, { name: "haveniq-locale", value: lang, domain: new URL(base).hostname, path: "/" }]);
  const page = await ctx.newPage();
  await page.goto(`${base}/studio/yarkon-twin-shell?debug`);
  await page.waitForFunction(() => window.__studio?.getState().ready, null, { timeout: 90000 });
  await page.waitForTimeout(2500);
  // one furnished room so the selection and properties panels have real content
  await page.evaluate(async () => {
    const s = window.__studio.getState();
    const r = await fetch("/api/studio/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baselineId: s.doc.baseline.id, doc: s.doc, prompt: "living room" }) });
    const j = await r.json();
    if (j.batch) s.dispatch(j.batch);
  });
  await page.addScriptTag({ path: AXE });
  const audit = async (name) => {
    await page.waitForTimeout(700);
    const r = await page.evaluate(async () => {
      const res = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] }, resultTypes: ["violations", "incomplete"] });
      const pick = (v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map((n) => n.target.join(" ")) });
      return { violations: res.violations.map(pick), incomplete: res.incomplete.map((v) => v.id) };
    });
    const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    failing += bad.length;
    report.push({ lang, state: name, ...r });
    console.log(`${lang} ${name.padEnd(16)} violations ${r.violations.length} (serious/critical ${bad.length})${r.violations.length ? "  " + r.violations.map((v) => `${v.id}[${v.impact}] ${v.nodes[0] ?? ""}`).join(" | ") : ""}`);
  };
  for (const [name, go] of STATES) { await go(page); await audit(name); }
  // the admin catalog page (M11)
  await page.goto(`${base}/admin/catalog`, { timeout: 180000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.addScriptTag({ path: AXE });
  await audit("admin-catalog");
  await ctx.close();
}
await launch.close();
if (out) writeFileSync(out, JSON.stringify({ date: new Date().toISOString(), axe: require("axe-core/package.json").version, report }, null, 2));
console.log(failing ? `FAIL: ${failing} serious/critical violation(s)` : "PASS: no serious/critical violations");
process.exit(failing ? 1 : 0);
