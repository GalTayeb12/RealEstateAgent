/**
 * Point every building of a project at a building-explorer asset.
 *
 *   npx tsx scripts/set-building-model.ts <projectId> <modelUrl|null> [--dry]
 *
 * modelUrl is an image (photo stage), a .glb (3D scene) or "null" (procedural).
 * Example: npx tsx scripts/set-building-model.ts seed-yarkon-towers /buildings/yarkon-v2/on.webp
 */
import path from "node:path";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const [projectId, urlArg, flag] = process.argv.slice(2);
if (!projectId || !urlArg) {
  console.error("usage: npx tsx scripts/set-building-model.ts <projectId> <modelUrl|null> [--dry]");
  process.exit(2);
}
const modelUrl = urlArg === "null" ? null : urlArg;
if (modelUrl && !modelUrl.startsWith("/")) {
  console.error("modelUrl must be a site path starting with /");
  process.exit(2);
}

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new (PrismaClient as any)({ adapter: new PrismaPg(pool) });

async function main() {
try {
  const buildings = await prisma.building.findMany({
    where: { projectId },
    orderBy: { sortIndex: "asc" },
    select: { id: true, name: true, modelUrl: true },
  });
  if (buildings.length === 0) throw new Error(`no buildings for project ${projectId}`);
  for (const b of buildings) console.log(`${b.id}  ${b.name}  ${b.modelUrl ?? "(none)"}  →  ${modelUrl ?? "(none)"}`);
  if (flag !== "--dry") {
    const r = await prisma.building.updateMany({ where: { projectId }, data: { modelUrl } });
    console.log(`updated ${r.count} building(s)`);
  }
} finally {
  await prisma.$disconnect();
  await pool.end();
}
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
