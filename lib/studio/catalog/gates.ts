/**
 * Catalog publish gates, shared by the CLI (scripts/studio/ingest/publish.mts) and the admin catalog
 * (/admin/catalog). A failing gate blocks publishing; gates are never loosened to let an asset through.
 *
 *  - the manifest parses (strict zod); licences are limited by the schema to CC0 / CC-BY / original /
 *    approved commercial (no NC or ND), and CC-BY needs attribution text
 *  - generator-built models: real size within 1 cm at min / default / max parameters, bevelled edges,
 *    front gaps, a handle per front, every slot backed by geometry (generators/verify.ts)
 *  - GLB models: real bounding box matches the manifest within 1 cm (fixed), every module node present
 *    and sized (modular), floor origin, back at z = 0, centred, every slot target present, triangle
 *    budget (120k) and file size (1.5 MB)
 * Node only (gltf-transform), no three.js / React.
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { getBounds } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";
import { verifyGenerated } from "./generators/verify";
import { MaterialManifest, ModelManifest } from "../schema/catalog";

export type Manifest = ModelManifest | MaterialManifest;

/** Parses a raw manifest; returns the manifest or the schema problems. */
export function parseManifest(raw: unknown): { manifest: Manifest } | { issues: string[] } {
  if (!raw || typeof raw !== "object") return { issues: ["manifest must be a JSON object"] };
  const r = { ...(raw as Record<string, unknown>) };
  delete r._note; // free-form curator note, not part of the contract
  const parsed = r.type === "model" ? ModelManifest.safeParse(r) : r.type === "material" ? MaterialManifest.safeParse(r) : null;
  if (!parsed) return { issues: ['"type" must be "model" or "material"'] };
  if (!parsed.success) return { issues: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
  return { manifest: parsed.data as Manifest };
}

/** Gates that need no asset files. */
export function staticGates(m: Manifest): string[] {
  const out: string[] = [];
  if (m.license.spdx === "CC-BY-4.0" && !m.license.attributionText) out.push("CC-BY needs attributionText");
  if (m.type === "model" && !m.assets.glb) out.push(...verifyGenerated(m));
  return out;
}

let io: NodeIO | null = null;
async function gltf(): Promise<NodeIO> {
  if (io) return io;
  await MeshoptDecoder.ready;
  io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  return io;
}

/** Geometry gates on a model's GLB bytes. */
export async function glbGates(m: ModelManifest, bytes: Uint8Array): Promise<string[]> {
  const problems: string[] = [];
  let doc;
  try { doc = await (await gltf()).readBinary(bytes); } catch (e) { return [`GLB cannot be read: ${(e as Error).message}`]; }
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  if (!scene) return ["GLB has no scene"];
  const b = getBounds(scene);
  const size = { w: b.max[0] - b.min[0], h: b.max[1] - b.min[1], d: b.max[2] - b.min[2] }; // glTF y-up: depth along z
  if (m.sizing.mode === "modular") {
    for (const mod of m.sizing.modules) {
      const node = doc.getRoot().listNodes().find((n) => n.getName() === mod.node);
      if (!node) { problems.push(`module node "${mod.node}" missing in the GLB`); continue; }
      const mb = getBounds(node);
      const w = mb.max[0] - mb.min[0], d = mb.max[2] - mb.min[2];
      if (Math.abs(w - mod.width) > 0.015) problems.push(`module ${mod.id} is ${w.toFixed(3)} m wide in the GLB but ${mod.width} in the manifest`);
      if (Math.abs(d - mod.depth) > 0.015) problems.push(`module ${mod.id} is ${d.toFixed(3)} m deep in the GLB but ${mod.depth} in the manifest`);
      if (Math.abs(mb.min[1]) > 0.01) problems.push(`module ${mod.id} base is ${mb.min[1].toFixed(3)} m off the floor`);
      if (Math.abs((mb.min[0] + mb.max[0]) / 2) > 0.02) problems.push(`module ${mod.id} is not centred left-right`);
      if (Math.abs(mb.max[2]) > 0.02) problems.push(`module ${mod.id} back must be at z = 0`);
    }
  }
  if (m.sizing.mode === "fixed") {
    for (const k of ["w", "d", "h"] as const) {
      if (Math.abs(size[k] - m.dims[k]) > 0.01) problems.push(`${k} is ${size[k].toFixed(3)} m in the GLB but ${m.dims[k]} in the manifest (>1 cm)`);
    }
    if (Math.abs(b.min[1]) > 0.01) problems.push(`base is ${b.min[1].toFixed(3)} m off the floor (origin must be at the floor)`);
    if (Math.abs(b.min[2] + m.dims.d) > 0.02) problems.push(`item must span z in [-depth, 0] (back at 0, front toward -z); got ${b.min[2].toFixed(3)}..${b.max[2].toFixed(3)}`);
    if (Math.abs((b.min[0] + b.max[0]) / 2) > 0.02) problems.push("item is not centred left-right");
  }
  const names = new Set(doc.getRoot().listMaterials().map((x) => x.getName()));
  for (const s of m.slots) if (!names.has(s.target ?? s.id)) problems.push(`slot "${s.id}" targets missing GLB material "${s.target ?? s.id}"`);
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3;
  if (tris > 120_000) problems.push(`${Math.round(tris)} triangles exceeds the 120k budget`);
  const mb = bytes.byteLength / 1048576;
  if (mb > 1.5) problems.push(`GLB is ${mb.toFixed(2)} MB (hero budget 1.5 MB)`);
  return problems;
}

/** Asset paths a manifest references (relative to the static catalog, or absolute /api/... for stored ones). */
export function assetPaths(m: Manifest): string[] {
  if (m.type === "model") return [m.assets.glb, m.assets.preview, m.assets.decal, ...(m.assets.lods ?? [])].filter((x): x is string => !!x);
  return Object.values(m.pbr.maps).filter((x): x is string => !!x);
}
