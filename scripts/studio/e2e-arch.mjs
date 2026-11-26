#!/usr/bin/env node
// End-to-end check of architecture proposals through the real UI (headless Edge, GPU):
// partition and opening tools, protected walls, concept labelling, kitchen layouts, undo, restore.
//   JWT_SECRET=... node scripts/studio/e2e-arch.mjs [--base=http://localhost:3001] [--lang=en|he]
import { chromium } from "@playwright/test";
import jwt from "jsonwebtoken";

const args = process.argv.slice(2);
const flag = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split("=")[1];
const base = flag("base", "http://localhost:3001");
const lang = flag("lang", "en");
const T = (he, en) => (lang === "he" ? he : en);
const token = jwt.sign({ userId: `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, email: "e2e@example.test", role: "admin" }, process.env.JWT_SECRET ?? "studio-bench-dummy", { expiresIn: "1h" });
const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };

const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
await ctx.addCookies([{ name: "hq_session", value: token, domain: "localhost", path: "/" }, { name: "haveniq-locale", value: lang, domain: "localhost", path: "/" }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
await page.goto(`${base}/studio/yarkon-twin-shell?debug&seed=none`);
await page.waitForFunction(() => window.__studio?.getState().ready, null, { timeout: 90000 });
await page.addStyleTag({ content: "nextjs-portal { display: none !important }" });
await page.waitForTimeout(4000);
const S = (fn, arg) => page.evaluate(fn, arg);
const nodes = () => S(() => Object.values(window.__studio.getState().doc.nodes));
const proposals = async () => (await nodes()).filter((n) => n.kind === "partitionProposal" || n.kind === "openingProposal");
const shot = (n) => page.screenshot({ path: `docs/design-studio/results/m9/${n}-${lang}.png` });

// Plan mode, top view: plan coordinates map linearly to canvas pixels
await page.getByRole("tab", { name: T("תוכנית", "Plan") }).click();
await page.waitForTimeout(2500);
const canvasBox = await page.locator("canvas").boundingBox();
const px = (x, y) => S(([x, y]) => { const s = window.__studio.getState(); const v = s.plan, w = s.viewport; return { x: w.w / 2 + (x - v.cx) * v.ppm, y: w.h / 2 - (y - v.cy) * v.ppm }; }, [x, y]).then((p) => ({ x: canvasBox.x + p.x, y: canvasBox.y + p.y }));
const click = async (x, y) => { const p = await px(x, y); await page.mouse.move(p.x, p.y); await page.waitForTimeout(150); await page.mouse.click(p.x, p.y); await page.waitForTimeout(250); };
const menu = (name) => async () => { await page.getByRole("button", { name: T("אדריכלות", "Architecture"), exact: true }).click(); await page.getByRole("menuitem", { name }).click(); };

// 1. partition tool: start on a wall face (snaps), end in free space
await menu(T("הוספת מחיצה", "Add a partition"))();
check("partition tool shows its hint", (await page.locator(".st-hint").innerText()).length > 10);
await click(1.0, 4.45);
const tool1 = await S(() => window.__studio.getState().tool);
check("first click snaps the start to the wall face (y = 4.54)", tool1?.a && Math.abs(tool1.a[1] - 4.54) < 0.011, JSON.stringify(tool1?.a));
await click(1.0, 2.0);
let props = await proposals();
check("second click adds a partition proposal", props.length === 1 && props[0].kind === "partitionProposal");
check("the new partition is selected and labelled as a concept", (await page.locator(".st-panel .st-concept").count()) === 1 && (await page.locator(".st-panel .st-warn").count()) === 1);
check("a concept banner is shown", (await page.locator(".st-banner--concept").count()) === 1);
const tags = await page.locator(".pl-overlay .pl-concept-tag").evaluateAll((els) => els.map((e) => e.textContent));
check("the plan labels it as a concept with its length", tags.length === 1 && /254|250|255/.test(tags[0]), tags.join("|"));
await shot("plan-partition");

// 2. opening tool: a doorway in an interior wall
await menu(T("הוספת פתח", "Add an opening"))();
await click(7.0, 7.3);
props = await proposals();
const op = props.find((n) => n.kind === "openingProposal");
check("opening placed on the kitchen-corridor wall", !!op && op.wallId === "wall:kitchen-corridor" && Math.abs(op.at - 1.3) < 0.15, op ? `at=${op.at} w=${op.width}` : "");

// 3. protected wall: refused with a reason, nothing added
const before = (await proposals()).length;
await menu(T("הוספת פתח", "Add an opening"))();
await click(5.5, 8.6);
await page.waitForTimeout(300);
check("an opening in the protected exterior wall is refused", (await proposals()).length === before);
const toast = await page.locator(".st-toast").innerText().catch(() => "");
check("the refusal explains why", /protected|מוגנ/i.test(toast), toast);
await page.keyboard.press("Escape");
check("Escape cancels the tool", (await S(() => window.__studio.getState().tool)) === null);

// 4. editing a proposal through its panel (command engine, validated)
const partId = (await proposals()).find((n) => n.kind === "partitionProposal").id;
await S((i) => window.__studio.getState().select(i), partId);
await page.waitForTimeout(400);
const ok = await S((i) => window.__studio.getState().commit({ type: "setProposal", id: i, patch: { thickness: 0.15 } }, i), partId);
check("thickness change is accepted", ok && (await nodes()).find((n) => n.id === partId).thickness === 0.15);
const bad = await S((i) => window.__studio.getState().commit({ type: "setProposal", id: i, patch: { b: [1.0, 5.5] } }, i), partId);
check("extending the partition through the wall is refused", bad === false);
await S(() => window.__studio.getState().undo());
check("undo reverts the thickness", (await nodes()).find((n) => n.id === partId).thickness === 0.1);

// 5. kitchen layouts
const nBefore = (await nodes()).length;
await menu(T("תכניות מטבח", "Kitchen layouts"))();
await page.waitForTimeout(500);
const cards = await page.locator(".st-layouts li").count();
check("kitchen layouts are offered (single, galley, L)", cards >= 3, `${cards} layouts`);
await shot("kitchen-layouts");
await page.locator(".st-layouts li").getByRole("button", { name: T("להשתמש בתכנית", "Use this layout") }).first().click();
await page.waitForTimeout(2500);
const items = (await nodes()).filter((n) => n.kind === "item" && /^kitchen-/.test(n.catalog.id));
check("applying a layout adds kitchen runs in one step", items.length >= 2, `${items.length} runs`);
await shot("kitchen-plan");
await S(() => window.__studio.getState().undo());
check("one undo removes the whole kitchen", (await nodes()).length === nBefore);
await S(() => window.__studio.getState().redo());
await page.getByRole("button", { name: T("איזומטרי", "Isometric") }).click();
await page.waitForTimeout(3000);
await shot("kitchen-iso");

// 6. restore original removes every proposal and kitchen run
page.once("dialog", (d) => d.accept());
await page.getByRole("button", { name: T("דירה ריקה", "Empty apartment"), exact: true }).click();
await page.waitForTimeout(500);
check("restore original removes all proposals", (await nodes()).length === 0);
check("no page errors", errors.length === 0, errors[0] ?? "");
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
