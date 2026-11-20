/**
 * Run the DXF parser over a folder of real plans and print one line per file:
 * what it understood, and what the review screen will have to ask the developer.
 *
 *   npx tsx scripts/twin/eval-dxf.ts <folder> [--csv out.csv]
 *
 * Use it on every plan you can get: each file that parses badly shows what a
 * developer's file does that the parser does not handle yet.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseDxf } from "../../lib/twin/dxf/parse";
import { validateTwin } from "../../lib/twin/validate";

const args = process.argv.slice(2);
const csvIdx = args.indexOf("--csv");
const csv = csvIdx >= 0 ? args.splice(csvIdx, 2)[1] : null;
const dir = args[0];
if (!dir) { console.error("usage: npx tsx scripts/twin/eval-dxf.ts <folder> [--csv out.csv]"); process.exit(2); }

const files = readdirSync(dir).filter((f) => /\.dxf$/i.test(f)).sort();
const rows: string[][] = [["file", "size_kb", "walls", "openings", "rooms", "net_m2", "errors", "warnings", "first_note"]];
for (const f of files) {
  const path = join(dir, f);
  const kb = Math.round(statSync(path).size / 1024);
  try {
    const { twin, notes } = parseDxf(readFileSync(path, "utf8"), { file: f });
    const r = validateTwin(twin);
    const errors = r.issues.filter((i) => i.level === "error").length, warnings = r.issues.filter((i) => i.level === "warning").length;
    rows.push([f, String(kb), String(twin.walls.length), String(twin.openings.length), String(twin.rooms.length), String(r.netArea), String(errors), String(warnings), notes[0] ?? ""]);
  } catch (e) {
    rows.push([f, String(kb), "-", "-", "-", "-", "-", "-", `FAILED: ${(e as Error).message.slice(0, 80)}`]);
  }
}
const widths = rows[0].map((_, c) => Math.min(44, Math.max(...rows.map((r) => r[c].length))));
for (const r of rows) console.log(r.map((v, c) => (c === 0 || c === 8 ? v.slice(0, widths[c]).padEnd(widths[c]) : v.padStart(widths[c]))).join("  "));
if (csv) writeFileSync(csv, rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n"));
