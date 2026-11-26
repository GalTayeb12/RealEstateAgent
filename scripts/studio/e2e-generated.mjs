#!/usr/bin/env node
// Places every generator-built item in its room, checks the rendered geometry against the resolved size,
// changes parameters through the command engine, and writes review screenshots to results/m8.
//   JWT_SECRET=... node scripts/studio/e2e-generated.mjs [--base=http://localhost:3001]
import { chromium } from "@playwright/test";
import jwt from "jsonwebtoken";

const base = (process.argv.find((a) => a.startsWith("--base=")) ?? "--base=http://localhost:3001").split("=")[1];
const token = jwt.sign({ userId: `e2e-${Date.now()}`, email: "e2e@example.test", role: "admin" }, process.env.JWT_SECRET ?? "studio-bench-dummy", { expiresIn: "1h" });
const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };

const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
await ctx.addCookies([{ name: "hq_session", value: token, domain: "localhost", path: "/" }, { name: "haveniq-locale", value: "en", domain: "localhost", path: "/" }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
await page.goto(`${base}/studio/yarkon-twin-shell?debug`);
await page.waitForFunction(() => window.__studio?.getState().ready, null, { timeout: 90000 });
await page.addStyleTag({ content: "nextjs-portal { display: none !important }" });
await page.waitForTimeout(4000);
const S = (fn, arg) => page.evaluate(fn, arg);

// id, catalog id, x, y, rot, params
const PI = Math.PI;
const PLACE = [
  ["kb", "kitchen-base-run-01", 5.1, 8.49, PI, { width: 3.4 }],
  ["kw", "kitchen-wall-run-01", 5.1, 8.49, PI, { width: 2.4 }],
  ["wd", "wardrobe-hinged-01", 9.7, 8.49, PI, { width: 2.0, height: 2.4 }],
  ["bd", "bed-upholstered-01", 1.6, 8.49, PI, { width: 1.6, headboard: 1.2 }],
  ["sh", "shelving-open-01", 0.02, 2.0, -PI / 2, { width: 1.8, height: 2.0 }],
  // M11 original furniture (rot 0, spread over the living room and the master bedroom)
  ["dt", "dining-table-01", 5.5, 0.6, 0, { width: 2.2 }],
  ["dk", "desk-01", 9.0, 0.3, 0, { width: 1.6 }],
  ["ct", "console-table-01", 11.0, 0.3, 0, {}],
  ["cr", "coffee-rect-01", 2.0, 3.0, 0, { width: 1.4 }],
  ["bn", "bench-01", 13.0, 0.3, 0, { width: 1.6 }],
  ["sb", "sideboard-01", 9.5, 2.0, 0, { width: 2.4 }],
  ["tv", "tv-unit-01", 12.6, 2.0, 0, { drawers: 2 }],
  ["ns", "nightstand-01", 14.4, 3.5, 0, { drawers: 3 }],
  ["dr", "dresser-01", 9.5, 3.6, 0, { width: 1.6, drawers: 5 }],
  ["ws", "wall-shelf-01", 4.0, 4.5, 0, { width: 1.8 }],
  ["sc", "storage-cabinet-01", 12.0, 3.6, 0, { width: 1.4 }],
];
await S((places) => {
  const st = window.__studio.getState();
  for (const [id, cat, x, y, rot, params] of places) {
    const m = st.models.find((q) => q.id === cat);
    st.dispatch({ type: "add", node: { id, kind: "item", locked: false, catalog: { id: m.id, version: m.version }, slots: {}, params, transform: { x, y, z: 0, rot } } });
  }
}, PLACE);
await page.waitForTimeout(3500);

const sizeOf = (id) => S((i) => { const s = window.__studio.getState(); const n = s.doc.nodes[i]; const m = s.catalog.model(n.catalog); const p = m.sizing.params; const get = (k, d) => n.params?.[k] ?? p.find((q) => q.id === k)?.default ?? d; return { w: m.sizing.params.find((q) => q.drives === "w") ? get(m.sizing.params.find((q) => q.drives === "w").id) : m.dims.w, h: m.sizing.params.find((q) => q.drives === "h") ? get(m.sizing.params.find((q) => q.drives === "h").id) : m.dims.h, d: m.dims.d }; }, id);
for (const [id, cat] of PLACE) {
  const b = await S((i) => window.__studioBounds(i), id);
  const s = await sizeOf(id);
  const rotated = Math.abs(PLACE.find((p) => p[0] === id)[4]) === PI / 2;
  const w = rotated ? b[4] - b[1] : b[3] - b[0], d = rotated ? b[3] - b[0] : b[4] - b[1], h = b[5] - b[2];
  check(`${cat}: rendered ${(w * 100).toFixed(1)} x ${(d * 100).toFixed(1)} x ${(h * 100).toFixed(1)} cm matches ${(s.w * 100).toFixed(0)} x ${(s.d * 100).toFixed(0)} x ${(s.h * 100).toFixed(0)}`, Math.abs(w - s.w) < 0.015 && Math.abs(d - s.d) < 0.025 && Math.abs(h - s.h) < 0.015);
}

// parameter change through the command engine regenerates the geometry at the new size
const ok1 = await S(() => window.__studio.getState().commit({ type: "setParams", id: "kb", params: { width: 2.4 } }, "kb"));
await page.waitForTimeout(1200);
const b1 = await S(() => window.__studioBounds("kb"));
check("kitchen run shrinks from 3.4 m to 2.4 m", ok1 && Math.abs(b1[3] - b1[0] - 2.4) < 0.015, `${((b1[3] - b1[0]) * 100).toFixed(1)} cm`);
const refused = await S(() => window.__studio.getState().commit({ type: "setParams", id: "kb", params: { width: 9 } }, "kb"));
check("an out-of-range parameter is refused", refused === false);
await S(() => window.__studio.getState().undo());
await page.waitForTimeout(1000);
const b2 = await S(() => window.__studioBounds("kb"));
check("undo restores 3.4 m", Math.abs(b2[3] - b2[0] - 3.4) < 0.015);

// review shots
const shot = async (name, x, y, yaw) => { await S(([a, b, c]) => { window.__studioInput.teleport = { x: a, y: b, yaw: c }; }, [x, y, yaw]); await page.waitForTimeout(1800); await page.locator("canvas").screenshot({ path: `docs/design-studio/results/m8/${name}.png` }); };
await shot("kitchen", 5.1, 5.4, 0);
await shot("bedroom-wardrobe", 9.7, 5.2, 0);
await shot("bed", 1.6, 5.0, 0);
await shot("shelving", 4.2, 2.0, PI / 2);
check("no page errors", errors.length === 0, errors[0] ?? "");
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
