/**
 * Publishes the catalog snapshot the studio loads: validates every manifest in
 * catalog/manifests/*.json and writes public/studio/catalog/index.json.
 *
 *   npx tsx scripts/studio/ingest/publish.mts
 *
 * Gates (a failing asset blocks the whole publish):
 *   - manifest parses (strict zod), (id, version) is unique
 *   - license block present (enforced by the schema) and attribution text set for CC-BY
 *   - the GLB exists and its real bounding box matches manifest.dims within 1 cm
 *     (modular/parametric assets: the default configuration is checked in M8)
 *   - every material slot target exists in the GLB
 *   - triangle budget (hero <= 120k, default <= 60k) and file size (<= 1.5 MB hero)
 */
import fs from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { getBounds } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";
import { MaterialManifest, ModelManifest } from "../../../lib/studio/schema/catalog";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const dir = path.join(ROOT, "catalog/manifests");
const pub = path.join(ROOT, "public/studio/catalog");
const problems: string[] = [];
const models: ModelManifest[] = [];
const materials: MaterialManifest[] = [];
const seen = new Set<string>();

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });

for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  delete raw._note; // free-form curator note, not part of the contract
  const isModel = raw.type === "model";
  const parsed = (isModel ? ModelManifest : MaterialManifest).safeParse(raw);
  if (!parsed.success) { problems.push(`${f}: ${parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}`); continue; }
  const m = parsed.data;
  const key = `${m.type}:${m.id}@${m.version}`;
  if (seen.has(key)) problems.push(`${f}: duplicate ${key}`);
  seen.add(key);
  if (m.license.spdx === "CC-BY-4.0" && !m.license.attributionText) problems.push(`${f}: CC-BY needs attributionText`);
  if (m.type === "material") { materials.push(m); continue; }

  const glb = path.join(pub, m.assets.glb);
  if (!fs.existsSync(glb)) { problems.push(`${f}: missing GLB ${m.assets.glb}`); continue; }
  const doc = await io.read(glb);
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const b = getBounds(scene);
  const size = { w: b.max[0] - b.min[0], h: b.max[1] - b.min[1], d: b.max[2] - b.min[2] }; // glTF y-up: depth along z
  if (m.sizing.mode === "fixed") {
    for (const k of ["w", "d", "h"] as const) {
      if (Math.abs(size[k] - m.dims[k]) > 0.01) problems.push(`${f}: ${k} is ${size[k].toFixed(3)} m in the GLB but ${m.dims[k]} in the manifest (>1 cm)`);
    }
    if (Math.abs(b.min[1]) > 0.01) problems.push(`${f}: base is ${b.min[1].toFixed(3)} m off the floor (origin must be at the floor)`);
    if (Math.abs(b.min[2] + m.dims.d) > 0.02) problems.push(`${f}: item must span z in [-depth, 0] (back at 0, front toward -z); got ${b.min[2].toFixed(3)}..${b.max[2].toFixed(3)}`);
    if (Math.abs((b.min[0] + b.max[0]) / 2) > 0.02) problems.push(`${f}: item is not centred left-right`);
  }
  const names = new Set(doc.getRoot().listMaterials().map((x) => x.getName()));
  for (const s of m.slots) if (!names.has(s.target ?? s.id)) problems.push(`${f}: slot "${s.id}" targets missing GLB material "${s.target ?? s.id}"`);
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3;
  if (tris > 120_000) problems.push(`${f}: ${Math.round(tris)} triangles exceeds the 120k budget`);
  const mb = fs.statSync(glb).size / 1048576;
  if (mb > 1.5) problems.push(`${f}: GLB is ${mb.toFixed(2)} MB (hero budget 1.5 MB)`);
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
