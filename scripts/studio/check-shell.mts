/**
 * Checks a built Design Studio shell GLB against the semantic baseline:
 * every "S|<surfaceId>" material must name a real baseline surface, and the
 * report lists which baseline surfaces have no swappable material yet.
 *
 *   npx tsx scripts/studio/check-shell.mts <fixture|twin.json> <glb>
 *   npx tsx scripts/studio/check-shell.mts yarkon public/walk/yarkon-twin-shell/apartment.glb
 */
import fs from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { baselineFromTwin } from "../../lib/studio/baseline/fromTwin";
import { YARKON_TWIN } from "../../lib/twin/fixtures/yarkon";
import { TLV3_TWIN } from "../../lib/twin/fixtures/tlv3";
import { PlanTwin } from "../../lib/twin/schema";

const [src, glb] = process.argv.slice(2);
if (!src || !glb) {
  console.error("usage: npx tsx scripts/studio/check-shell.mts <yarkon|tlv3|twin.json> <apartment.glb>");
  process.exit(2);
}
const twin = src === "yarkon" ? YARKON_TWIN : src === "tlv3" ? TLV3_TWIN : PlanTwin.parse(JSON.parse(fs.readFileSync(src, "utf8")));
const baseline = baselineFromTwin(twin);

await MeshoptDecoder.ready;
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder }).read(glb);
const root = doc.getRoot();
const names = root.listMaterials().map((m) => m.getName());
const surfaceMats = names.filter((n) => n.startsWith("S|")).map((n) => n.slice(2));
const unknown = surfaceMats.filter((id) => !baseline.surfaces[id]);
const missing = Object.values(baseline.surfaces).filter((s) => s.paintable && !surfaceMats.includes(s.id)).map((s) => s.id);
let tris = 0;
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute("POSITION")?.getCount() ?? 0) / 3;

console.log(JSON.stringify({
  glbMB: +(fs.statSync(glb).size / 1048576).toFixed(2),
  nodes: root.listNodes().length,
  meshes: root.listMeshes().length,
  materials: names.length,
  surfaceMaterials: surfaceMats.length,
  triangles: Math.round(tris),
  unknownSurfaceMaterials: unknown,
  paintableSurfacesWithoutMaterial: missing,
}, null, 2));
process.exit(unknown.length ? 1 : 0);
