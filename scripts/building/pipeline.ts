/**
 * pipeline.ts — Building GLB pipeline orchestrator
 *
 * Usage:
 *   npx tsx scripts/building/pipeline.ts <projectId> [--skip-bake] [--skip-compress]
 *
 * Steps:
 *   1. Export building/floor/unit data from DB  → output/<id>-data.json
 *   2. Run Blender headless bake                → output/<id>.glb + previews
 *   3. Compress GLB (desktop + mobile variants) → output/<id>-desktop.glb, <id>-mobile.glb
 *   4. Update Building.modelUrl in DB (if applicable)
 */

import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const PROJECT_ID  = process.argv[2];
const SKIP_BAKE   = process.argv.includes("--skip-bake");
const SKIP_COMP   = process.argv.includes("--skip-compress");

if (!PROJECT_ID) {
  console.error("Usage: npx tsx scripts/building/pipeline.ts <projectId> [--skip-bake] [--skip-compress]");
  process.exit(1);
}

const ROOT       = process.cwd();  // assumes invoked from project root
const SCRIPTS    = path.join(ROOT, "scripts", "building");
const OUTPUT_DIR = path.join(SCRIPTS, "output");
const BLENDER_EXE = path.join(SCRIPTS, "blender", "blender-4.2.8-windows-x64", "blender.exe");
const HDRI_PATH  = path.join(SCRIPTS, "assets", "kloppenheim_02_2k.hdr");

const DATA_JSON   = path.join(OUTPUT_DIR, `${PROJECT_ID}-data.json`);
const RAW_GLB     = path.join(OUTPUT_DIR, `${PROJECT_ID}.glb`);
const META_JSON   = path.join(OUTPUT_DIR, `${PROJECT_ID}-meta.json`);
const DESKTOP_GLB = path.join(OUTPUT_DIR, `${PROJECT_ID}-desktop.glb`);
const MOBILE_GLB  = path.join(OUTPUT_DIR, `${PROJECT_ID}-mobile.glb`);

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function run(cmd: string, args: string[], label: string) {
  console.log(`\n▶ ${label}`);
  console.log(`  ${cmd} ${args.join(" ")}`);
  const t0 = Date.now();
  try {
    execFileSync(cmd, args, { stdio: "inherit" });
  } catch (e: any) {
    console.error(`\n✗ ${label} failed (exit ${e.status})`);
    process.exit(e.status ?? 1);
  }
  console.log(`  ✓ done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// ── Step 1: Export DB ──────────────────────────────────────────────────────────
run(
  "npx",
  ["tsx", path.join(SCRIPTS, "export-db.ts"), PROJECT_ID, DATA_JSON],
  "Export DB data",
);

// ── Step 2: Blender bake ───────────────────────────────────────────────────────
if (!SKIP_BAKE) {
  if (!fs.existsSync(BLENDER_EXE)) {
    console.error(`Blender not found at: ${BLENDER_EXE}`);
    console.error("Download Blender 4.2 LTS portable and extract to scripts/building/blender/");
    process.exit(1);
  }
  run(
    BLENDER_EXE,
    [
      "-b",
      "-P", path.join(SCRIPTS, "build_tower.py"),
      "--",
      DATA_JSON,
      RAW_GLB,
      META_JSON,
      ...(fs.existsSync(HDRI_PATH) ? [HDRI_PATH] : []),
    ],
    "Blender bake",
  );
} else {
  console.log("\n⏭ Skipping Blender bake (--skip-bake)");
}

// ── Step 3: Compress ───────────────────────────────────────────────────────────
if (!SKIP_COMP) {
  if (!fs.existsSync(RAW_GLB)) {
    console.error(`Raw GLB not found: ${RAW_GLB}. Run without --skip-bake first.`);
    process.exit(1);
  }
  run(
    "node",
    [path.join(SCRIPTS, "compress.mjs"), RAW_GLB, DESKTOP_GLB],
    "Compress GLB (desktop)",
  );
  run(
    "node",
    [path.join(SCRIPTS, "compress.mjs"), RAW_GLB, MOBILE_GLB, "--mobile"],
    "Compress GLB (mobile)",
  );
} else {
  console.log("\n⏭ Skipping compression (--skip-compress)");
}

// ── Step 4: Copy to public/ and update DB ─────────────────────────────────────
const PUBLIC_DIR = path.join(ROOT, "public", "buildings");
fs.mkdirSync(PUBLIC_DIR, { recursive: true });

const publicGlb  = path.join(PUBLIC_DIR, `${PROJECT_ID}.glb`);
const publicMeta = path.join(PUBLIC_DIR, `${PROJECT_ID}-meta.json`);
const srcGlb     = fs.existsSync(DESKTOP_GLB) ? DESKTOP_GLB : RAW_GLB;

if (fs.existsSync(srcGlb)) {
  fs.copyFileSync(srcGlb, publicGlb);
  console.log(`\n✓ Copied GLB → ${publicGlb}`);
}
if (fs.existsSync(META_JSON)) {
  fs.copyFileSync(META_JSON, publicMeta);
  console.log(`✓ Copied meta → ${publicMeta}`);
}

// Update the first building's modelUrl so BuildingExplorer picks up the GLB
if (fs.existsSync(publicGlb)) {
  try {
    const { PrismaClient } = await import("../../app/generated/prisma/client");
    const { PrismaPg }     = await import("@prisma/adapter-pg");
    const { Pool }         = await import("pg");
    const dotenv           = await import("dotenv");
    dotenv.config({ path: path.join(ROOT, ".env.local") });
    dotenv.config({ path: path.join(ROOT, ".env") });

    const pool    = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma  = new (PrismaClient as any)({ adapter });

    const buildings = await prisma.building.findMany({
      where: { project: { id: PROJECT_ID } },
      orderBy: { sortIndex: "asc" },
      take: 1,
    });
    if (buildings.length > 0) {
      const modelUrl = `/buildings/${PROJECT_ID}.glb`;
      await prisma.building.update({
        where: { id: buildings[0].id },
        data: { modelUrl },
      });
      console.log(`✓ Building.modelUrl → ${modelUrl}`);
    }
    await prisma.$disconnect();
    await pool.end();
  } catch (e) {
    console.warn("Could not update DB modelUrl:", (e as Error).message);
  }
}

// ── Summary ────────────────────────────────────────────────────────────────────
console.log("\n════════════════════════════════════════════════════════");
console.log("Pipeline complete.");
for (const [label, p] of [
  ["Data JSON   ", DATA_JSON],
  ["Raw GLB     ", RAW_GLB],
  ["Desktop GLB ", DESKTOP_GLB],
  ["Mobile GLB  ", MOBILE_GLB],
  ["Meta JSON   ", META_JSON],
] as [string, string][]) {
  if (fs.existsSync(p)) {
    const mb = (fs.statSync(p).size / 1024 / 1024).toFixed(1);
    console.log(`  ${label}: ${p} (${mb} MB)`);
  }
}
const previews = [
  RAW_GLB.replace(".glb", "_preview.png"),
  RAW_GLB.replace(".glb", "_baked.png"),
];
for (const p of previews) {
  if (fs.existsSync(p)) {
    console.log(`  Preview     : ${p}`);
  }
}
