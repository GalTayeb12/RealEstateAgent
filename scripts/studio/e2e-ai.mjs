#!/usr/bin/env node
// AI designer (M10) end to end, dry-run provider (no paid calls): panel -> sample prompt -> ghost preview ->
// accept (one undo step) / reject; outdated proposals refused; API auth, validation and rate limit.
//   node scripts/studio/e2e-ai.mjs [--base=http://localhost:3001] [--lang=he] [--mobile]
// JWT_SECRET: environment, .env.local or .env (same as the dev server). Shots: docs/design-studio/results/m10/.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import jwt from "jsonwebtoken";
import { rolesOpen } from "./roles.mjs";

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split("=").slice(1).join("=");
const base = arg("base", "http://localhost:3001");
const lang = arg("lang", "en");
const mobile = process.argv.includes("--mobile");
const tag = `${mobile ? "mobile" : "desktop"}-${lang}`;
const OUT = "docs/design-studio/results/m10";
fs.mkdirSync(OUT, { recursive: true });

function secret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  for (const f of [".env.local", ".env"]) {
    if (!fs.existsSync(f)) continue;
    const m = fs.readFileSync(f, "utf8").match(/^JWT_SECRET\s*=\s*"?([^"\r\n]*)"?/m);
    if (m && m[1]) return m[1];
  }
  return "studio-bench-dummy";
}
const sign = (role = "admin") => jwt.sign({ userId: `e2e-ai-${role}-${Date.now()}-${Math.random()}`, email: "e2e@example.test", role }, secret(), { expiresIn: "1h" });

const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };

const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext(mobile
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { viewport: { width: 1500, height: 900 } });
await ctx.addCookies([{ name: "hq_session", value: sign(), domain: "localhost", path: "/" }, { name: "haveniq-locale", value: lang, domain: "localhost", path: "/" }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
await page.goto(`${base}/studio/yarkon-twin-shell?debug&seed=none`);
await page.waitForFunction(() => window.__studio?.getState().ready, null, { timeout: 120000 });
await page.addStyleTag({ content: "nextjs-portal { display: none !important }" });
await page.waitForTimeout(3000);
const S = (fn, a) => page.evaluate(fn, a);
const count = () => S(() => Object.keys(window.__studio.getState().doc.nodes).length);
const waitAi = (status) => page.waitForFunction((st) => window.__studio.getState().ai?.status === st, status, { timeout: 30000 });

// stand in the living room looking west, at the wall the seating group will use
await S(() => { window.__studioInput.teleport = { x: 5.4, y: 2.3, yaw: Math.PI / 2 }; });
/** Canvas shot from the walker, then the whole apartment from Plan (top view), back to Walk. */
const shots = async (name) => {
  await page.waitForTimeout(2500);
  await page.locator("canvas").screenshot({ path: `${OUT}/${name}-${tag}.png` });
  await S(() => window.__studio.getState().setMode("plan"));
  await page.waitForTimeout(2500);
  await page.locator("canvas").screenshot({ path: `${OUT}/${name}-plan-${tag}.png` });
  await S(() => window.__studio.getState().setMode("walk"));
  await page.waitForTimeout(1500);
};

// 1. open the panel from the toolbar and send the first sample prompt by clicking its chip
await page.locator(".st-ai-btn").click();
check("AI panel opens from the toolbar", await page.locator(".st-ai").isVisible());
check("dry-run badge is shown", (await page.locator(".st-ai .st-panel__head span").textContent()).length > 0);
await page.locator('.st-ai [data-sample="living"]').click();
await waitAi("ready");
let ai = await S(() => { const a = window.__studio.getState().ai; return { added: a.response.added.length, dropped: a.response.dropped.length, provider: a.response.provider, preview: Object.keys(a.preview.nodes).length }; });
check("living-room sample: 6 pieces proposed, nothing dropped, dry-run provider", ai.added === 6 && ai.dropped === 0 && ai.provider === "dryrun", JSON.stringify(ai));
check("the design itself is unchanged while previewing", (await count()) === 0);
check("ghost preview document holds the proposed pieces", (await S(() => Object.keys(window.__studio.getState().ai.preview.nodes).length)) === 6);
await page.screenshot({ path: `${OUT}/panel-preview-${tag}.png` });
await shots("preview");
check("still only a preview after looking around", (await count()) === 0 && (await S(() => window.__studio.getState().ai?.status)) === "ready");

// 2. accept -> one command; undo removes the whole proposal in one step
await page.locator(".st-ai__accept").click();
await waitAi("applied");
check("accept applies all 6 pieces", (await count()) === 6);
await shots("applied");
await page.locator(".st-ai__undo").click();
await page.waitForTimeout(500);
check("one undo removes the whole proposal", (await count()) === 0);
check("undo leaves nothing to undo (it was one step)", !(await S(() => window.__studio.getState().canUndo)));

// 3. reject: a bedroom proposal is discarded without touching the design
await page.locator('.st-ai [data-sample="bedroom"]').click();
await waitAi("ready");
check("bedroom sample proposes bed, wardrobe and bedside table", (await S(() => window.__studio.getState().ai.response.added.length)) === 3);
await page.locator(".st-ai__reject").click();
await page.waitForTimeout(300);
check("reject discards the proposal and leaves the design unchanged", (await S(() => window.__studio.getState().ai)) === null && (await count()) === 0);

// 4. a proposal whose spot was taken in the meantime is refused on accept
await page.locator('.st-ai [data-sample="bedroom"]').click();
await waitAi("ready");
await S(() => {
  const st = window.__studio.getState();
  const bedId = st.ai.response.added.find((id) => st.ai.preview.nodes[id].catalog.id === "bed-upholstered-01");
  const bed = st.ai.preview.nodes[bedId];
  const m = st.models.find((q) => q.id === "coffee-drum-01");
  st.dispatch({ type: "add", node: { id: "blocker", kind: "item", locked: false, catalog: { id: m.id, version: m.version }, slots: {}, transform: { ...bed.transform, z: 0 } } });
});
const accepted = await S(() => window.__studio.getState().acceptAi());
const lastError = await S(() => window.__studio.getState().lastError);
check("an outdated proposal is refused with a reason", accepted === false && lastError === "ai.outdated", String(lastError));
check("and the design keeps only the user's own change", (await count()) === 1);
await S(() => { const st = window.__studio.getState(); st.rejectAi(); st.undo(); });

// 5. the five sample prompts in this language all come back valid from the real endpoint
const samples = await S(async (lg) => {
  const st = window.__studio.getState();
  const out = [];
  for (const id of ["living", "bedroom", "kitchen", "warmer", "office"]) {
    const chip = document.querySelector(`.st-ai [data-sample="${id}"]`);
    const r = await fetch("/api/studio/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug: "yarkon-twin-shell", prompt: chip.textContent, lang: lg, doc: st.doc }) });
    const j = await r.json();
    out.push({ id, status: r.status, ok: !!j.command, dropped: j.dropped?.length ?? -1, changes: (j.added?.length ?? 0) + (j.surfaces?.length ?? 0) });
  }
  return out;
}, lang);
check("all five sample prompts return a valid batch with nothing dropped", samples.every((s) => s.status === 200 && s.ok && s.dropped === 0 && s.changes > 0), JSON.stringify(samples));

// 6. API: input validation and an unknown request (a fresh user: the one above has used its per-minute allowance)
const apiCtx = await browser.newContext();
const apiTok = sign();
const api = async (body) => { const r = await apiCtx.request.post(`${base}/api/studio/ai`, { data: body, headers: { Authorization: `Bearer ${apiTok}` } }); return { status: r.status(), body: await r.json().catch(() => null) }; };
const doc = await S(() => window.__studio.getState().doc);
const unknown = await api({ slug: "yarkon-twin-shell", prompt: "qwerty asdf", lang, doc });
check("unknown request -> empty proposal, no command", unknown.status === 200 && unknown.body.command === null, String(unknown.status));
for (const [name, body] of [
  ["bad slug is rejected", { slug: "../etc", prompt: "x", lang, doc }],
  ["empty prompt is rejected", { slug: "yarkon-twin-shell", prompt: "  ", lang, doc }],
  ["an over-long prompt is rejected", { slug: "yarkon-twin-shell", prompt: "x".repeat(501), lang, doc }],
  ["a document for another apartment is rejected", { slug: "yarkon-twin-shell", prompt: "x", lang, doc: { ...doc, baseline: { ...doc.baseline, id: "other" } } }],
  ["garbage document is rejected", { slug: "yarkon-twin-shell", prompt: "x", lang, doc: { nope: 1 } }],
]) {
  const r = await api(body);
  check(name, r.status === 400, `${r.status} ${r.body?.error ?? ""}`);
}
await apiCtx.close();
const anon = await browser.newContext();
const anonRes = await anon.request.post(`${base}/api/studio/ai`, { data: { slug: "yarkon-twin-shell", prompt: "x", lang, doc } });
check("anonymous callers get 404", anonRes.status() === 404);
const buyer = await browser.newContext();
const buyerRes = await buyer.request.post(`${base}/api/studio/ai`, { data: { slug: "yarkon-twin-shell", prompt: "x", lang, doc }, headers: { Authorization: `Bearer ${sign("buyer")}` } });
check(rolesOpen ? "a buyer is let in (STUDIO_ROLES=*)" : "a buyer role gets 404", rolesOpen ? buyerRes.status() !== 404 : buyerRes.status() === 404);
await anon.close(); await buyer.close();

// 7. rate limit (per user): a fresh user hammers the endpoint
const rl = await browser.newContext();
const tok = sign();
const statuses = [];
for (let i = 0; i < 12; i++) statuses.push((await rl.request.post(`${base}/api/studio/ai`, { data: { slug: "yarkon-twin-shell", prompt: "qwerty", lang, doc }, headers: { Authorization: `Bearer ${tok}` } })).status());
check("the rate limit answers 429 after the allowance", statuses.includes(429) && statuses[0] === 200, statuses.join(","));
await rl.close();

check("no page errors", errors.length === 0, errors[0] ?? "");
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
