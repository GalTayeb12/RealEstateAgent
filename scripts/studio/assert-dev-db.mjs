#!/usr/bin/env node
/**
 * Refuses to let migrations, seeds or integration tests run against a database
 * that could be production. Run it first, or require it in front of any DB command:
 *
 *   DATABASE_URL=postgresql://... node scripts/studio/assert-dev-db.mjs && npx prisma migrate deploy
 *
 * Passes only when the host is local (localhost / 127.0.0.1 / ::1), OR the URL
 * names a development database explicitly (database name or host label contains
 * "dev", "test" or "studio") AND is not the production URL found in the main
 * checkout's .env / .env.local. Pass --url=... to check a URL other than DATABASE_URL.
 */
import fs from "node:fs";
import path from "node:path";

const arg = process.argv.find((a) => a.startsWith("--url="))?.slice(6);
const url = arg ?? process.env.DATABASE_URL ?? process.env.STUDIO_TEST_DATABASE_URL;
const fail = (m) => { console.error(`assert-dev-db: REFUSED - ${m}`); process.exit(1); };
if (!url) fail("no DATABASE_URL (or --url) given");

let u;
try { u = new URL(url); } catch { fail("not a valid database URL"); }
const host = u.hostname.toLowerCase();
const db = u.pathname.replace(/^\//, "").toLowerCase();

// the production URL(s): every DATABASE_URL in the .env files of this checkout and of the repository's main checkout
function candidates() {
  const roots = new Set([process.cwd()]);
  try { // a git worktree stores the main checkout path in .git
    const g = fs.readFileSync(path.join(process.cwd(), ".git"), "utf8");
    const m = /gitdir:\s*(.+?)[\\/]\.git[\\/]worktrees/.exec(g);
    if (m) roots.add(m[1]);
  } catch { /* not a worktree */ }
  const out = [];
  for (const r of roots) for (const f of [".env", ".env.local"]) {
    try {
      for (const line of fs.readFileSync(path.join(r, f), "utf8").split(/\r?\n/)) {
        const m = /^\s*DATABASE_URL\s*=\s*"?([^"\s]+)"?/.exec(line);
        if (m) out.push(m[1]);
      }
    } catch { /* missing file */ }
  }
  return out;
}
for (const c of candidates()) {
  try {
    const p = new URL(c);
    if (p.hostname.toLowerCase() === host && p.pathname === u.pathname) fail(`this is the same database as the one configured in your .env files (${p.hostname}${p.pathname})`);
  } catch { /* ignore unparsable */ }
}

const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
const labelled = /(^|[-_.])(dev|test|studio)([-_.]|$)/.test(`${host}/${db}`);
if (!local && !labelled) fail(`host "${host}" is neither local nor labelled dev/test/studio`);
console.log(`assert-dev-db: ok (${local ? "local" : "labelled dev"} database "${db}" on ${host})`);
