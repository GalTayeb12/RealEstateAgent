#!/usr/bin/env node
// Opens a visible Edge window already signed in as a local admin and loads the studio. Stays open until you close it.
//   JWT_SECRET=... node scripts/studio/open-studio.mjs [--base=http://localhost:3001] [--lang=he|en]
import { chromium } from "@playwright/test";
import jwt from "jsonwebtoken";

const args = process.argv.slice(2);
const flag = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split("=")[1];
const base = flag("base", "http://localhost:3001");
const lang = flag("lang", "he");
const token = jwt.sign({ userId: "local-admin", email: "admin@example.test", role: "admin" }, process.env.JWT_SECRET ?? "studio-bench-dummy", { expiresIn: "12h" });
const browser = await chromium.launch({ channel: "msedge", headless: false, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--start-maximized"] });
const ctx = await browser.newContext({ viewport: null });
await ctx.addCookies([{ name: "hq_session", value: token, domain: "localhost", path: "/" }, { name: "haveniq-locale", value: lang, domain: "localhost", path: "/" }]);
const page = await ctx.newPage();
await page.goto(`${base}/studio/yarkon-twin-shell`);
console.log("open; close the window to exit");
await new Promise((r) => browser.on("disconnected", r));
