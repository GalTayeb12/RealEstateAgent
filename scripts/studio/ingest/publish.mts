/**
 * Publishes the catalog snapshot the studio loads from the repository: validates every manifest in
 * catalog/manifests/*.json and writes public/studio/catalog/index.json.
 *
 *   npx tsx scripts/studio/ingest/publish.mts [--skip-previews]
 *
 * The gates are shared with the admin catalog (lib/studio/catalog/gates.ts): a failing asset blocks
 * the whole publish. Generator-built models also need their preview image.
 * The admin catalog (/admin/catalog) seeds its first release from this snapshot and can import later
 * repository additions ("Sync repository").
 */
import fs from "node:fs";
import path from "node:path";
import { glbGates, parseManifest, staticGates } from "../../../lib/studio/catalog/gates";
import type { MaterialManifest, ModelManifest } from "../../../lib/studio/schema/catalog";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const dir = path.join(ROOT, "catalog/manifests");
const pub = path.join(ROOT, "public/studio/catalog");
const problems: string[] = [];
const models: ModelManifest[] = [];
const materials: MaterialManifest[] = [];
const seen = new Set<string>();

for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
  const parsed = parseManifest(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  if ("issues" in parsed) { problems.push(`${f}: ${parsed.issues.join("; ")}`); continue; }
  const m = parsed.manifest;
  const key = `${m.type}:${m.id}@${m.version}`;
  if (seen.has(key)) problems.push(`${f}: duplicate ${key}`);
  seen.add(key);
  for (const issue of staticGates(m)) problems.push(`${f}: ${issue}`);
  if (m.type === "material") { materials.push(m); continue; }
  if (!m.assets.glb) {
    if (!process.argv.includes("--skip-previews") && !fs.existsSync(path.join(pub, m.assets.preview))) problems.push(`${f}: missing preview ${m.assets.preview}`);
    models.push(m);
    continue;
  }
  const glb = path.join(pub, m.assets.glb);
  if (!fs.existsSync(glb)) { problems.push(`${f}: missing GLB ${m.assets.glb}`); continue; }
  for (const issue of await glbGates(m, fs.readFileSync(glb))) problems.push(`${f}: ${issue}`);
  models.push(m);
}

if (problems.length) {
  console.error("Publish blocked:\n - " + problems.join("\n - "));
  process.exit(1);
}
const snapshot = { schema: 1, publishedAt: new Date().toISOString(), models, materials };
fs.mkdirSync(pub, { recursive: true });
fs.writeFileSync(path.join(pub, "index.json"), JSON.stringify(snapshot));
console.log(`published ${models.length} models, ${materials.length} materials`);
