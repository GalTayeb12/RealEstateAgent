#!/usr/bin/env node
// Browser check of persistence (autosave, reload, conflict, versions, share links, offline draft).
//   JWT_SECRET=... node scripts/studio/e2e-persist.mjs [--base=http://localhost:3001]
import { chromium } from "@playwright/test";
import jwt from "jsonwebtoken";

const base = (process.argv.find((a) => a.startsWith("--base=")) ?? "--base=http://localhost:3001").slice(7);
const secret = process.env.JWT_SECRET ?? "studio-bench-dummy";
// --uid=<id> pins the user (needed with STUDIO_STORE=prisma: create it first with dev-db-users.mjs add)
const uid = (process.argv.find((a) => a.startsWith("--uid=")) ?? "").slice(6) || `e2e-persist-${Date.now()}`;
const token = jwt.sign({ userId: uid, email: `${uid}@example.test`, role: "developer" }, secret, { expiresIn: "1h" });
const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };

const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 }, permissions: ["clipboard-read", "clipboard-write"] });
await ctx.addCookies([{ name: "hq_session", value: token, domain: "localhost", path: "/" }, { name: "haveniq-locale", value: "en", domain: "localhost", path: "/" }]);

async function open(context) {
  const p = await context.newPage();
  await p.goto(`${base}/studio/yarkon-twin-shell?debug`);
  await p.waitForFunction(() => window.__studio?.getState().ready, null, { timeout: 90000 });
  await p.addStyleTag({ content: "nextjs-portal { display: none !important }" });
  await p.waitForFunction(() => ["saved", "local", "offline"].includes(window.__studio.getState().design?.status), null, { timeout: 30000 });
  return p;
}
const S = (p, fn, arg) => p.evaluate(fn, arg);
const status = (p) => S(p, () => { const d = window.__studio.getState().design; return d ? { s: d.status, rev: d.revision, id: d.id, mode: d.mode } : null; });
const items = (p) => S(p, () => Object.values(window.__studio.getState().doc.nodes).map((n) => n.id));
const waitSaved = (p, minRev) => p.waitForFunction((r) => { const d = window.__studio.getState().design; return d && d.status === "saved" && d.revision >= r; }, minRev, { timeout: 15000 });
const addItem = (p, id, x = 3, y = 2) => S(p, ([id, x, y]) => window.__studio.getState().dispatch({ type: "add", node: { id, kind: "item", locked: false, catalog: { id: "coffee-drum-01", version: 1 }, transform: { x, y, z: 0, rot: 0 }, slots: {} } }), [id, x, y]);

// 1. first visit creates a design; edits autosave; reload restores them
const p1 = await open(ctx);
let st = await status(p1);
check("first visit creates a design and starts saved", st?.s === "saved" && st.rev === 1 && !!st.id, st?.id);
await addItem(p1, "persist-a");
await waitSaved(p1, 2);
check("autosave after an edit (revision 2)", (await status(p1)).rev === 2);
await p1.reload();
await p1.waitForFunction(() => window.__studio?.getState().design?.status === "saved", null, { timeout: 30000 });
check("reload restores the saved design", (await items(p1)).includes("persist-a") && (await status(p1)).id === st.id);

// 2. second tab: conflict is reported, reload resolves it
const p2 = await open(ctx);
await addItem(p2, "persist-b", 5, 2);
await waitSaved(p2, 3);
await addItem(p1, "persist-c", 6, 2); // p1 is still on revision 2
await p1.waitForFunction(() => window.__studio.getState().design.status === "conflict", null, { timeout: 15000 });
check("editing from a stale tab shows a conflict (nothing overwritten)", (await status(p1)).s === "conflict");
await p1.getByRole("button", { name: "Reload" }).click();
await p1.waitForFunction(() => window.__studio.getState().design.status === "saved", null, { timeout: 15000 });
const after = await items(p1);
check("reload shows the other tab's version, not the stale local edit", after.includes("persist-b") && !after.includes("persist-c"));
await p2.close();

// 3. versions: save one, change, restore
await p1.getByRole("button", { name: "More" }).click();
p1.once("dialog", (d) => d.accept("Before changes"));
await p1.getByRole("button", { name: /Save a version/ }).click();
await p1.getByText("Before changes").waitFor();
await p1.getByRole("button", { name: "Close" }).first().click().catch(() => undefined);
await S(p1, () => window.__studio.getState().dispatch({ type: "remove", id: "persist-b" }));
await waitSaved(p1, (await status(p1)).rev + 1);
check("change saved after the version", !(await items(p1)).includes("persist-b"));
await p1.getByRole("button", { name: "More" }).click();
await p1.getByRole("button", { name: "Restore", exact: true }).first().click();
await p1.waitForFunction(() => window.__studio.getState().doc.nodes["persist-b"], null, { timeout: 15000 });
check("restoring a version brings its content back", (await items(p1)).includes("persist-b"));

// 4. share links
const designId = (await status(p1)).id;
const mk = async (permission) => S(p1, async ([id, permission]) => (await (await fetch(`/api/studio/designs/${id}/shares`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ permission }) })).json()).token, [designId, permission]);
const viewTok = await mk("view"), editTok = await mk("edit");
const anon = await browser.newContext({ viewport: { width: 1200, height: 800 } }); // no cookies: a stranger with a link
const pv = await anon.newPage();
await pv.goto(`${base}/studio/shared/${viewTok}?debug`);
await pv.waitForFunction(() => window.__studio?.getState().design?.mode === "shared-view", null, { timeout: 60000 });
check("view link opens the design read-only without login", (await items(pv)).includes("persist-b"));
check("Design tab is disabled on a view link", await pv.locator(".st-modes [role=tab]").nth(1).isDisabled());
const refused = await S(pv, () => window.__studio.getState().dispatch({ type: "remove", id: "persist-b" }));
check("editing on a view link is refused", refused === false && (await items(pv)).includes("persist-b"));
const pe = await anon.newPage();
await pe.goto(`${base}/studio/shared/${editTok}?debug`);
await pe.waitForFunction(() => window.__studio?.getState().design?.mode === "shared-edit", null, { timeout: 60000 });
const revBefore = (await status(pe)).rev;
await addItem(pe, "persist-shared", 4, 3);
await pe.waitForFunction((r) => window.__studio.getState().design.status === "saved" && window.__studio.getState().design.revision > r, revBefore, { timeout: 15000 });
const owner = await S(p1, async (id) => (await (await fetch(`/api/studio/designs/${id}`)).json()).design.data.nodes, designId);
check("an edit link can save, and the owner sees it", !!owner["persist-shared"]);
const bad = await anon.newPage();
const r404 = await bad.goto(`${base}/studio/shared/not-a-real-link`);
check("unknown link is 404", r404.status() === 404);
await anon.close();

// 5. offline: edits are kept in a local draft and saved when the network returns
await p1.reload();
await p1.waitForFunction(() => window.__studio?.getState().design?.status === "saved", null, { timeout: 30000 });
await p1.route("**/api/studio/designs/*", (route) => (route.request().method() === "PUT" ? route.abort() : route.continue()));
await addItem(p1, "persist-offline", 2, 3);
await p1.waitForFunction(() => window.__studio.getState().design.status === "offline", null, { timeout: 15000 });
check("a failed save is reported as offline, not lost", (await status(p1)).s === "offline");
await p1.waitForTimeout(600); // let the draft reach IndexedDB
await p1.unroute("**/api/studio/designs/*");
await p1.reload();
await p1.waitForFunction(() => window.__studio?.getState().design && window.__studio.getState().doc.nodes["persist-offline"], null, { timeout: 30000 });
check("the local draft is re-applied after reload", (await items(p1)).includes("persist-offline"));
await p1.waitForFunction(() => window.__studio.getState().design.status === "saved", null, { timeout: 15000 });
const serverNodes = await S(p1, async (id) => (await (await fetch(`/api/studio/designs/${id}`)).json()).design.data.nodes, designId);
check("and it is saved to the server once online", !!serverNodes["persist-offline"]);

// cleanup
await S(p1, async (id) => { await fetch(`/api/studio/designs/${id}`, { method: "DELETE" }); }, designId);
await browser.close();
const failed = results.filter((x) => !x).length;
console.log(failed ? `${failed} FAILED` : "ALL PASSED");
process.exit(failed ? 1 : 0);
