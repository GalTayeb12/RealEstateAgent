/**
 * export-db.ts
 * Exports building/floor/unit data for a project to JSON.
 * Usage: npx tsx scripts/building/export-db.ts <projectId> [outputPath]
 */

import { PrismaClient } from "../../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load env vars from .env (or .env.local if it exists)
dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL not set. Add it to .env or .env.local");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new (PrismaClient as any)({ adapter }) as PrismaClient;

async function main() {
  const projectId = process.argv[2];
  if (!projectId) {
    console.error("Usage: npx tsx scripts/building/export-db.ts <projectId> [outputPath]");
    process.exit(1);
  }

  const outputPath =
    process.argv[3] ??
    path.join("scripts/building/output", `${projectId}-data.json`);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      buildings: {
        orderBy: { sortIndex: "asc" },
        include: {
          units: {
            orderBy: [{ floor: "asc" }, { positionIndex: "asc" }],
          },
        },
      },
    },
  });

  if (!project) {
    console.error(`Project not found: ${projectId}`);
    process.exit(1);
  }

  const output = {
    projectId: project.id,
    projectName: project.name,
    exportedAt: new Date().toISOString(),
    buildings: project.buildings.map((b) => {
      // Determine floor count from units
      const floors = new Map<number, typeof b.units>();
      for (const unit of b.units) {
        const list = floors.get(unit.floor) ?? [];
        list.push(unit);
        floors.set(unit.floor, list);
      }

      const maxFloor = Math.max(0, ...b.units.map((u) => u.floor));
      const topResidentialFloor = maxFloor;

      const floorData = [];
      for (let f = 1; f <= maxFloor; f++) {
        const units = floors.get(f) ?? [];
        floorData.push({
          floor: f,
          isLobby: units.length === 0,
          isPenthouse: f === topResidentialFloor && units.length > 0,
          units: units.map((u) => ({
            id: u.id,
            unitNumber: u.unitNumber,
            positionIndex: u.positionIndex,
            status: u.status,
            unitTypeId: u.unitTypeId,
          })),
        });
      }

      return {
        id: b.id,
        name: b.name,
        sortIndex: b.sortIndex,
        floorCount: maxFloor,
        unitsPerFloor: b.unitsPerFloor,
        floors: floorData,
      };
    }),
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(`Exported ${project.buildings.length} buildings → ${outputPath}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
