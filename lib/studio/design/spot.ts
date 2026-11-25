/**
 * Finds a legal place for a new item near a point (the spot in front of the
 * camera). Spirals outwards on a 25 cm grid; the first candidate with no hard
 * error wins. Returns null when nothing fits within `radius` metres.
 */
import type { Baseline } from "../baseline/fromTwin";
import type { CatalogLookup, ModelManifest } from "../schema/catalog";
import type { DesignDocument } from "../schema/document";
import type { ItemNode } from "../schema/nodes";
import { newNodeId } from "../schema/ids";
import { roomAtPoint } from "../baseline/fromTwin";
import { previewNode } from "./preview";
import { snapTo } from "./snap";

/** A new item node for `manifest` at (x, y): default variant / module configuration, default slot materials, no scale. */
export function makeItem(manifest: ModelManifest, x: number, y: number, rot = 0, id = newNodeId()): ItemNode {
  const s = manifest.sizing;
  return {
    id, kind: "item", locked: false,
    catalog: { id: manifest.id, version: manifest.version },
    transform: { x, y, z: manifest.placement.on === "wall" ? manifest.placement.elevation : 0, rot },
    slots: {},
    ...(s.mode === "modular" ? { modules: s.defaultConfig ?? [] } : {}),
    ...(s.mode === "variants" ? { variantId: s.defaultVariant ?? s.variants[0].id } : {}),
  };
}

export function findFreeSpot(opts: {
  doc: DesignDocument; baseline: Baseline; catalog: CatalogLookup; manifest: ModelManifest;
  near: [number, number]; rot?: number; radius?: number;
}): { x: number; y: number } | null {
  const { doc, baseline, catalog, manifest, near, rot = 0, radius = 3.5 } = opts;
  const step = 0.25;
  const candidates: [number, number][] = [];
  const n = Math.ceil(radius / step);
  for (let ix = -n; ix <= n; ix++) for (let iy = -n; iy <= n; iy++) candidates.push([ix * step, iy * step]);
  candidates.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
  for (const [dx, dy] of candidates) {
    if (Math.hypot(dx, dy) > radius) break;
    const x = snapTo(near[0] + dx), y = snapTo(near[1] + dy);
    if (!roomAtPoint(baseline, [x, y])) continue;
    const trial = makeItem(manifest, x, y, rot, "__trial__");
    if (previewNode(doc, trial, baseline, catalog).ok) return { x, y };
  }
  return null;
}
