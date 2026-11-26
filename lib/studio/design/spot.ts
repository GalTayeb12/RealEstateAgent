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
import { roomEdges } from "../plan/measure";
import { nearestWall } from "../validation/architecture";

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

/**
 * Spot for a piece that belongs against a wall (sideboards, beds, wardrobes...): walks the
 * room's edges, turns the piece so its back faces the wall and its front the room, and
 * slides it out from the wall line until it stands clear of the wall thickness. Returns
 * the first position (nearest the middle of the longest free walls) that validates with
 * no errors and no "not against a wall" advisory, or null.
 */
export function findWallSpot(opts: {
  doc: DesignDocument; baseline: Baseline; catalog: CatalogLookup; manifest: ModelManifest; roomId: string;
}): { x: number; y: number; rot: number } | null {
  const { doc, baseline, catalog, manifest, roomId } = opts;
  const room = baseline.rooms[roomId];
  if (!room) return null;
  const edges = roomEdges(room).sort((a, b) => b.length - a.length);
  for (const e of edges) {
    // never against glass: a window wall or the facade is not a wall for furniture
    const mid = nearestWall(baseline, e.mid, 0.3);
    const kind = mid ? baseline.walls[mid.wallId]?.kind : undefined;
    if (kind === "glazing" || kind === "railing") continue;
    const ux = (e.b[0] - e.a[0]) / (e.length || 1), uy = (e.b[1] - e.a[1]) / (e.length || 1);
    const rot = Math.atan2(-e.inward[0], e.inward[1]); // local +y (front) = into the room
    // positions along the edge, from the middle outwards
    const ts: number[] = [];
    for (let k = 0; k <= Math.floor(e.length / 0.25); k++) ts.push(e.length / 2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.25);
    for (const t of ts) {
      if (t < 0 || t > e.length) continue;
      for (const off of [0, 0.03, 0.06, 0.09, 0.13, 0.17]) {
        const x = Math.round((e.a[0] + ux * t + e.inward[0] * off) * 100) / 100, y = Math.round((e.a[1] + uy * t + e.inward[1] * off) * 100) / 100;
        const trial = makeItem(manifest, x, y, rot, "__trial__");
        const p = previewNode(doc, trial, baseline, catalog);
        if (p.ok && !p.advisories.some((a) => a.code === "not-against-wall" || a.code === "door-swing")) return { x, y, rot };
        if (p.errors.some((er) => er.code !== "wall-collision")) break; // further out will not fix overlaps or doorways here
      }
    }
  }
  return null;
}
