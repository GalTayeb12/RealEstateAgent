#!/usr/bin/env node
// Renders catalog thumbnails through the real studio (neutral backdrop, no shell) and writes
// public/studio/catalog/<id>/<version>/preview.webp (512x512).
//   JWT_SECRET=... node scripts/studio/thumbs.mjs [--base=http://localhost:3001] [--only=id]
import { chromium } from "@playwright/test";
import jwt from "jsonwebtoken";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split("=")[1];
const base = flag("base", "http://localhost:3001");
const only = flag("only", "");
const token = jwt.sign({ userId: "thumbs", email: "thumbs@example.test", role: "admin" }, process.env.JWT_SECRET ?? "studio-bench-dummy", { expiresIn: "1h" });
const catalog = JSON.parse(fs.readFileSync("public/studio/catalog/index.json", "utf8"));

const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 640, height: 640 }, deviceScaleFactor: 1 });
await ctx.addCookies([{ name: "hq_session", value: token, domain: "localhost", path: "/" }]);
const page = await ctx.newPage();
await page.goto(`${base}/studio/yarkon-twin-shell?debug`);
await page.waitForFunction(() => window.__studio?.getState().ready, null, { timeout: 90000 });
await page.addStyleTag({ content: ".st-ui, nextjs-portal { display: none !important } .st-loading { display: none !important }" });
await page.waitForTimeout(4000);

for (const m of catalog.models) {
  if (only && m.id !== only) continue;
  const id = `thumb-${m.id}`;
  await page.evaluate(({ m, id }) => {
    const st = window.__studio.getState();
    st.dispatch({ type: "restoreBaseline" });
    const s = m.sizing;
    st.dispatch({
      type: "add",
      node: {
        id, kind: "item", locked: false, catalog: { id: m.id, version: m.version }, slots: {},
        transform: { x: 4, y: 2, z: m.placement.on === "surface" ? 0 : 0, rot: 0 },
        ...(s.mode === "modular" ? { modules: s.defaultConfig } : {}),
        ...(s.mode === "variants" ? { variantId: s.defaultVariant ?? s.variants[0].id } : {}),
      },
    });
    st.setThumb({ id });
  }, { m, id });
  await page.waitForTimeout(3500); // GLB + probe environment
  const png = await page.screenshot();
  const out = path.join("public/studio/catalog", m.assets.preview);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp(png).resize(480, 480).webp({ quality: 84 }).toFile(out);
  console.log("thumb", m.id, Math.round(fs.statSync(out).size / 1024) + " KB");
}
await browser.close();
