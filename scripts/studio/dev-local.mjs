#!/usr/bin/env node
// Starts `next dev` against the LOCAL dev database (STUDIO_TEST_DATABASE_URL from .env.local) instead of the
// shared one, so uploads, approvals and builds can be tried end to end without touching real data.
//   node scripts/studio/dev-local.mjs [port=3004]
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";

const port = process.argv[2] ?? "3004";
let url = process.env.STUDIO_TEST_DATABASE_URL;
if (!url && fs.existsSync(".env.local")) url = fs.readFileSync(".env.local", "utf8").match(/^STUDIO_TEST_DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m)?.[1];
if (!url) { console.error("dev-local: STUDIO_TEST_DATABASE_URL is not set (.env.local)"); process.exit(1); }
const guard = spawnSync(process.execPath, ["scripts/studio/assert-dev-db.mjs", `--url=${url}`], { encoding: "utf8" });
if (guard.status !== 0) { console.error(guard.stderr.trim()); process.exit(1); }
console.log(`dev-local: next dev on :${port} against the local dev database`);
spawn("npx", ["next", "dev", "-p", port], { stdio: "inherit", shell: true, env: { ...process.env, DATABASE_URL: url } });
