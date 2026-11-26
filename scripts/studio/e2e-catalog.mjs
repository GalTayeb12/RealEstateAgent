#!/usr/bin/env node
// Admin catalog (M11) end to end against the dev server: permissions, import -> gates -> publish (new
// release), a GLB uploaded through the admin catalog served from Storage and rendered in the studio at
// its real size, a lying manifest blocked by the gates, immutable versions, retire (hidden from browsing,
// still rendered in an existing design), release history. Everything it creates is retired at the end.
//   node scripts/studio/e2e-catalog.mjs [--base=http://localhost:3001] [--lang=he]
import { chromium } from "@playwright/test";
import fs from "node:fs";
import jwt from "jsonwebtoken";

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split("=").slice(1).join("=");
const base = arg("base", "http://localhost:3001");
const lang = arg("lang", "en");
const OUT = "docs/design-studio/results/m11";
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
const sign = (role) => jwt.sign({ userId: `e2e-cat-${role}`, email: `${role}@e2e.example.test`, role }, secret(), { expiresIn: "1h" });
const ADMIN = sign("admin"), DEV = sign("developer");
const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const api = async (token, body) => {
  const init = body instanceof FormData ? { method: "POST", body } : body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {};
  const r = await fetch(`${base}/api/studio/admin/catalog`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
  return { status: r.status, json: await r.json().catch(() => null) };
};

const run = Date.now().toString(36);
const paintId = `e2e-paint-${run}`, drumId = `e2e-drum-${run}`, badId = `e2e-bad-${run}`;
const index = JSON.parse(fs.readFileSync("public/studio/catalog/index.json", "utf8"));
const drum = index.models.find((m) => m.id === "coffee-drum-01");
const glb = fs.readFileSync(`public/studio/catalog/${drum.assets.glb}`);
const preview = fs.readFileSync(`public/studio/catalog/${drum.assets.preview}`);
const modelForm = (id, dims) => {
  const m = { ...structuredClone(drum), id, version: 1, name: { he: "תוף בדיקה", en: "E2E drum" }, dims, assets: { glb: "model.glb", preview: "preview.webp" } };
  const fd = new FormData();
  fd.set("manifest", JSON.stringify(m));
  fd.append("files", new Blob([glb]), "model.glb");
  fd.append("files", new Blob([preview]), "preview.webp");
  return fd;
};
const paint = { type: "material", id: paintId, version: 1, name: { he: "צבע בדיקה", en: "E2E paint" }, category: "paint", styles: [], tileSize: [1, 1], pbr: { baseColor: "#7a8f86", roughness: 0.9, metalness: 0, maps: {} }, license: { spdx: "HAVENIQ-ORIGINAL", sourceUrl: "https://haveniq.local/flat-colour", author: "HAVENIQ" } };

// 1. permissions
check("admin API: developer gets 404", (await api(DEV)).status === 404);
check("admin API: anonymous gets 404", (await fetch(`${base}/api/studio/admin/catalog`)).status === 404);
const before = (await api(ADMIN)).json;
check("admin API: admin sees the registry", before && before.head >= 1, `head ${before?.head}`);

const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
const devCtx = await browser.newContext();
await devCtx.addCookies([{ name: "hq_session", value: DEV, domain: "localhost", path: "/" }]);
const devPage = await devCtx.newPage();
const devResp = await devPage.goto(`${base}/admin/catalog`);
check("admin page: developer gets 404", devResp.status() === 404);
await devCtx.close();

// 2. import a material through the UI, run the gates, publish -> new release
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{ name: "hq_session", value: ADMIN, domain: "localhost", path: "/" }, { name: "haveniq-locale", value: lang, domain: "localhost", path: "/" }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
await page.goto(`${base}/admin/catalog`);
await page.waitForSelector(`[data-testid="head"]:not(:text("…"))`);
const head0 = Number(await page.locator('[data-testid="head"]').textContent());
await page.locator(".ca-card textarea").fill(JSON.stringify(paint, null, 2));
await page.locator('[data-action="import"]').click();
await page.waitForSelector(`tr[data-key="material:${paintId}@1"]`);
check("UI import creates a draft", (await page.locator(`tr[data-key="material:${paintId}@1"]`).getAttribute("data-status")) === "draft");
await page.locator(`tr[data-key="material:${paintId}@1"] input[type=checkbox]`).check();
check("publish is refused before the gates ran", ((r) => r.status === 409)(await api(ADMIN, { action: "publish", keys: [`material:${paintId}@1`] })));
await page.locator('[data-action="check"]').click();
await page.waitForSelector(".ca-msg--ok");
await page.locator(`tr[data-key="material:${paintId}@1"] input[type=checkbox]`).check();
await page.locator(".ca-actions input").fill("e2e paint");
await page.locator('[data-action="publish"]').click();
await page.waitForFunction((h) => Number(document.querySelector('[data-testid="head"]')?.textContent) === h + 1, head0);
check("UI publish creates the next release", (await page.locator(`tr[data-key="material:${paintId}@1"]`).getAttribute("data-status")) === "published", `release ${head0 + 1}`);
await page.screenshot({ path: `${OUT}/admin-${lang}.png` });

// 3. a model with uploaded GLB + preview: gates pass, publish, the asset is served from Storage
const imp = await api(ADMIN, modelForm(drumId, drum.dims));
check("model import stores its files and rewrites the paths", imp.status === 201 && imp.json.entry.manifest.assets.glb.startsWith("/api/studio/catalog/assets/"), imp.json?.entry?.manifest?.assets?.glb);
const chk = await api(ADMIN, { action: "check", keys: [`model:${drumId}@1`] });
check("uploaded GLB passes the geometry gates", chk.status === 200 && chk.json.entries[0].issues.length === 0, JSON.stringify(chk.json?.entries?.[0]?.issues));
const pub = await api(ADMIN, { action: "publish", keys: [`model:${drumId}@1`], note: "e2e drum" });
check("publishing the model creates a release", pub.status === 200 && pub.json.release.models.some((m) => m.id === drumId));
const assetResp = await fetch(base + imp.json.entry.manifest.assets.glb);
check("the stored GLB is served", assetResp.status === 200 && assetResp.headers.get("content-type") === "model/gltf-binary" && (await assetResp.arrayBuffer()).byteLength === glb.length);

// 4. the gates block a manifest that lies about its size; nothing is published
await api(ADMIN, modelForm(badId, { ...drum.dims, w: drum.dims.w + 0.3 }));
const bad = await api(ADMIN, { action: "check", keys: [`model:${badId}@1`] });
check("gates catch a GLB that does not match its manifest", bad.json.entries[0].issues.some((i) => i.startsWith("w is")), bad.json.entries[0].issues[0]);
const badPub = await api(ADMIN, { action: "publish", keys: [`model:${badId}@1`] });
check("and publishing it is refused with the reasons", badPub.status === 409 && badPub.json.issues.length > 0);
check("a published version is immutable", (await api(ADMIN, modelForm(drumId, drum.dims))).status === 409);

// 5. the studio loads the new release and renders the uploaded model at its real size
const studio = await ctx.newPage();
studio.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
await studio.goto(`${base}/studio/yarkon-twin-shell?debug`);
await studio.waitForFunction(() => window.__studio?.getState().ready, null, { timeout: 120000 });
check("the studio catalog lists the new model and material", await studio.evaluate(([d, p]) => { const s = window.__studio.getState(); return s.models.some((m) => m.id === d) && s.materials.some((m) => m.id === p); }, [drumId, paintId]));
await studio.evaluate((d) => {
  const st = window.__studio.getState();
  const m = st.models.find((q) => q.id === d);
  st.dispatch({ type: "add", node: { id: "e2e-cat-drum", kind: "item", locked: false, catalog: { id: m.id, version: m.version }, slots: {}, transform: { x: 3.5, y: 2.3, z: 0, rot: 0 } } });
}, drumId);
await studio.waitForFunction(() => !!window.__studioBounds?.("e2e-cat-drum"), null, { timeout: 40000 }).catch(() => {}); // the GLB loads from the asset route; wait for it instead of a fixed pause
await studio.waitForTimeout(1000);
const bounds = await studio.evaluate(() => window.__studioBounds?.("e2e-cat-drum"));
const w = bounds ? bounds[3] - bounds[0] : 0;
check("the uploaded GLB renders at its catalog width", Math.abs(w - drum.dims.w) < 0.015, `${(w * 100).toFixed(1)} cm`);
const doc = await studio.evaluate(() => window.__studio.getState().doc);

// 6. retire: hidden from browsing, still rendered in the existing design
const ret = await api(ADMIN, { action: "retire", keys: [`model:${drumId}@1`], note: "e2e retire" });
check("retiring creates a release listing it as retired", ret.status === 200 && ret.json.release.retired.includes(`model:${drumId}@1`));
await studio.reload();
await studio.waitForFunction(() => window.__studio?.getState().ready, null, { timeout: 120000 });
check("a retired model is no longer offered in the catalog", !(await studio.evaluate((d) => window.__studio.getState().models.some((m) => m.id === d), drumId)));
await studio.evaluate((d) => window.__studio.getState().replaceDocument(d, null), doc);
await studio.waitForFunction(() => !!window.__studioBounds?.("e2e-cat-drum"), null, { timeout: 40000 }).catch(() => {});
await studio.waitForTimeout(1000);
const b2 = await studio.evaluate(() => window.__studioBounds?.("e2e-cat-drum"));
check("but a design that already uses it still renders it", !!b2 && Math.abs(b2[3] - b2[0] - drum.dims.w) < 0.015);

// 7. history and clean-up
const after = (await api(ADMIN)).json;
check("release history keeps every release", after.releases.length >= before.releases.length + 3 && after.releases[0].release === after.head);
await api(ADMIN, { action: "discard", keys: [`model:${badId}@1`] });
await api(ADMIN, { action: "retire", keys: [`material:${paintId}@1`], note: "e2e clean-up" });
check("no page errors", errors.length === 0, errors[0] ?? "");
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
