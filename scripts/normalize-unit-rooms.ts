/**
 * Give every unit type an explicit `attributes.rooms` (Israeli room count),
 * the key the rooms filter reads. Also rewrites double-encoded attributes as
 * plain JSON. Preview by default; nothing is written without --apply.
 *
 *   npx tsx scripts/normalize-unit-rooms.ts            # preview
 *   npx tsx scripts/normalize-unit-rooms.ts --apply    # write
 *
 * rooms comes from roomsOf(): the unit label ("3 חדרים", "4-room") or legacy
 * bedrooms + 1. Rows where neither exists are listed and left for a person.
 */
import path from "node:path";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { parseAttributes, roomsOf } from "../lib/attributes";

const apply = process.argv.includes("--apply");

dotenv.config({ path: path.join(process.cwd(), ".env.local"), quiet: true });
dotenv.config({ path: path.join(process.cwd(), ".env"), quiet: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new (PrismaClient as any)({ adapter: new PrismaPg(pool) });

async function main() {
  try {
    const rows: { id: string; unitLabel: string; attributes: string; project: { name: string } }[] =
      await prisma.unitType.findMany({
        select: { id: true, unitLabel: true, attributes: true, project: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      });

    const updates: { id: string; attributes: string }[] = [];
    const unresolved: string[] = [];
    for (const r of rows) {
      const attrs = parseAttributes(r.attributes);
      const hasRooms = typeof attrs.rooms === "number" && attrs.rooms > 0;
      const rooms = roomsOf(attrs, r.unitLabel);
      const name = `${r.project.name} — ${r.unitLabel} (${r.id})`;
      if (rooms === null) { unresolved.push(name); continue; }
      const next = hasRooms ? attrs : { ...attrs, rooms };
      const text = JSON.stringify(next);
      if (text === r.attributes) continue;
      const source = hasRooms ? "re-encoded" : typeof attrs.bedrooms === "number" && !/\d/.test(r.unitLabel) ? "bedrooms + 1" : "label";
      console.log(`${name}\n    ${r.attributes}\n  → ${text}   [rooms ${rooms} from ${source}]`);
      updates.push({ id: r.id, attributes: text });
    }

    console.log(`\n${rows.length} unit types · ${updates.length} to update · ${unresolved.length} without a room count`);
    for (const u of unresolved) console.log(`  ! no room count: ${u}`);

    if (!apply) {
      console.log("\nPreview only. Run with --apply to write.");
      return;
    }
    await prisma.$transaction(updates.map((u) => prisma.unitType.update({ where: { id: u.id }, data: { attributes: u.attributes } })));
    console.log(`updated ${updates.length} unit type(s)`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
