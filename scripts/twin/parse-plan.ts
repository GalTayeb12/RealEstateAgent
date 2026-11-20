/**
 * Parse an architect's DXF floor plan into a plan twin and report what it found.
 *
 *   npx tsx scripts/twin/parse-plan.ts <plan.dxf> [outDir] [--window x1,y1,x2,y2] [--rooms]
 *
 * --window  crop to a rectangle in the drawing's own coordinates (one unit out of
 *           a whole-floor drawing); the notes say when a file looks like it needs one
 * --rooms   list every room found (name, type, area) and the opening counts
 *
 * Writes <outDir>/twin.json, report.json and plan.svg (default outDir: next to the DXF).
 * Exit code 1 when the validator reports errors.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { parseDxf } from "../../lib/twin/dxf/parse";
import { validateTwin } from "../../lib/twin/validate";
import { planSvg } from "../../lib/twin/svg";
import { polygonArea } from "../../lib/twin/schema";

const args = process.argv.slice(2);
const takeValue = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null; };
const windowArg = takeValue("--window");
const listRooms = args.includes("--rooms");
const [file, outArg] = args.filter((a) => !a.startsWith("--"));
if (!file) { console.error("usage: npx tsx scripts/twin/parse-plan.ts <plan.dxf> [outDir] [--window x1,y1,x2,y2] [--rooms]"); process.exit(2); }
const win = windowArg ? (windowArg.split(",").map(Number) as [number, number, number, number]) : undefined;
if (win && (win.length !== 4 || win.some((n) => !Number.isFinite(n)))) { console.error("--window needs x1,y1,x2,y2"); process.exit(2); }
const out = outArg ?? join(dirname(file), basename(file).replace(/\.dxf$/i, "") + (win ? "-crop" : "") + "-twin");
mkdirSync(out, { recursive: true });

const { twin, notes } = parseDxf(readFileSync(file, "utf8"), { file: basename(file), window: win });
const report = validateTwin(twin);
writeFileSync(join(out, "twin.json"), JSON.stringify(twin, null, 2));
writeFileSync(join(out, "report.json"), JSON.stringify({ notes, ...report }, null, 2));
writeFileSync(join(out, "plan.svg"), planSvg(twin, { highlight: report.issues.map((i) => i.ref).filter((r): r is string => !!r) }));

console.log(`${twin.walls.length} walls, ${twin.openings.length} openings, ${twin.rooms.length} rooms, net ${report.netArea} m² (source in ${twin.source.sourceUnits})`);
if (listRooms) {
  for (const r of twin.rooms) console.log(`  room ${r.id.padEnd(14)} ${r.type.padEnd(9)} ${polygonArea(r.polygon).toFixed(1).padStart(6)} m²  ${r.name.he}`);
  const kinds = twin.openings.reduce<Record<string, number>>((a, o) => ({ ...a, [o.kind]: (a[o.kind] ?? 0) + 1 }), {});
  console.log(`  openings: ${JSON.stringify(kinds)}`);
}
for (const n of notes) console.log(`note: ${n}`);
for (const i of report.issues) console.log(`${i.level}: ${i.en}`);
console.log(report.ok ? "OK" : "ERRORS", "→", out);
process.exit(report.ok ? 0 : 1);
