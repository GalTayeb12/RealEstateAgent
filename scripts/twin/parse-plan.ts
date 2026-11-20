/**
 * Parse an architect's DXF floor plan into a plan twin and report what it found.
 *
 *   npx tsx scripts/twin/parse-plan.ts <plan.dxf> [outDir]
 *
 * Writes <outDir>/twin.json, report.json and plan.svg (default outDir: next to the DXF).
 * Exit code 1 when the validator reports errors.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { parseDxf } from "../../lib/twin/dxf/parse";
import { validateTwin } from "../../lib/twin/validate";
import { planSvg } from "../../lib/twin/svg";

const [file, outArg] = process.argv.slice(2);
if (!file) { console.error("usage: npx tsx scripts/twin/parse-plan.ts <plan.dxf> [outDir]"); process.exit(2); }
const out = outArg ?? join(dirname(file), basename(file).replace(/\.dxf$/i, "") + "-twin");
mkdirSync(out, { recursive: true });

const { twin, notes } = parseDxf(readFileSync(file, "utf8"), { file: basename(file) });
const report = validateTwin(twin);
writeFileSync(join(out, "twin.json"), JSON.stringify(twin, null, 2));
writeFileSync(join(out, "report.json"), JSON.stringify({ notes, ...report }, null, 2));
writeFileSync(join(out, "plan.svg"), planSvg(twin, { highlight: report.issues.map((i) => i.ref).filter((r): r is string => !!r) }));

console.log(`${twin.walls.length} walls, ${twin.openings.length} openings, ${twin.rooms.length} rooms, net ${report.netArea} m² (source in ${twin.source.sourceUnits})`);
for (const n of notes) console.log(`note: ${n}`);
for (const i of report.issues) console.log(`${i.level}: ${i.en}`);
console.log(report.ok ? "OK" : "ERRORS", "→", out);
process.exit(report.ok ? 0 : 1);
