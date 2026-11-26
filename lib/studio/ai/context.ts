/**
 * What the designer model is told about the apartment and the catalog: a compact, deterministic
 * JSON (stable key order, rounded numbers, so it caches well). Catalog retrieval ranks the published
 * models by the requested room kind and style; only published ids can be named, and the compiler
 * rejects anything else anyway.
 */
import type { Baseline } from "../baseline/fromTwin";
import { roomAtPoint } from "../baseline/fromTwin";
import { resolveSize } from "../catalog/sizing";
import type { CatalogLookup, MaterialManifest, ModelManifest, Style } from "../schema/catalog";
import type { DesignDocument } from "../schema/document";

const r2 = (v: number) => Math.round(v * 100) / 100;

export type Retrieval = { roomKinds?: string[]; styles?: Style[]; maxWidth?: number; limit?: number };

/** Published models ranked for a request: room-kind match first, then style overlap, then fit. */
export function retrieveModels(models: ModelManifest[], q: Retrieval = {}): ModelManifest[] {
  const newest = new Map<string, ModelManifest>();
  for (const m of models) if (!newest.has(m.id) || newest.get(m.id)!.version < m.version) newest.set(m.id, m);
  const score = (m: ModelManifest) =>
    (q.roomKinds?.some((k) => m.rooms.includes(k as never)) ? 4 : 0)
    + (q.styles ? m.styles.filter((s) => q.styles!.includes(s)).length : 0)
    - (q.maxWidth !== undefined && m.dims.w > q.maxWidth ? 10 : 0);
  return [...newest.values()].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id)).slice(0, q.limit ?? 60);
}

function sizingSummary(m: ModelManifest) {
  const s = m.sizing;
  switch (s.mode) {
    case "fixed": return { mode: "fixed" };
    case "variants": return { mode: "variants", variants: s.variants.map((v) => ({ id: v.id, w: v.dims.w, d: v.dims.d })) };
    case "modular": return { mode: "modular", modules: s.modules.map((x) => ({ id: x.id, kind: x.kind, width: x.width })), defaultConfig: s.defaultConfig };
    case "parametric": return { mode: "parametric", params: s.params.map((p) => ({ id: p.id, min: p.min, max: p.max, step: p.step, default: p.default })) };
  }
}

/** The JSON context given to the model with each request. */
export function designContext(a: {
  baseline: Baseline; doc: DesignDocument; catalog: CatalogLookup; models: ModelManifest[]; materials: MaterialManifest[]; retrieval?: Retrieval;
}) {
  const { baseline, doc, catalog } = a;
  const rooms = Object.values(baseline.rooms).map((r) => {
    const xs = r.polygon.map((p) => p[0]), ys = r.polygon.map((p) => p[1]);
    return { id: r.id, type: r.type, name: r.name.en, area: r2(r.area), bbox: [r2(Math.min(...xs)), r2(Math.min(...ys)), r2(Math.max(...xs)), r2(Math.max(...ys))] };
  });
  const items = Object.values(doc.nodes).filter((n) => n.kind === "item").map((n) => {
    const m = catalog.model(n.catalog);
    const d = m ? resolveSize(m, n) : null;
    return {
      id: n.id, catalogId: n.catalog.id, room: roomAtPoint(baseline, [n.transform.x, n.transform.y])?.id ?? null,
      x: r2(n.transform.x), y: r2(n.transform.y), rotationDeg: Math.round((n.transform.rot * 180) / Math.PI),
      ...(d ? { w: r2(d.w), d: r2(d.d) } : {}),
    };
  });
  const models = retrieveModels(a.models, a.retrieval).map((m) => ({
    id: m.id, name: m.name.en, category: m.category, rooms: m.rooms, styles: m.styles,
    dims: { w: r2(m.dims.w), d: r2(m.dims.d), h: r2(m.dims.h) }, againstWall: m.placement.againstWall,
    sizing: sizingSummary(m), slots: m.slots.map((s) => ({ id: s.id, allowed: s.allowed })),
  }));
  const materials = a.materials.map((m) => ({ id: m.id, name: m.name.en, category: m.category, styles: m.styles }));
  const surfaceStyle = Object.entries(doc.overrides).map(([surface, o]) => ({ surface, material: o.material.id }));
  return { units: "metres, plan coordinates; rotations in degrees", rooms, items, surfaceStyle, models, materials };
}
