#!/usr/bin/env node
// Studio screenshot harness (headless Edge, GPU). Signs a throwaway admin token with the
// dev server's JWT_SECRET, builds a scene through the real command engine and shoots it.
//
//   JWT_SECRET=... node scripts/studio/shots.mjs <scene> [<scene> ...] [--base=http://localhost:3001] [--slug=yarkon-twin-shell] [--out=docs/design-studio/results/m3] [--w=1600 --h=900]
import { chromium } from "@playwright/test";
import jwt from "jsonwebtoken";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split("=").slice(1).join("=");
const scenes = args.filter((a) => !a.startsWith("--"));
const base = flag("base", "http://localhost:3001");
const slug = flag("slug", "yarkon-twin-shell");
const out = flag("out", "docs/design-studio/results/m3");
const W = Number(flag("w", 1600)), H = Number(flag("h", 900));
const secret = process.env.JWT_SECRET ?? "studio-bench-dummy";
const token = jwt.sign({ userId: "studio-shots", email: "shots@example.test", role: "admin" }, secret, { expiresIn: "1h" });

const item = (id, catalog, x, y, rot = 0, extra = {}) => ({ type: "add", node: { id, kind: "item", catalog: { id: catalog, version: 1 }, transform: { x, y, z: 0, rot }, slots: {}, locked: false, ...extra } });
const PI = Math.PI;
const LIVING = [
  item("sofa", "sofa-03", 4.0, 4.5, PI),
  item("table", "coffee-table-modern-01", 4.0, 2.9, 0),
  item("chair", "armchair-modern-01", 6.6, 2.4, PI / 2),
  item("side", "side-table-01", 6.1, 4.4, PI),
];
const SUN = [
  item("chair", "armchair-modern-01", 5.3, 1.3, 3 * PI / 4),
  item("table", "coffee-table-modern-01", 3.7, 1.1, 0.3),
  item("side", "side-table-01", 6.4, 2.3, PI),
];
const WEST = [
  item("chair", "armchair-modern-01", 1.3, 1.1, 3 * PI / 4),
  item("table", "coffee-table-modern-01", 2.5, 0.8, 0.3),
];
const STRIP = [
  item("chair", "armchair-modern-01", 4.6, 0.45, 3 * PI / 4),
  item("table", "coffee-table-modern-01", 2.9, 0.5, 0.4),
];
const surf = (surfaceId, id) => ({ type: "setSurfaceMaterial", surfaceId, material: { id, version: 1 } });
const FINISH = [
  surf("surface:floor:living", "parquet-oak-light"),
  surf("surface:back:b", "plaster-limewash-soft"), surf("surface:bed3-front:a", "plaster-limewash-soft"),
  surf("surface:corridor-east:b", "plaster-limewash-soft"), surf("surface:west:a", "microcement-light"),
];
const SOFA = (modules) => [item("sofa", "sofa-modular-01", 4.0, 4.5, PI, { modules }), ...FINISH];
const HERO = [
  item("sofa", "sofa-modular-01", 4.2, 4.5, PI, { modules: ["arm-l", "seat-120", "seat-120", "arm-r"] }),
  item("rug", "rug-woven-01", 4.2, 1.75, 0),
  item("lamp", "floor-lamp-01", 7.0, 4.2, 0),
  item("coffee", "coffee-drum-01", 4.2, 2.2, 0),
  item("side", "side-drum-01", 6.15, 3.9, 0),
  item("chair", "armchair-modern-01", 6.6, 2.5, PI / 2),
  ...FINISH,
];
const SCENES = {
  hero: { cmds: HERO, cam: [3.4, 0.7, -0.12], look: [30] },
  "hero-close": { cmds: HERO, cam: [3.9, 1.5, -0.1], look: [75] },
  "sofa-24": { cmds: SOFA(["arm-l", "seat-100", "seat-100", "arm-r"]), cam: [4.0, 0.9, 0.0] },
  "sofa-24-close": { cmds: SOFA(["arm-l", "seat-100", "seat-100", "arm-r"]), cam: [3.4, 3.0, -0.45], look: [90, 90] },
  "sofa-34-chaise": { cmds: SOFA(["arm-l", "seat-100", "seat-120", "chaise"]), cam: [4.0, 0.9, 0.0] },
  "sofa-40": { cmds: SOFA(["arm-l", "seat-120", "seat-120", "seat-120", "arm-r"]), cam: [4.0, 0.9, 0.0] },
  finish: { cmds: FINISH, cam: [4.0, 0.4, 0.0] },
  "finish-wide": { cmds: FINISH, cam: [1.2, 0.6, -0.55] },
  "finish-west": { cmds: FINISH, cam: [3.6, 3.0, 2.3] },
  strip: { cmds: STRIP, cam: [3.6, 3.4, PI] },
  "strip-noshadow": { cmds: STRIP, cam: [3.6, 3.4, PI], quality: "low" },
  "strip-empty": { cmds: [], cam: [3.6, 3.4, PI] },
  west: { cmds: WEST, cam: [3.6, 3.0, 2.3] },
  "west-noshadow": { cmds: WEST, cam: [3.6, 3.0, 2.3], quality: "low" },
  "west-empty": { cmds: [], cam: [3.6, 3.0, 2.3] },
  sun: { cmds: SUN, cam: [4.6, 3.9, PI] },
  "sun-noao": { cmds: SUN, cam: [4.6, 3.9, PI], light: { ao: false } },
  "sun-noshadow": { cmds: SUN, cam: [4.6, 3.9, PI], quality: "low" },
  empty: { cmds: [], cam: [4.0, 0.5, 0] },
  living: { cmds: LIVING, cam: [4.0, 0.4, 0.0] },
  "living-wide": { cmds: LIVING, cam: [1.2, 0.6, -0.55] },
  "living-moved": { cmds: [...LIVING, { type: "move", id: "sofa", x: 2.4, y: 3.0 }], cam: [4.0, 0.4, 0.0] },
  "living-removed": { cmds: [...LIVING, { type: "remove", id: "sofa" }], cam: [4.0, 0.4, 0.0] },
  "living-floor": { cmds: [...LIVING, { type: "setSurfaceMaterial", surfaceId: "surface:floor:living", material: { id: "floor-flat-ash", version: 1 } }], cam: [4.0, 0.4, 0.0] },
  "living-wall": { cmds: [...LIVING, { type: "setSurfaceMaterial", surfaceId: "surface:back:b", material: { id: "paint-sage", version: 1 } }, { type: "setSurfaceMaterial", surfaceId: "surface:bed3-front:a", material: { id: "paint-sage", version: 1 } }], cam: [4.0, 0.4, 0.0] },
};

fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await ctx.addCookies([{ name: "hq_session", value: token, domain: new URL(base).hostname, path: "/" }]);
for (const name of scenes) {
  const sc = SCENES[name];
  if (!sc) { console.error("unknown scene", name, Object.keys(SCENES).join(", ")); continue; }
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message.slice(0, 240)));
  page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text().slice(0, 240)); });
  const res = await page.goto(`${base}/studio/${slug}?debug`, { waitUntil: "load" });
  if (res.status() !== 200) { console.error(name, "HTTP", res.status()); await page.close(); continue; }
  await page.waitForFunction(() => window.__studio?.getState().ready, null, { timeout: 90000 });
  await page.waitForSelector("canvas", { state: "attached" });
  await page.waitForTimeout(6000);
  if (sc.light) await page.evaluate((l) => window.__studio.getState().setLighting(l), sc.light);
  if (sc.quality) await page.evaluate((q) => window.__studio.getState().setQuality(q), sc.quality);
  const results = await page.evaluate((cmds) => cmds.map((c) => window.__studio.getState().dispatch(c)), sc.cmds);
  const go = () => page.evaluate(([x, y, yaw]) => { window.__studioInput.teleport = { x, y, yaw }; }, sc.cam);
  await go();
  await page.waitForTimeout(2500);
  await go(); // a re-render (e.g. toggling AO rebuilds the composer) can swallow the first teleport
  if (sc.look) { // tilt the view: positive = look down; the walker clamps each frame, so feed it in steps
    for (const step of sc.look) { await page.evaluate((d) => { window.__studioInput.lookDY += d; }, step); await page.waitForTimeout(120); }
  }
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  console.log(name, "ok", JSON.stringify(results), errs.length ? "errors: " + JSON.stringify(errs.slice(0, 3)) : "");
  await page.close();
}
await browser.close();
