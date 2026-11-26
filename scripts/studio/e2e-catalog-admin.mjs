#!/usr/bin/env node
// Checks /dev/admin/catalog: admin-only, lists every manifest with its audit, and (with
// STUDIO_CATALOG_WRITE=1 on the server) a retire -> re-publish round trip on a manifest file.
//   JWT_SECRET=... node scripts/studio/e2e-catalog-admin.mjs [--base=http://localhost:3001]
import { chromium } from "@playwright/test";
import jwt from "jsonwebtoken";
import fs from "node:fs";

const base = (process.argv.find((a) => a.startsWith("--base=")) ?? "--base=http://localhost:3001").split("=")[1];
const sign = (role) => jwt.sign({ userId: `e2e-${role}`, email: "e2e@example.test", role }, process.env.JWT_SECRET ?? "studio-bench-dummy", { expiresIn: "1h" });
const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const browser = await chromium.launch({ channel: "msedge", headless: true });
const ctxFor = async (role) => { const c = await browser.newContext({ viewport: { width: 1400, height: 900 } }); await c.addCookies([{ name: "hq_session", value: sign(role), domain: "localhost", path: "/" }]); return c; };

const dev = await (await ctxFor("developer")).newPage();
const r0 = await dev.goto(`${base}/dev/admin/catalog`);
check("a developer (not admin) gets 404", r0.status() === 404, String(r0.status()));

const page = await (await ctxFor("admin")).newPage();
await page.goto(`${base}/dev/admin/catalog`);
const rows = await page.locator("tr[data-row]").count();
check("the admin sees every manifest (14 models + 23 materials)", rows === 37, `${rows} rows`);
const issues = await page.locator("td span[style*='b3261e']").count();
check("no published entry has a blocking audit issue", issues === 0, `${issues}`);
await page.screenshot({ path: "docs/design-studio/results/m11/catalog-admin.png", fullPage: false });

const file = "catalog/manifests/metal-black-steel@1.json";
const before = fs.readFileSync(file, "utf8");
const row = page.locator("tr[data-row='metal-black-steel@1']");
const writable = !(await row.getByRole("button", { name: "Retire" }).isDisabled());
if (writable) {
  await row.getByRole("button", { name: "Retire" }).click();
  await page.waitForTimeout(800);
  check("Retire writes the lifecycle status to the manifest", JSON.parse(fs.readFileSync(file, "utf8")).status === "retired");
  await page.locator("tr[data-row='metal-black-steel@1']").getByRole("button", { name: "Re-publish" }).click();
  await page.waitForTimeout(800);
  check("Re-publish restores it", JSON.parse(fs.readFileSync(file, "utf8")).status === "published");
  const illegal = await page.request.post(`${base}/api/dev/admin/catalog`, { data: { type: "material", id: "metal-black-steel", version: 1, action: "submit" } });
  check("an illegal transition is refused", illegal.status() === 409, String(illegal.status()));
  fs.writeFileSync(file, before); // leave the repository exactly as it was
} else console.log("SKIP  write round trip (server without STUDIO_CATALOG_WRITE=1)");
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
