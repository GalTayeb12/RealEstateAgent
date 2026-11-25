#!/usr/bin/env node
// End-to-end check of Design mode through the real UI (headless Edge, GPU).
//   JWT_SECRET=... node scripts/studio/e2e-design.mjs [--base=http://localhost:3001] [--mobile] [--lang=en|he]
// Needs the dev server with STUDIO_ENABLED=1. Exits 1 when any step fails.
import { chromium, devices } from "@playwright/test";
import jwt from "jsonwebtoken";

const args = process.argv.slice(2);
const flag = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split("=")[1];
const base = flag("base", "http://localhost:3001");
const mobile = args.includes("--mobile");
const lang = flag("lang", "en");
const token = jwt.sign({ userId: "e2e", email: "e2e@example.test", role: "admin" }, process.env.JWT_SECRET ?? "studio-bench-dummy", { expiresIn: "1h" });

const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };

const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext(mobile ? { ...devices["Pixel 7"], channel: undefined } : { viewport: { width: 1500, height: 900 } });
await ctx.addCookies([
  { name: "hq_session", value: token, domain: "localhost", path: "/" },
  { name: "haveniq-locale", value: lang, domain: "localhost", path: "/" },
]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
await page.goto(`${base}/studio/yarkon-twin-shell?debug`);
await page.waitForFunction(() => window.__studio?.getState().ready, null, { timeout: 90000 });
await page.addStyleTag({ content: "nextjs-portal { display: none !important }" }); // dev-only error overlay captures clicks
await page.waitForTimeout(5000);
const S = (fn, arg) => page.evaluate(fn, arg);
const state = () => S(() => { const s = window.__studio.getState(); return { items: Object.values(s.doc.nodes), sel: s.selection, overrides: s.doc.overrides, err: s.lastError, mode: s.mode }; });
const T = (he, en) => (lang === "he" ? he : en);

await S(() => { window.__studioInput.teleport = { x: 4.0, y: 1.0, yaw: 0 }; });
await page.waitForTimeout(1500);
// 1. enter Design mode
await page.getByRole("tab", { name: T("עיצוב", "Design") }).click();
check("design mode on", (await state()).mode === "design");

// 2. add from the catalog (search -> card)
await page.locator(".st-primary").click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `docs/design-studio/results/m5/drawer-${mobile ? "mobile" : "desktop"}-${lang}.png` });
await page.getByPlaceholder(T("חיפוש ריהוט…", "Search furniture…")).fill(T("טרוורטין", "travertine"));
await page.locator(".st-card").first().click();
let st = await state();
check("add from catalog places and selects an item", st.items.length === 1 && st.sel === st.items[0].id, st.items[0]?.catalog.id);
const start = st.items[0]?.transform;

// 3. properties panel + rotate (button) and undo
await page.locator(".st-panel").waitFor();
check("property panel shows the item", (await page.locator(".st-panel .st-dims").innerText()).includes("cm"));
await page.getByRole("button", { name: T("סיבוב שמאלה", "Rotate left") }).click();
st = await state();
const dRot = ((st.items[0].transform.rot - start.rot + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
check("rotate left adds 15 degrees", Math.abs(dRot - Math.PI / 12) < 1e-6, st.err ?? "");
await page.keyboard.press("Control+z");
st = await state();
check("undo restores the rotation", Math.abs(st.items[0].transform.rot - start.rot) < 1e-6);

// 4. drag the item with the pointer
const cx = Math.round(page.viewportSize().width / 2);
const cy = await S(([x, id]) => { const r = document.querySelector("canvas").getBoundingClientRect(); for (let y = Math.round(r.top) + 20; y < r.bottom - 20; y += 4) { const h = window.__studioRay(x, y); if (h[0] && h[0].startsWith(id)) return y + 24; } return 800; }, [cx, start && st.items[0].catalog.id]);
await page.screenshot({ path: "docs/design-studio/results/m5/before-drag.png" });
await page.mouse.move(cx, cy); await page.mouse.down();
await page.mouse.move(cx + 90, cy, { steps: 6 }); await page.mouse.move(cx + 140, cy, { steps: 4 });
await page.mouse.up();
st = await state();
const moved = Math.hypot(st.items[0].transform.x - start.x, st.items[0].transform.y - start.y);
check("dragging moves the item (snapped to 5 cm)", moved > 0.1 && Math.abs(st.items[0].transform.x * 20 - Math.round(st.items[0].transform.x * 20)) < 1e-6, `moved ${moved.toFixed(2)} m, err=${st.err}, screen=${Math.round(cx)},${Math.round(cy)}, sel=${st.sel}`);
check("the item stays selected after the drag", st.sel === st.items[0].id, `sel=${st.sel}`);
await page.keyboard.press("Control+z");
st = await state();
check("undo restores the position", Math.hypot(st.items[0].transform.x - start.x, st.items[0].transform.y - start.y) < 1e-6);

// 5. illegal move is refused with a reason
await S((id) => window.__studio.getState().select(id), st.items[0].id);
await S(() => window.__studio.getState().commit({ type: "move", id: window.__studio.getState().selection, x: 40, y: 40 }, window.__studio.getState().selection));
st = await state();
check("moving outside the apartment is refused", Math.abs(st.items[0].transform.x - start.x) < 1e-6 && st.err === "err.out-of-room", st.err ?? "");

// 6. surface material through the panel
await S(() => window.__studio.getState().select("surface:floor:living"));
await page.locator(".st-swatch").first().click();
st = await state();
check("floor material set from the swatches", !!st.overrides["surface:floor:living"], st.overrides["surface:floor:living"]?.material.id);
await page.getByText(T("חזרה למקור", "Back to original")).click();
check("surface reset", !(await state()).overrides["surface:floor:living"]);

// 7. modular sofa: add, pick the 4 m preset
await S(() => window.__studio.getState().setCatalogOpen(true));
await page.getByPlaceholder(T("חיפוש ריהוט…", "Search furniture…")).fill(T("מודולרית", "modular"));
await page.locator(".st-card").first().click();
st = await state();
const sofa = st.items.find((i) => i.catalog.id === "sofa-modular-01");
check("modular sofa added", !!sofa);
await page.locator(".st-chips .st-chip", { hasText: /^400$/ }).click();
st = await state();
const four = st.items.find((i) => i.catalog.id === "sofa-modular-01");
check("4.0 m preset uses legal modules (no stretching)", !!four && four.modules.length >= 4 && four.modules[0] === "arm-l" && four.modules.at(-1) === "arm-r" && !("scale" in four.transform), four?.modules?.join(","));

await page.waitForTimeout(1500);
await page.screenshot({ path: `docs/design-studio/results/m5/panel-${mobile ? "mobile" : "desktop"}-${lang}.png` });
// 8. delete key, restore original
await page.keyboard.press("Delete");
st = await state();
check("Delete removes the selected piece", !st.items.some((i) => i.catalog.id === "sofa-modular-01"));
page.once("dialog", (d) => d.accept());
await page.getByRole("button", { name: T("שחזור המצב המקורי", "Restore original") }).click();
st = await state();
check("restore original empties the design", st.items.length === 0 && Object.keys(st.overrides).length === 0);

check("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `${failed} FAILED` : "ALL PASSED");
process.exit(failed ? 1 : 0);
