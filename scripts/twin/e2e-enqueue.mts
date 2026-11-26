/**
 * End-to-end test of the build worker without touching the real database.
 *
 *   DATABASE_URL=<local dev db> npx tsx scripts/twin/e2e-enqueue.mts <plan.dxf> <unitTypeId> [--clean]
 *
 * Creates (in a DEV database only; scripts/studio/assert-dev-db.mjs must accept the URL) one developer, project,
 * unit type and an APPROVED plan twin parsed from the DXF, and queues a preview build job in file storage.
 * Then run the worker against the same database:
 *
 *   DATABASE_URL=<local dev db> npx tsx scripts/twin/build-worker.ts --once --preview
 *
 * --clean removes the rows (cascade) and the build job. Generated public/walk and public/projects folders stay.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { Pool } from "pg";
import { getStorage } from "../../lib/storage";
import { buildSlug, writeBuildJob } from "../../lib/twin/buildJobs";
import { parseDxf } from "../../lib/twin/dxf/parse";
import { validateTwin } from "../../lib/twin/validate";

dotenv.config({ path: path.join(process.cwd(), ".env.local"), quiet: true });
const args = process.argv.slice(2);
const clean = args.includes("--clean");
const [file, unitTypeId] = args.filter((a) => !a.startsWith("--"));
if (!file || !unitTypeId) { console.error("usage: e2e-enqueue.mts <plan.dxf> <unitTypeId> [--clean]"); process.exit(2); }

const guard = spawnSync(process.execPath, ["scripts/studio/assert-dev-db.mjs"], { encoding: "utf8", env: process.env });
if (guard.status !== 0) { console.error(guard.stderr.trim()); process.exit(1); }

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const devId = `e2e-dev-${unitTypeId}`;
const projectId = `e2e-proj-${unitTypeId}`;
try {
  if (clean) {
    await pool.query(`delete from "User" where id = $1 and email like '%@studio-e2e.invalid'`, [devId]);
    rmSync(path.join(process.cwd(), ".storage", "builds", buildSlug(unitTypeId)), { recursive: true, force: true });
    console.log("cleaned");
  } else {
    const { twin, notes } = parseDxf(readFileSync(file, "utf8"), { file: path.basename(file) });
    const report = validateTwin(twin);
    console.log(`${twin.rooms.length} rooms, ${twin.openings.length} openings, net ${report.netArea} m2, ${report.issues.length} issues`);
    const approvedAt = new Date();
    await pool.query(`insert into "User"(id, email, "passwordHash", role) values ($1, $2, 'x', 'developer') on conflict (id) do nothing`, [devId, `${devId}@studio-e2e.invalid`]);
    await pool.query(`insert into "Project"(id, "developerId", name, "updatedAt") values ($1, $2, 'E2E project', now()) on conflict (id) do nothing`, [projectId, devId]);
    await pool.query(`insert into "UnitType"(id, "projectId", "sellerId", "unitLabel", eil, ail, "updatedAt") values ($1, $2, $3, 'E2E apartment', 0, 100, now()) on conflict (id) do nothing`, [unitTypeId, projectId, devId]);
    await pool.query(
      `insert into "PlanTwinRecord"(id, "unitTypeId", "sourceKey", "sourceName", twin, report, notes, status, "approvedAt", "updatedAt")
       values ($1, $2, 'e2e', $3, $4, $5, $6, 'approved', ($7::timestamptz at time zone 'UTC'), now())
       on conflict ("unitTypeId") do update set twin = excluded.twin, status = 'approved', "approvedAt" = excluded."approvedAt"`,
      [`e2e-plan-${unitTypeId}`, unitTypeId, path.basename(file), JSON.stringify(twin), JSON.stringify(report), notes, approvedAt.toISOString()],
    );
    await writeBuildJob(getStorage(), {
      unitTypeId, slug: buildSlug(unitTypeId), status: "queued", preview: true,
      approvedAt: approvedAt.toISOString(), queuedAt: new Date().toISOString(),
    });
    console.log(`queued ${buildSlug(unitTypeId)}`);
  }
} finally {
  await pool.end();
}
