/**
 * Write a plan twin as JSON for the Blender generators (scripts/blender/twin_build.py).
 *
 *   npx tsx scripts/twin/export-twin.ts <source> <outDir>
 *
 * <source> is a fixture name (yarkon, tlv3), an architect's .dxf (parsed with
 * parseDxf) or an existing twin .json. Writes:
 *   <outDir>/twin.json    the validated twin
 *   <outDir>/layout.json  what the generators read besides it: room rectangles
 *                         and types, wall collision boxes, doors with the rooms
 *                         on each side, reflection probe spots and the spawn
 * Exit code 1 when the validator reports errors (the twin is still written).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { PlanTwin } from "../../lib/twin/schema";
import { parseDxf } from "../../lib/twin/dxf/parse";
import { validateTwin } from "../../lib/twin/validate";
import { walkLayout } from "../../lib/twin/walk";
import { YARKON_TWIN } from "../../lib/twin/fixtures/yarkon";
import { TLV3_TWIN } from "../../lib/twin/fixtures/tlv3";

const FIXTURES: Record<string, PlanTwin> = { yarkon: YARKON_TWIN, tlv3: TLV3_TWIN };

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error(`usage: npx tsx scripts/twin/export-twin.ts <${Object.keys(FIXTURES).join("|")}|plan.dxf|twin.json> <outDir>`);
  process.exit(2);
}

let twin: PlanTwin;
if (FIXTURES[src]) twin = FIXTURES[src];
else if (/\.dxf$/i.test(src)) {
  const r = parseDxf(readFileSync(src, "utf8"), { file: basename(src) });
  for (const n of r.notes) console.log(`note: ${n}`);
  twin = r.twin;
} else twin = PlanTwin.parse(JSON.parse(readFileSync(src, "utf8")));

const report = validateTwin(twin);
for (const i of report.issues) console.log(`${i.level}: ${i.en}`);
const layout = walkLayout(twin);
if (layout.skippedWalls.length) console.log(`warning: walls not axis-aligned, no collision boxes: ${layout.skippedWalls.join(", ")}`);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "twin.json"), JSON.stringify(twin, null, 2));
writeFileSync(join(out, "layout.json"), JSON.stringify(layout, null, 1));
console.log(`${twin.walls.length} walls, ${twin.openings.length} openings, ${twin.rooms.length} rooms, net ${report.netArea} m² → ${out}`);
process.exit(report.ok ? 0 : 1);
