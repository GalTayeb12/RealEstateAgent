/**
 * Surface items (table lamps, vases, small plants) stand ON furniture, not on the floor.
 * `surfaceTopAt` finds the top of the furniture under a point; `settleOnSurface` returns the
 * node with its z set to that height (0 = the floor when nothing is under it). Pure: used
 * by the store when adding or dragging, and by the planners.
 */
import type { CatalogLookup } from "../schema/catalog";
import type { DesignDocument } from "../schema/document";
import type { ItemNode } from "../schema/nodes";
import { placeItem } from "../validation/placement";
import { pointInPolygon } from "../validation/geom2d";

/** Furniture whose top is a sensible place to set things down. */
const HOSTS = new Set(["table", "coffee-table", "side-table", "desk", "cabinet", "tv-unit", "shelving", "kitchen-cabinet", "countertop"]);
/** Tops higher than this are not surfaces a person sets a lamp on (wardrobes, tall shelving). */
export const SURFACE_MAX_TOP = 1.3;

export function surfaceTopAt(doc: DesignDocument, catalog: CatalogLookup, x: number, y: number, excludeId?: string): number {
  let top = 0;
  for (const n of Object.values(doc.nodes)) {
    if (n.kind !== "item" || n.id === excludeId) continue;
    const m = catalog.model(n.catalog);
    if (!m || m.placement.layer !== "furniture" || !HOSTS.has(m.category)) continue;
    const p = placeItem(n, m);
    if (p.z1 > SURFACE_MAX_TOP || p.z1 <= top) continue;
    if (pointInPolygon([x, y], p.poly)) top = p.z1;
  }
  return Math.round(top * 1000) / 1000;
}

/** `node` resting on whatever is under its centre, if its manifest says it belongs on a surface. */
export function settleOnSurface(doc: DesignDocument, catalog: CatalogLookup, node: ItemNode): ItemNode {
  const m = catalog.model(node.catalog);
  if (!m || m.placement.on !== "surface") return node;
  const z = surfaceTopAt(doc, catalog, node.transform.x, node.transform.y, node.id);
  return z === node.transform.z ? node : { ...node, transform: { ...node.transform, z } };
}
