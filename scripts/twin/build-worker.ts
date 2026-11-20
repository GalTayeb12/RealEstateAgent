/**
 * Build worker: approved plan twins → published walkthroughs.
 *
 *   npx tsx scripts/twin/build-worker.ts [--once] [--preview] [--simulate <walk-slug>]
 *
 * Finds plans whose build job (lib/twin/buildJobs.ts) is queued, and for each:
 *   1. writes the approved twin to storage (builds/<slug>/twin.json)
 *   2. runs scripts/twin/build-walk.mjs <twin.json> <slug>   (headless Blender)
 *        → public/walk/<slug>/  (apartment.glb, lightmaps, probes, walk.json)
 *   3. draws the floor plan → public/walk/<slug>/plan.svg (the walk's minimap)
 *   4. writes public/projects/<slug>/experience.json, so /walk/<slug> loads it
 *   5. marks the job done (or failed, with the reason and the end of the log)
 *
 * --once        process what is queued now and exit (default: keep polling)
 * --preview     fast bake for every job (minutes instead of ~20 min)
 * --simulate S  skip Blender and copy the already-built public/walk/S instead;
 *               for testing the pipeline on a machine without the Blender assets
 *
 * Env: as build-walk.mjs (BLENDER, ASSETS_SRC, BASE_BLEND), plus DATABASE_URL.
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../app/generated/prisma/client";
import { getStorage } from "../../lib/storage";
import { type BuildJob, readBuildJob, writeBuildJob } from "../../lib/twin/buildJobs";
import { PlanTwin } from "../../lib/twin/schema";
import { planSvg } from "../../lib/twin/svg";
import { experienceFromBuild } from "../../lib/experience/fromBuild";

const argv = process.argv.slice(2);
const ONCE = argv.includes("--once");
const FORCE_PREVIEW = argv.includes("--preview");
const simIdx = argv.indexOf("--simulate");
const SIMULATE = simIdx >= 0 ? argv[simIdx + 1] : null;
const POLL_MS = 20_000;
const LOG_TAIL = 4000;

const ROOT = process.cwd();
dotenv.config({ path: path.join(ROOT, ".env.local"), quiet: true });
dotenv.config({ path: path.join(ROOT, ".env"), quiet: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new (PrismaClient as any)({ adapter: new PrismaPg(pool) });
const storage = getStorage();

const now = () => new Date().toISOString();

/** Run build-walk.mjs; resolves with the exit code and the tail of its output. */
function runBuildWalk(twinFile: string, slug: string, preview: boolean): Promise<{ code: number; tail: string }> {
  return new Promise((resolve) => {
    const args = ["scripts/twin/build-walk.mjs", twinFile, slug, ...(preview ? ["--preview"] : [])];
    const child = spawn(process.execPath, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let tail = "";
    const keep = (chunk: Buffer, out: NodeJS.WriteStream) => {
      out.write(chunk);
      tail = (tail + chunk.toString("utf8")).slice(-LOG_TAIL);
    };
    child.stdout.on("data", (c: Buffer) => keep(c, process.stdout));
    child.stderr.on("data", (c: Buffer) => keep(c, process.stderr));
    child.on("close", (code) => resolve({ code: code ?? 1, tail }));
    child.on("error", (err) => resolve({ code: 1, tail: `${tail}\n${err.message}` }));
  });
}

async function build(job: BuildJob, rec: { twin: unknown; unitType: { id: string; unitLabel: string; project: { id: string; name: string } } }) {
  const { slug } = job;
  const twin = PlanTwin.parse(rec.twin);
  const walkDir = path.join(ROOT, "public", "walk", slug);

  // 1. the approved twin, where build-walk can read it
  const twinKey = `builds/${slug}/twin.json`;
  await storage.put(twinKey, new TextEncoder().encode(JSON.stringify(twin)), { contentType: "application/json" });
  const twinFile = fileURLToPath(storage.url(twinKey));

  // 2. walkthrough assets
  if (SIMULATE) {
    const from = path.join(ROOT, "public", "walk", SIMULATE);
    if (!existsSync(path.join(from, "walk.json"))) throw new Error(`--simulate: public/walk/${SIMULATE}/walk.json not found`);
    rmSync(walkDir, { recursive: true, force: true });
    cpSync(from, walkDir, { recursive: true });
    console.log(`  simulated build: copied public/walk/${SIMULATE} → public/walk/${slug}`);
  } else {
    const { code, tail } = await runBuildWalk(twinFile, slug, job.preview || FORCE_PREVIEW);
    if (code !== 0) {
      const err = new Error(`build-walk exited with code ${code}`);
      (err as Error & { log?: string }).log = tail;
      throw err;
    }
  }
  const walkJson = path.join(walkDir, "walk.json");
  if (!existsSync(walkJson)) throw new Error(`build finished but public/walk/${slug}/walk.json is missing`);

  // 3. floor plan for the minimap
  writeFileSync(path.join(walkDir, "plan.svg"), planSvg(twin, { lang: "he" }));

  // 4. experience config → /walk/<slug>
  const { unitType } = rec;
  const label = `${unitType.project.name} — ${unitType.unitLabel}`;
  const experience = experienceFromBuild({
    slug,
    base: `/walk/${slug}`,
    walk: JSON.parse(readFileSync(walkJson, "utf8")),
    twin,
    title: { he: label, en: label },
    aliases: [unitType.id],
    planImage: `/walk/${slug}/plan.svg`,
  });
  const projDir = path.join(ROOT, "public", "projects", slug);
  mkdirSync(projDir, { recursive: true });
  writeFileSync(path.join(projDir, "experience.json"), JSON.stringify(experience, null, 2) + "\n");
}

async function processQueued(): Promise<number> {
  const approved = await prisma.planTwinRecord.findMany({
    where: { status: "approved" },
    select: {
      unitTypeId: true, approvedAt: true, twin: true,
      unitType: { select: { id: true, unitLabel: true, project: { select: { id: true, name: true } } } },
    },
  });
  let n = 0;
  for (const rec of approved) {
    const job = await readBuildJob(storage, rec.unitTypeId);
    if (!job || job.status !== "queued") continue;
    // A newer approval re-queues; skip a job built from an older one.
    if (!rec.approvedAt || job.approvedAt !== rec.approvedAt.toISOString()) continue;
    n++;
    console.log(`\n■ ${rec.unitType.project.name} — ${rec.unitType.unitLabel} → /walk/${job.slug}`);
    const running: BuildJob = { ...job, status: "running", startedAt: now(), error: undefined, log: undefined };
    await writeBuildJob(storage, running);
    try {
      await build(running, rec);
      await writeBuildJob(storage, { ...running, status: "done", finishedAt: now() });
      console.log(`✔ done: /walk/${job.slug}`);
    } catch (err) {
      const e = err as Error & { log?: string };
      await writeBuildJob(storage, { ...running, status: "failed", finishedAt: now(), error: e.message, log: e.log });
      console.error(`✖ failed: ${e.message}`);
    }
  }
  return n;
}

async function main() {
  try {
    do {
      const n = await processQueued();
      if (ONCE) { if (n === 0) console.log("nothing queued"); break; }
      await new Promise((r) => setTimeout(r, POLL_MS));
    } while (true);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
