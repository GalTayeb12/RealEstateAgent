/**
 * Move the remaining English listing data to Hebrew (the site targets Israel,
 * and matching / display are Hebrew-first). Preview by default; nothing is
 * written without --apply. Only rows whose current text still matches the
 * English below are touched, so edits made since are left alone.
 *
 *   npx tsx scripts/hebrew-listing-data.ts            # preview
 *   npx tsx scripts/hebrew-listing-data.ts --apply    # write
 */
import path from "node:path";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const apply = process.argv.includes("--apply");

dotenv.config({ path: path.join(process.cwd(), ".env.local"), quiet: true });
dotenv.config({ path: path.join(process.cwd(), ".env"), quiet: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new (PrismaClient as any)({ adapter: new PrismaPg(pool) });

type Change = { model: "project" | "unitType"; id: string; field: string; from: string; to: string };

const CHANGES: Change[] = [
  { model: "project", id: "cmtkb1jrp000ey8phalelxdm5", field: "name", from: "Rainbow Tel Aviv", to: "ריינבו תל אביב" },
  { model: "project", id: "cmtkb1jrp000ey8phalelxdm5", field: "location", from: "Sde Dov, North Tel Aviv", to: "שדה דב, צפון תל אביב" },
  {
    model: "project", id: "cmtkb1jrp000ey8phalelxdm5", field: "description",
    from: "The project is built as a \"residential resort\" that combines a 42-story tower alongside 6 8-story boutique buildings, and includes swimming pools, spa complexes and green areas.",
    to: "הפרויקט בנוי כ\"ריזורט למגורים\": מגדל בן 42 קומות לצד 6 בנייני בוטיק בני 8 קומות, עם בריכות שחייה, מתחמי ספא ושטחים ירוקים.",
  },
  { model: "unitType", id: "cmtkb59vy000gy8phuiymfc9w", field: "unitLabel", from: "4-room", to: "4 חדרים" },
  {
    model: "unitType", id: "cmtkb59vy000gy8phuiymfc9w", field: "description",
    from: "Spacious 4-room family apartment with panoramic views, upgraded kitchen, and smart home systems.",
    to: "דירת 4 חדרים מרווחת למשפחה, עם נוף פנורמי, מטבח משודרג ומערכות בית חכם.",
  },
  { model: "unitType", id: "cmtkb4dnf000fy8phhb1ncsw6", field: "unitLabel", from: "3-room", to: "3 חדרים" },
  {
    model: "unitType", id: "cmtkb4dnf000fy8phhb1ncsw6", field: "description",
    from: "DESCRIPTION: Luxury 3-room apartment in Rainbow Sde Dov, featuring a spacious balcony, premium finishes, and sea view.",
    to: "דירת 3 חדרים יוקרתית בריינבו שדה דב, עם מרפסת מרווחת, גימורים ברמה גבוהה ונוף לים.",
  },
];

async function main() {
  try {
    const todo: Change[] = [];
    for (const c of CHANGES) {
      const delegate = c.model === "project" ? prisma.project : prisma.unitType;
      const row = await delegate.findUnique({ where: { id: c.id }, select: { [c.field]: true } });
      const current = row?.[c.field];
      if (current === c.to) { console.log(`= ${c.model}.${c.field} (${c.id}) already Hebrew`); continue; }
      if (current !== c.from) { console.log(`! ${c.model}.${c.field} (${c.id}) changed since, skipped: ${JSON.stringify(current)}`); continue; }
      console.log(`${c.model}.${c.field} (${c.id})\n    ${c.from}\n  → ${c.to}`);
      todo.push(c);
    }
    console.log(`\n${todo.length} field(s) to update`);
    if (!apply) { console.log("Preview only. Run with --apply to write."); return; }
    await prisma.$transaction(todo.map((c) =>
      (c.model === "project" ? prisma.project : prisma.unitType).update({ where: { id: c.id }, data: { [c.field]: c.to } })));
    console.log(`updated ${todo.length} field(s)`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
