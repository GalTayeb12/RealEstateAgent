// M13 mobile pass (EMULATED: Pixel-7-sized viewport, DPR 3, touch, Android UA on the desktop GPU).
// Real multi-touch is driven through CDP Input.dispatchTouchEvent, so the studio sees genuine
// pointerType "touch" events. This is not a phone measurement; a physical device is still needed.
//
//   JWT_SECRET=... node scripts/studio/e2e-mobile.mjs [--base=http://localhost:3001] [--lang=en|he]
//
// Checks: layout fits the screen (no sideways scroll, controls inside the viewport), touch target
// sizes, the tier a phone starts on, tap-to-select opens the bottom sheet, one-finger drag moves a
// piece, two-finger twist rotates it (one undo step), plan pinch zooms, axe on the phone layout.
import { chromium } from "@playwright/test";
import { createRequire } from "node:module";
import jwt from "jsonwebtoken";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const flag = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1] ?? d;
const base = flag("base", "http://localhost:3001");
const lang = flag("lang", "en");
const W = 412, H = 915; // Pixel 7 CSS viewport

let failures = 0;
const check = (name, ok, detail = "") => { if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`); };

const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--force_high_performance_gpu"] });
const ctx = await browser.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36",
});
const token = jwt.sign({ userId: `mobile-${lang}-${Date.now()}`, email: "m@example.test", role: "admin" }, process.env.JWT_SECRET ?? "studio-bench-dummy", { expiresIn: "1h" });
await ctx.addCookies([{ name: "hq_session", value: token, domain: new URL(base).hostname, path: "/" }, { name: "haveniq-locale", value: lang, domain: new URL(base).hostname, path: "/" }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const cdp = await ctx.newCDPSession(page);
const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], i) => ({ x, y, id: i, radiusX: 6, radiusY: 6, force: 1 })) });
const st = (f, arg) => page.evaluate(f, arg);

await page.goto(`${base}/studio/yarkon-twin-shell?debug`);
await page.waitForFunction(() => window.__studio?.getState().ready && window.__studioGL, null, { timeout: 120000 });
await page.waitForTimeout(2500);

// 1. layout
const layout = await st(() => {
  const vw = innerWidth, vh = innerHeight;
  const ctrls = [...document.querySelectorAll(".st-ui button, .st-ui select, .st-ui a")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; });
  const outside = ctrls.filter((e) => { const r = e.getBoundingClientRect(); return r.right > vw + 1 || r.left < -1 || r.bottom > vh + 1; }).map((e) => e.textContent.trim().slice(0, 20) || e.getAttribute("aria-label"));
  const small = ctrls.filter((e) => { const r = e.getBoundingClientRect(); return r.width < 24 || r.height < 24; }).map((e) => `${(e.textContent.trim() || e.getAttribute("aria-label") || e.className).slice(0, 18)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`);
  const under44 = ctrls.filter((e) => { const r = e.getBoundingClientRect(); return r.height < 40; }).length;
  return { scrollW: document.documentElement.scrollWidth, vw, outside, small, total: ctrls.length, under44, dir: document.querySelector(".st-root")?.getAttribute("dir"), tier: window.__studio.getState().tier };
});
check("no sideways scroll", layout.scrollW <= layout.vw, `${layout.scrollW} / ${layout.vw}`);
check("every visible control inside the screen", layout.outside.length === 0, layout.outside.join(", "));
check("touch targets >= 24 px (WCAG 2.2 AA 2.5.8)", layout.small.length === 0, layout.small.join(", "));
console.log(`info: ${layout.under44}/${layout.total} visible controls are under 40 px tall (44 px is the comfortable size)`);
check(`direction ${lang === "he" ? "rtl" : "ltr"}`, layout.dir === (lang === "he" ? "rtl" : "ltr"));
check("phone starts on a shadowless or light tier", layout.tier !== "high", layout.tier);

// furnish the living room and look at it in design mode
await st(async () => {
  const s = window.__studio.getState();
  const r = await fetch("/api/studio/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baselineId: s.doc.baseline.id, doc: s.doc, prompt: "living room" }) });
  const j = await r.json();
  if (j.batch) s.dispatch(j.batch);
  s.setMode("design");
});
// the ottoman stands at the front of the seating group (nothing between it and the camera south of it)
const target = await st(() => { const items = Object.values(window.__studio.getState().doc.nodes).filter((n) => n.kind === "item"); return (items.find((n) => n.catalog.id.startsWith("ottoman")) ?? items.find((n) => n.catalog.id.startsWith("coffee")))?.id ?? null; });
check("living room furnished (ottoman or coffee table present)", !!target);
const t0 = await st((id) => window.__studio.getState().doc.nodes[id].transform, target);
// stand 2.4 m south of the piece, looking north at it
await st(([x, y]) => { window.__studioInput.teleport = { x, y: y - 2.4, yaw: 0 }; }, [t0.x, t0.y]);
await page.waitForTimeout(2500);
const screenOf = (x, y, z) => st(([x, y, z]) => {
  const cam = window.__studioGL.camera();
  cam.updateMatrixWorld();
  const e = cam.matrixWorldInverse.elements, p = cam.projectionMatrix.elements;
  const wx = x, wy = z, wz = -y; // plan -> world
  const vx = e[0] * wx + e[4] * wy + e[8] * wz + e[12], vy = e[1] * wx + e[5] * wy + e[9] * wz + e[13], vz = e[2] * wx + e[6] * wy + e[10] * wz + e[14];
  const cx = p[0] * vx + p[4] * vy + p[8] * vz + p[12], cy = p[1] * vx + p[5] * vy + p[9] * vz + p[13], cw = p[3] * vx + p[7] * vy + p[11] * vz + p[15];
  const r = window.__studioGL.gl.domElement.getBoundingClientRect();
  return [r.left + ((cx / cw + 1) / 2) * r.width, r.top + ((1 - cy / cw) / 2) * r.height];
}, [x, y, z]);
let [sx, sy] = await screenOf(t0.x, t0.y, 0.3);

// 2. tap selects and opens the bottom sheet
await touch("touchStart", [[sx, sy]]);
await touch("touchEnd", []);
await page.waitForTimeout(600);
const sel = await st(() => ({ sel: window.__studio.getState().selection, sheet: document.querySelector(".st-root")?.hasAttribute("data-sheet"), panel: (() => { const p = document.querySelector(".st-panel"); if (!p) return null; const r = p.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), Math.round(r.width)]; })() }));
check("tap selects the piece", sel.sel === target, await st((id) => window.__studio.getState().doc.nodes[id]?.catalog?.id ?? id, sel.sel) + ` at ${sx.toFixed(0)},${sy.toFixed(0)}`);
check("selection opens the bottom sheet (lower half, full width)", sel.sheet && sel.panel && sel.panel[0] >= H * 0.4 && sel.panel[2] >= W - 24, JSON.stringify(sel.panel));
// close the sheet so the stage gets the full height again before measuring the next gestures
await st(() => window.__studio.getState().select(null));
await page.waitForTimeout(700);
[sx, sy] = await screenOf(t0.x, t0.y, 0.3);

// 3. one-finger drag moves it
if (process.env.M_DEBUG) await st(() => { window.__plog = []; for (const t of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) window.addEventListener(t, (e) => window.__plog.push(`${t} ${e.pointerType} ${e.pointerId} ${e.clientX.toFixed(0)},${e.clientY.toFixed(0)}`), true); });
await touch("touchStart", [[sx, sy]]);
for (let i = 1; i <= 8; i++) { await touch("touchMove", [[sx + i * 6, sy]]); await page.waitForTimeout(16); }
if (process.env.M_DEBUG) console.log(await st(() => window.__plog.join(" | ")), " cam", await st(() => { const c = window.__studioGL.camera(); return [c.position.toArray().map((v) => v.toFixed(2)), c.aspect, innerWidth, innerHeight, JSON.stringify(window.__studioGL.gl.domElement.getBoundingClientRect())]; }));
const midDrag = await st(() => { const d = window.__studio.getState().drag; return d ? `${d.x.toFixed(2)},${d.y.toFixed(2)} ok=${d.preview?.ok}` : "no drag"; });
await touch("touchEnd", []);
await page.waitForTimeout(600);
const t1 = await st((id) => window.__studio.getState().doc.nodes[id].transform, target);
check("one-finger drag moves the piece", Math.hypot(t1.x - t0.x, t1.y - t0.y) >= 0.05, `${(t1.x - t0.x).toFixed(2)}, ${(t1.y - t0.y).toFixed(2)} m; mid-drag ${midDrag}; error ${await st(() => window.__studio.getState().lastError)}`);

// 4. two-finger twist rotates it by 90 degrees, position unchanged, one undo step
await st(() => window.__studio.getState().select(null));
await page.waitForTimeout(500);
[sx, sy] = await screenOf(t1.x, t1.y, 0.3);
const R = 70;
await touch("touchStart", [[sx, sy]]);
await touch("touchStart", [[sx, sy], [sx + R, sy]]);
for (let i = 1; i <= 12; i++) { const a = (i / 12) * (Math.PI / 2); await touch("touchMove", [[sx, sy], [sx + R * Math.cos(a), sy + R * Math.sin(a)]]); await page.waitForTimeout(16); }
await touch("touchEnd", []);
await page.waitForTimeout(600);
const t2 = await st((id) => window.__studio.getState().doc.nodes[id].transform, target);
const turned = Math.abs(Math.abs(((t2.rot - t1.rot + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) - Math.PI / 2);
check("two-finger twist turns the piece 90 degrees", turned < 0.01, `${((t2.rot - t1.rot) * 180 / Math.PI).toFixed(1)} deg`);
check("twist keeps the position", Math.hypot(t2.x - t1.x, t2.y - t1.y) < 1e-6);
await st(() => window.__studio.getState().undo());
await page.waitForTimeout(300);
const t3 = await st((id) => window.__studio.getState().doc.nodes[id].transform, target);
check("one undo restores the rotation", Math.abs(t3.rot - t1.rot) < 1e-6);

// 5. plan: pinch zooms
await st(() => window.__studio.getState().setMode("plan"));
await page.waitForTimeout(2500);
const scale0 = await st(() => JSON.stringify(window.__studio.getState().plan));
const cx = W / 2, cy = H / 2;
await touch("touchStart", [[cx - 40, cy], [cx + 40, cy]]);
for (let i = 1; i <= 8; i++) { await touch("touchMove", [[cx - 40 - i * 10, cy], [cx + 40 + i * 10, cy]]); await page.waitForTimeout(16); }
await touch("touchEnd", []);
await page.waitForTimeout(400);
const scale1 = await st(() => JSON.stringify(window.__studio.getState().plan));
check("plan pinch changes the view", scale0 !== scale1);

// 6. axe on the phone layout (design mode with the sheet open)
await st((id) => { const s = window.__studio.getState(); s.setMode("design"); s.select(id); }, target);
await page.waitForTimeout(800);
await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
const axe = await st(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations.map((v) => `${v.id}[${v.impact}] ${v.nodes[0]?.target.join(" ")}`));
check("axe (phone layout, sheet open): no violations", axe.length === 0, axe.join(" | "));
await sharp(await page.screenshot()).resize({ width: Math.round(W * 1.5) }).webp({ quality: 82 }).toFile(`docs/design-studio/results/m13/mobile-design-${lang}.webp`);
check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
console.log(failures ? `FAIL: ${failures}` : "PASS: mobile (emulated)");
process.exit(failures ? 1 : 0);
