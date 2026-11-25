/**
 * Placement validation. Two tiers, kept apart on purpose:
 *  - errors: hard restrictions (outside the apartment, inside a wall, on top of
 *    another item, blocking a doorway, unknown or illegal asset);
 *  - advisories: ergonomic recommendations (door swing, clearances, narrow passages).
 * Plain geometry only; no physics.
 */
import type { Baseline } from "../baseline/fromTwin";
import { resolveSize, SizingError } from "../catalog/sizing";
import type { CatalogLookup, ModelManifest } from "../schema/catalog";
import type { DesignDocument } from "../schema/document";
import type { ItemNode } from "../schema/nodes";
import { distToBoundary, footprint, insidePolygon, overlapDepth, pointInPolygon, polygonDistance, segmentRect, type Poly, type Vec } from "./geom2d";

export type Issue = {
  severity: "error" | "advisory";
  code:
    | "unknown-asset" | "bad-size" | "out-of-room" | "overlap" | "wall-collision" | "blocks-opening"
    | "door-swing" | "clearance" | "narrow-passage" | "not-against-wall";
  nodeId: string;
  otherId?: string;
  message: string;
};

export type ValidationOptions = {
  /** Inward tolerance when testing room containment, metres. */
  roomTolerance?: number;
  /** Penetration below this is treated as touching, metres. */
  contactTolerance?: number;
  /** Recommended minimum passage between furniture/walls, metres (advisory). */
  passageMin?: number;
  /** An item whose back is within this distance of a wall counts as "against the wall". */
  wallSnap?: number;
};

const DEFAULTS: Required<ValidationOptions> = { roomTolerance: 0.02, contactTolerance: 0.01, passageMin: 0.6, wallSnap: 0.05 };

export type Placed = { node: ItemNode; manifest: ModelManifest; poly: Poly; z0: number; z1: number };

export function placeItem(node: ItemNode, manifest: ModelManifest): Placed {
  const { w, d, h } = resolveSize(manifest, node);
  const t = node.transform;
  const z0 = t.z + manifest.placement.elevation;
  return { node, manifest, poly: footprint(t.x, t.y, t.rot, w, d), z0, z1: z0 + h };
}

const vOverlap = (a: Placed, b: { z0: number; z1: number }, tol: number) => Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > tol;

/** Rectangle `depth` metres in front of an item's footprint (local +y). */
function frontZone(p: Placed, depth: number): Poly {
  const { x, y, rot } = p.node.transform;
  const { w, d } = resolveSize(p.manifest, p.node);
  const c = Math.cos(rot), s = Math.sin(rot);
  const local: Vec[] = [[-w / 2, d], [w / 2, d], [w / 2, d + depth], [-w / 2, d + depth]];
  return local.map(([lx, ly]) => [x + lx * c - ly * s, y + lx * s + ly * c] as Vec);
}

export function validateDocument(doc: DesignDocument, baseline: Baseline, catalog: CatalogLookup, options: ValidationOptions = {}): Issue[] {
  const o = { ...DEFAULTS, ...options };
  const issues: Issue[] = [];
  const placed: Placed[] = [];

  for (const n of Object.values(doc.nodes)) {
    if (n.kind !== "item") continue;
    const m = catalog.model(n.catalog);
    if (!m) {
      issues.push({ severity: "error", code: "unknown-asset", nodeId: n.id, message: `Unknown catalog asset "${n.catalog.id}@${n.catalog.version}".` });
      continue;
    }
    try {
      placed.push(placeItem(n, m));
    } catch (e) {
      if (e instanceof SizingError) issues.push({ severity: "error", code: "bad-size", nodeId: n.id, message: e.message });
      else throw e;
    }
  }

  const rooms = Object.values(baseline.rooms);
  const wallRects = Object.values(baseline.walls).map((w) => ({ id: w.id, poly: segmentRect(w.a, w.b, w.thickness), a: w.a, b: w.b }));
  const doors = Object.values(baseline.openings).filter((x) => x.kind === "door" || x.kind === "entry");
  const openingZones = Object.values(baseline.openings).map((op) => {
    const w = baseline.walls[op.wallId];
    return { op, w, poly: w ? openingRect(w.a, w.b, w.thickness, op.center, op.width) : [] as Poly };
  });

  for (const p of placed) {
    const pl = p.manifest.placement;
    const id = p.node.id;

    // 1. inside the apartment
    if (pl.layer !== "ceiling" && pl.on !== "ceiling") {
      const ok = rooms.some((r) => insidePolygon(p.poly, r.polygon, o.roomTolerance));
      if (!ok) issues.push({ severity: "error", code: "out-of-room", nodeId: id, message: "The item is not fully inside a room." });
    }

    // 2. against walls (furniture only; wall-mounted items are meant to touch them)
    if (pl.layer === "furniture") {
      for (const w of wallRects) {
        const depth = overlapDepth(p.poly, w.poly);
        if (depth > o.contactTolerance && p.z0 < baseline.wallHeight) {
          issues.push({ severity: "error", code: "wall-collision", nodeId: id, otherId: w.id, message: "The item intersects a wall." });
          break;
        }
      }
    }

    // 3. doorway / opening footprints must stay free for furniture
    if (pl.layer === "furniture") {
      for (const z of openingZones) {
        if (z.op.kind === "window" || z.poly.length === 0) continue;
        if (overlapDepth(p.poly, z.poly) > o.contactTolerance && p.z0 < z.op.head) {
          issues.push({ severity: "error", code: "blocks-opening", nodeId: id, otherId: z.op.id, message: "The item blocks a doorway." });
        }
      }
    }

    // 4. advisories: door swing zones (either side, conservative)
    if (pl.layer === "furniture") {
      for (const door of doors) {
        const w = baseline.walls[door.wallId];
        if (!w) continue;
        for (const zone of swingZones(w.a, w.b, w.thickness, door.center, door.width)) {
          if (overlapDepth(p.poly, zone) > o.contactTolerance) {
            issues.push({ severity: "advisory", code: "door-swing", nodeId: id, otherId: door.id, message: "The item may obstruct a door swing." });
            break;
          }
        }
      }
    }

    // 5. advisory: against-wall preference
    if (pl.againstWall && pl.layer === "furniture") {
      const back: Vec[] = [p.poly[0], p.poly[1]];
      const distTo = (pt: Vec, poly: Poly) => (pointInPolygon(pt, poly) ? 0 : distToBoundary(pt, poly));
      const near = wallRects.some((w) => back.every((pt) => distTo(pt, w.poly) <= o.wallSnap));
      if (!near) issues.push({ severity: "advisory", code: "not-against-wall", nodeId: id, message: "This item is designed to stand against a wall." });
    }

    // 6. advisory: front clearance
    if (pl.clearance.front > 0 && pl.layer === "furniture") {
      const zone = frontZone(p, pl.clearance.front);
      const wall = wallRects.find((w) => overlapDepth(zone, w.poly) > o.contactTolerance);
      const item = placed.find((q) => q !== p && q.manifest.placement.layer === "furniture" && vOverlap(p, q, 0.05) && overlapDepth(zone, q.poly) > o.contactTolerance);
      const otherId = wall?.id ?? item?.node.id;
      if (otherId) {
        issues.push({ severity: "advisory", code: "clearance", nodeId: id, otherId, message: `Less than ${pl.clearance.front} m free in front of the item.` });
      }
    }
  }

  // pairwise: overlaps (error) and narrow passages (advisory)
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i], b = placed[j];
      const la = a.manifest.placement.layer, lb = b.manifest.placement.layer;
      const solid = (l: string) => l === "furniture";
      if (!solid(la) || !solid(lb)) continue;
      if (!vOverlap(a, b, 0.02)) continue;
      const depth = overlapDepth(a.poly, b.poly);
      if (depth > o.contactTolerance) {
        issues.push({ severity: "error", code: "overlap", nodeId: a.node.id, otherId: b.node.id, message: "Two items overlap." });
      } else if (a.manifest.placement.on === "floor" && b.manifest.placement.on === "floor") {
        const dist = polygonDistance(a.poly, b.poly);
        if (dist > o.contactTolerance && dist < o.passageMin) {
          issues.push({ severity: "advisory", code: "narrow-passage", nodeId: a.node.id, otherId: b.node.id, message: `Only ${(dist * 100).toFixed(0)} cm between items; ${(o.passageMin * 100).toFixed(0)} cm is recommended for walking.` });
        }
      }
    }
  }

  return issues;
}

export const errorsOf = (issues: Issue[]) => issues.filter((i) => i.severity === "error");
export const advisoriesOf = (issues: Issue[]) => issues.filter((i) => i.severity === "advisory");

/** Rectangle covering the opening in the wall's own thickness. */
function openingRect(a: Vec, b: Vec, thickness: number, center: Vec, width: number): Poly {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
  const hw = width / 2;
  const p0: Vec = [center[0] - ux * hw, center[1] - uy * hw];
  const p1: Vec = [center[0] + ux * hw, center[1] + uy * hw];
  return segmentRect(p0, p1, thickness);
}

/** Square swing zones (side = door width) on both sides of a door. */
function swingZones(a: Vec, b: Vec, thickness: number, center: Vec, width: number): Poly[] {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
  const nx = -uy, ny = ux;
  const hw = width / 2;
  const off = thickness / 2;
  const mk = (sign: number): Poly => {
    const p = (s: number, n: number): Vec => [center[0] + ux * s + nx * n * sign, center[1] + uy * s + ny * n * sign];
    return [p(-hw, off), p(hw, off), p(hw, off + width), p(-hw, off + width)];
  };
  return [mk(1), mk(-1)];
}
