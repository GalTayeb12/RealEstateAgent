/**
 * Writes the semantic baseline (public/walk/<slug>/baseline.json) from a plan twin.
 *
 *   npx tsx scripts/studio/export-baseline.mts <yarkon|tlv3|twin.json> <out.json> <slug>
 */
import fs from "node:fs";
import path from "node:path";
import { baselineFromTwin } from "../../lib/studio/baseline/fromTwin";
import { TLV3_TWIN } from "../../lib/twin/fixtures/tlv3";
import { YARKON_TWIN } from "../../lib/twin/fixtures/yarkon";
import { PlanTwin } from "../../lib/twin/schema";

const [src, out, slug] = process.argv.slice(2);
if (!src || !out || !slug) {
  console.error("usage: npx tsx scripts/studio/export-baseline.mts <yarkon|tlv3|twin.json> <out.json> <slug>");
  process.exit(2);
}
const twin = src === "yarkon" ? YARKON_TWIN : src === "tlv3" ? TLV3_TWIN : PlanTwin.parse(JSON.parse(fs.readFileSync(src, "utf8")));
const baseline = baselineFromTwin(twin);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ id: slug, version: 1, baseline }));
console.log(`baseline ${slug}: ${Object.keys(baseline.surfaces).length} surfaces, hash ${baseline.twinHash}`);
