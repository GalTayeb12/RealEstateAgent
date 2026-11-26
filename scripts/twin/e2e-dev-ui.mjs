#!/usr/bin/env node
// A developer uploads an apartment plan through the real UI, reviews it and approves it; the approval queues the build.
// Runs against the LOCAL dev database only (start the app with `node scripts/studio/dev-local.mjs 3004`).
//   node scripts/twin/e2e-dev-ui.mjs <plan.dxf> <unitTypeId> [--base=http://localhost:3004] [--clean]
// Afterwards: `DATABASE_URL=<local dev db> npx tsx scripts/twin/build-worker.ts --once --preview` builds it, and
// `node scripts/studio/e2e-newplan.mjs ut-<unitTypeId>` checks the result as a buyer.
import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import pg from "pg";

const args = process.argv.slice(2);
const [file, unitTypeId] = args.filter((a) => !a.startsWith("--"));
const base = (args.find((a) => a.startsWith("--base=")) ?? "--base=http://localhost:3004").slice(7);
if (!file || !unitTypeId) { console.error("usage: e2e-dev-ui.mjs <plan.dxf> <unitTypeId> [--clean]"); process.exit(2); }
const env = fs.readFileSync(".env.local", "utf8");
const grab = (k) => env.match(new RegExp(`^${k}\s*=\s*"?([^"\r\n]+)"?`, "m"))?.[1];
const url = process.env.STUDIO_TEST_DATABASE_URL ?? grab("STUDIO_TEST_DATABASE_URL");
const secret = process.env.JWT_SECRET ?? grab("JWT_SECRET") ?? fs.readFileSync(".env", "utf8").match(/^JWT_SECRET\s*=\s*"?([^"\r\n]+)"?/m)?.[1] ?? "studio-bench-dummy";
const guard = spawnSync(process.execPath, ["scripts/studio/assert-dev-db.mjs", `--url=${url}`], { encoding: "utf8" });
if (guard.status !== 0) { console.error(guard.stderr.trim()); process.exit(1); }

const devId = `e2e-ui-dev-${unitTypeId}`, projectId = `e2e-ui-proj-${unitTypeId}`;
const db = new pg.Client({ connectionString: url });
await db.connect();
if (args.includes("--clean")) {
  await db.query(`delete from "User" where id = $1 and email like '%@studio-e2e.invalid'`, [devId]);
  fs.rmSync(path.join(".storage", "builds", `ut-${unitTypeId}`), { recursive: true, force: true });
  await db.end(); console.log("cleaned"); process.exit(0);
}
await db.query(`insert into "User"(id, email, "passwordHash", role, "emailVerified") values ($1, $2, 'x', 'developer', true) on conflict (id) do nothing`, [devId, `${devId}@studio-e2e.invalid`]);
await db.query(`insert into "DeveloperProfile"(id, "userId", "companyName", crn, "contactName", phone, "crnStatus", "updatedAt") values ($1, $2, 'E2E Developer Ltd', $3, 'E2E', '000', 'approved', now()) on conflict ("userId") do update set "crnStatus" = 'approved'`, [`e2e-prof-${unitTypeId}`, devId, `E2E-${unitTypeId}`]).catch(async (e) => {
  if (!/updatedAt/.test(String(e.message))) throw e;
  await db.query(`insert into "DeveloperProfile"(id, "userId", "companyName", crn, "contactName", phone, "crnStatus") values ($1, $2, 'E2E Developer Ltd', $3, 'E2E', '000', 'approved') on conflict ("userId") do update set "crnStatus" = 'approved'`, [`e2e-prof-${unitTypeId}`, devId, `E2E-${unitTypeId}`]);
});
await db.query(`insert into "Project"(id, "developerId", name, "updatedAt") values ($1, $2, 'E2E UI project', now()) on conflict (id) do nothing`, [projectId, devId]);
await db.query(`insert into "UnitType"(id, "projectId", "sellerId", "unitLabel", eil, ail, "updatedAt") values ($1, $2, $3, 'E2E UI apartment', 0, 100, now()) on conflict (id) do nothing`, [unitTypeId, projectId, devId]);
await db.query(`delete from "PlanTwinRecord" where "unitTypeId" = $1`, [unitTypeId]);
await db.end();

const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const token = jwt.sign({ userId: devId, email: `${devId}@studio-e2e.invalid`, role: "developer" }, secret, { expiresIn: "1h" });

const browser = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
await ctx.addCookies([{ name: "hq_session", value: token, domain: "localhost", path: "/" }, { name: "haveniq-locale", value: "en", domain: "localhost", path: "/" }]);
await ctx.addInitScript((t) => { try { localStorage.setItem("token", t); } catch {} }, token);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
page.on("response", (r) => { if (r.status() >= 500) errors.push(`${r.status()} ${r.url().slice(0, 100)}`); });
const OUT = "docs/design-studio/results/dev-ui";
fs.mkdirSync(OUT, { recursive: true });

await page.goto(`${base}/dev/properties/${unitTypeId}`, { timeout: 120000 });
await page.waitForSelector('[data-testid="plan-file"]', { state: "attached", timeout: 90000 }).catch(() => {});
check("the apartment page shows the plan section", (await page.locator('[data-testid="plan-file"]').count()) === 1);
await page.locator('[data-testid="plan-file"]').setInputFiles(file);
await page.waitForSelector('[data-testid="plan-approve"]', { timeout: 60000 }).catch(() => {});
check("the uploaded plan is parsed and shown for review", (await page.locator('[data-testid="plan-approve"]').count()) === 1);
await page.screenshot({ path: `${OUT}/${unitTypeId}-review.png`, fullPage: true });
const approve = page.locator('[data-testid="plan-approve"]');
check("approval is allowed (no errors in the plan)", await approve.isEnabled().catch(() => false));
await approve.click();
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/${unitTypeId}-approved.png`, fullPage: true });
const api = await page.evaluate(async ([id, t]) => (await fetch(`/api/dev/unit-types/${id}/plan`, { headers: { Authorization: `Bearer ${t}` } })).json(), [unitTypeId, token]);
check("the plan is approved", api.plan?.status === "approved", `status ${api.plan?.status}`);
check("a walkthrough build is queued", api.build?.status === "queued", `build ${api.build?.status}`);
check("no server errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
