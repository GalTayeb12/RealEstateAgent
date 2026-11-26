#!/usr/bin/env node
// Creates (or removes) User rows for e2e runs against a DEV database: with STUDIO_STORE=prisma every
// design needs a real owner (StudioDesign.ownerId is a foreign key to User). Refuses anything that
// scripts/studio/assert-dev-db.mjs refuses. Never prints the connection string.
//   node --env-file=.env.local scripts/studio/dev-db-users.mjs add <id> [<id>...]
//   node --env-file=.env.local scripts/studio/dev-db-users.mjs remove <id> [<id>...]   (their designs cascade)
//   node --env-file=.env.local scripts/studio/dev-db-users.mjs count <id> [<id>...]    (designs per user)
import { spawnSync } from "node:child_process";
import pg from "pg";

const [cmd, ...ids] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!["add", "remove", "count"].includes(cmd) || !ids.length) { console.error("usage: dev-db-users.mjs add|remove|count <id>..."); process.exit(2); }
const guard = spawnSync(process.execPath, ["scripts/studio/assert-dev-db.mjs"], { encoding: "utf8", env: process.env });
if (guard.status !== 0) { console.error(guard.stderr.trim()); process.exit(1); }

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  for (const id of ids) {
    if (cmd === "add") {
      await client.query(`insert into "User"(id, email, "passwordHash", role) values ($1, $2, 'x', 'developer') on conflict (id) do nothing`, [id, `${id}@studio-e2e.invalid`]);
      console.log(`user ${id}: ready`);
    } else if (cmd === "remove") {
      const r = await client.query(`delete from "User" where id = $1 and email like '%@studio-e2e.invalid'`, [id]);
      console.log(`user ${id}: removed ${r.rowCount}`);
    } else {
      const d = await client.query(`select count(*)::int n from "StudioDesign" where "ownerId" = $1`, [id]);
      const v = await client.query(`select count(*)::int n from "StudioDesignVersion" v join "StudioDesign" d on d.id = v."designId" where d."ownerId" = $1`, [id]);
      const s = await client.query(`select count(*)::int n from "StudioDesignShare" s join "StudioDesign" d on d.id = s."designId" where d."ownerId" = $1`, [id]);
      console.log(`user ${id}: ${d.rows[0].n} designs, ${v.rows[0].n} versions, ${s.rows[0].n} share links`);
    }
  }
} finally {
  await client.end();
}
