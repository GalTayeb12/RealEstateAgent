#!/usr/bin/env node
// End-to-end check of the floor planner (Plan mode) through the real UI (headless Edge, GPU).
//   JWT_SECRET=... node scripts/studio/e2e-plan.mjs [--base=http://localhost:3001] [--mobile] [--lang=en|he]
import { chromium, devices } from "@playwright/test";
import jwt from "jsonwebtoken";

const args = process.argv.slice(2);
const flag = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split("=")[1];
const base = flag("base", "http://localhost:3001");
const mobile = args.includes("--mobile");
const lang = flag("lang", "en");
const tag = `${mobile ? "mobile" : "desktop"}-${lang}`;
const token = jwt.sign({ userId: `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, email: "e2e@example.test", role: "admin" }, process.env.JWT_SECRET ?? "studio-bench-dummy", { expiresIn: "1h" });
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
await page.addStyleTag({ content: "nextjs-portal { display: none !important }" });
await page.waitForTimeout(5000);
const S = (fn, arg) => page.evaluate(fn, arg);
const T = (he, en) => (lang === "he" ? he : en);
const shot = (n) => page.screenshot({ path: `docs/design-studio/results/m7/${n}-${tag}.png` });
const docJson = () => S(() => JSON.stringify(window.__studio.getState().doc));

// a piece to measure: place one through the store (same validated path as the catalog button)
await S(() => { window.__studioInput.teleport = { x: 4.0, y: 1.0, yaw: 0 }; });
await page.waitForTimeout(1200);
await page.getByRole("tab", { name: T("עיצוב", "Design") }).click();
await S(() => { const s = window.__studio.getState(); s.addFromCatalog(s.models.find((m) => m.category === "table") ?? s.models[0]); });
const before = await docJson();
const poseBefore = await S(() => window.__studio.getState().pose);

// 1. Plan mode, top view: fitted, whole apartment inside the stage
await page.getByRole("tab", { name: T("תוכנית", "Plan") }).click();
await page.waitForTimeout(2500);
const plan0 = await S(() => window.__studio.getState().plan);
check("plan mode fits the apartment (top view)", plan0?.kind === "top" && plan0.ppm > 15, `ppm=${plan0?.ppm?.toFixed(1)}`);
await shot("top");

// phones are too small for edge labels at the fitted scale: zoom in with the buttons first
if (mobile) {
  const plus = page.getByRole("button", { name: T("הגדלה", "Zoom in") });
  await plus.click(); await plus.click();
  await page.waitForTimeout(500);
  const z = await S(() => window.__studio.getState().plan.ppm);
  check("zoom buttons enlarge the plan", z > plan0.ppm * 1.5, `${plan0.ppm.toFixed(1)} -> ${z.toFixed(1)}`);
}
// 2. every room has a name and an area label; known room dimensions are shown in cm
const texts = await page.locator(".pl-overlay text").evaluateAll((els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
check("room areas are labelled", texts.some((t) => /m²/.test(t)) && texts.length > 12, `${texts.length} labels`);
check("living room edge lengths are measured (820 / 340 cm)", texts.includes("820") && texts.includes("340"));

// 3. wheel zoom keeps the point under the cursor
const box = await page.locator("canvas").boundingBox();
const cx = box.x + box.width * 0.6, cy = box.y + box.height * 0.45;
const groundAt = (sx, sy) => S(([x, y]) => { const s = window.__studio.getState(); const v = s.plan, w = s.viewport; return [v.cx + (x - w.w / 2) / v.ppm, v.cy - (y - w.h / 2) / v.ppm]; }, [sx, sy]);
const g0 = await groundAt(cx - box.x, cy - box.y);
await page.mouse.move(cx, cy);
await page.mouse.wheel(0, -400);
await page.waitForTimeout(400);
const plan1 = await S(() => window.__studio.getState().plan);
const g1 = await groundAt(cx - box.x, cy - box.y);
check("wheel zoom increases scale", plan1.ppm > plan0.ppm * 1.3, `${plan0.ppm.toFixed(1)} -> ${plan1.ppm.toFixed(1)}`);
check("zoom keeps the cursor point fixed (top view)", Math.hypot(g1[0] - g0[0], g1[1] - g0[1]) < 0.15);

// 4. drag on empty space pans by the dragged pixels
const free = await S(([bx, by, bw, bh]) => {
  for (let y = by + bh * 0.7; y > by + 120; y -= 20) for (let x = bx + 20; x < bx + bw - 20; x += 20) {
    const el = document.elementFromPoint(x, y);
    if (el && el.tagName === "CANVAS") return { x, y };
  }
  return null;
}, [box.x, box.y, box.width, box.height]);
await page.mouse.move(free.x, free.y);
await page.mouse.down();
await page.mouse.move(free.x + 100, free.y + 40, { steps: 6 });
await page.mouse.up();
const plan2 = await S(() => window.__studio.getState().plan);
check("drag pans the view", Math.abs(plan2.cx - plan1.cx) > 0.3 || Math.abs(plan2.cy - plan1.cy) > 0.1, `dc=(${(plan2.cx - plan1.cx).toFixed(2)}, ${(plan2.cy - plan1.cy).toFixed(2)})`);

// 5. fit, then isometric
await page.getByRole("button", { name: T("התאמה", "Fit") }).click();
await page.getByRole("button", { name: T("איזומטרי", "Isometric") }).click();
await page.waitForTimeout(2500);
const plan3 = await S(() => window.__studio.getState().plan);
check("isometric view", plan3.kind === "iso");
await shot("iso");

// 6. same document in every mode; selecting a piece shows its size and wall distances
await page.getByRole("button", { name: T("מלמעלה", "Top") }).click();
await page.waitForTimeout(1500);
check("plan mode did not change the design", (await docJson()) === before);
const id = await S(() => Object.values(window.__studio.getState().doc.nodes).find((n) => n.kind === "item")?.id);
await S((i) => window.__studio.getState().select(i), id);
await page.waitForTimeout(800);
const t2 = await page.locator(".pl-overlay text").evaluateAll((els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
check("selected piece shows W x D in cm", t2.some((t) => /\d+ × \d+ cm/.test(t)), t2.find((t) => /×/.test(t)) ?? "");
check("selected piece shows wall distances", (await page.locator(".pl-clear").count()) >= 2);
await shot("selected");

// 7. editing from the plan: rotate through the panel and undo
await page.getByRole("button", { name: T("סיבוב ימינה", "Rotate right") }).click();
check("rotate works in plan mode", (await docJson()) !== before);
await page.keyboard.press("Control+z");
check("undo works in plan mode", (await docJson()) === before);

// 8. back to Walk: the walker is where they left
await page.getByRole("tab", { name: T("הליכה", "Walk") }).click();
await page.waitForTimeout(1500);
const poseAfter = await S(() => window.__studio.getState().pose);
check("walker returns to the same spot", Math.hypot(poseAfter.x - poseBefore.x, poseAfter.y - poseBefore.y) < 0.3, `${poseBefore.x.toFixed(2)},${poseBefore.y.toFixed(2)} -> ${poseAfter.x.toFixed(2)},${poseAfter.y.toFixed(2)}`);
check("no page errors", errors.length === 0, errors[0] ?? "");

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
