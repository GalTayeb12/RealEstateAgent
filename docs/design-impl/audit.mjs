// Audit: top-of-page shots + theme flags for many routes -> shots/audit/<name>.png, plus a contact sheet.
// STATE=<buyer state> DEVSTATE=<dev state> MATCH=<match json> node docs/design-impl/audit.mjs [lang]
import { chromium } from "playwright"; import fs from "node:fs"; import sharp from "sharp";
const lang = process.argv[2] ?? "he";
const base = "http://localhost:3001";
const dir = new URL("./shots/audit/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"); fs.mkdirSync(dir, { recursive: true });
const mr = JSON.parse(fs.readFileSync(process.env.MATCH, "utf8"));
const aom = Object.keys(mr.aomDetails ?? {})[0];
const routes = [
  ["buyer", "login", "/login", null], ["buyer", "register", "/register", null], ["buyer", "forgot", "/forgot-password", null],
  ["buyer", "offers", "/buyer/offers", "S"], ["buyer", "groups", "/buyer/leverage-groups", "S"], ["buyer", "profile", "/profile", "S"],
  ["buyer", "aom", `/aom/${aom}`, "S"], ["buyer", "processing", "/processing", "S"], ["buyer", "interview", "/interview", "S"],
  ["buyer", "terms", "/terms", null], ["buyer", "privacy", "/privacy", null], ["buyer", "notfound", "/zzz-missing", null],
  ["buyer", "seller-reg", "/seller/register", null], ["buyer", "seller-dash", "/seller/dashboard", "S"], ["buyer", "verify", "/verify-email", null],
  ["dev", "dev-login", "/dev/login", null], ["dev", "dev-register", "/dev/register", null], ["dev", "dev-props", "/dev/projects", "D"],
];
const b = await chromium.launch(); const out = [];
for (const [, name, path, st] of routes) {
  const state = st === "S" ? process.env.STATE : st === "D" ? process.env.DEVSTATE : undefined;
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, ...(state ? { storageState: state } : {}) });
  await ctx.addCookies([{ name: "haveniq-locale", value: lang, url: base }]);
  await ctx.addInitScript((v) => sessionStorage.setItem("matchResults", v), JSON.stringify(mr));
  if (lang === "en") await ctx.route("**/api/profile", (r) => (r.request().method() === "GET" ? r.fulfill({ status: 404, body: "{}" }) : r.abort()));
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 100)));
  await p.goto(base + path, { waitUntil: "load" }).catch(() => {}); await p.waitForTimeout(2200);
  const info = await p.evaluate(() => ({ cin: !!document.querySelector(".cin, .qp-auth.cin, .hv"), bg: getComputedStyle(document.body).backgroundColor, sw: document.documentElement.scrollWidth }));
  await p.screenshot({ path: dir + name + ".png" });
  console.log(name.padEnd(12), p.url().replace(base, "").padEnd(30), "cin", info.cin, "sw", info.sw, errs.length ? "ERR " + errs[0] : "");
  out.push(name); await ctx.close();
}
await b.close();
// contact sheet 4 cols
const W = 480, H = 300, cols = 4, rows = Math.ceil(out.length / cols);
const comps = await Promise.all(out.map(async (n, i) => ({ input: await sharp(dir + n + ".png").resize(W, H).toBuffer(), left: (i % cols) * W, top: Math.floor(i / cols) * H })));
await sharp({ create: { width: W * cols, height: H * rows, channels: 3, background: "#222" } }).composite(comps).png().toFile(dir + "_sheet.png");
console.log("sheet", out.join(","));
