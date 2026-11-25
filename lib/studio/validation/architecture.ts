/**
 * Validation of architectural PROPOSALS (new partitions, new openings). These are
 * conceptual, never construction-approved, and never written into the baseline:
 * they live in the design document, are always labelled unverified, and may not
 * touch protected structure (exterior walls, glazing) or collide with furniture.
 *
 * Partitions are expected to end on wall faces (the UI and `snapToWallFace` snap
 * them there); a partition that runs into the thickness of a wall is refused.
 */
import type { Baseline } from "../baseline/fromTwin";
import { resolveSize } from "../catalog/sizing";
import type { CatalogLookup } from "../schema/catalog";
import type { DesignDocument } from "../schema/document";
import type { OpeningProposalNode, PartitionProposalNode } from "../schema/nodes";
import { footprint, insidePolygon, overlapDepth, polygonDistance, segmentRect, type Poly, type Vec } from "./geom2d";
import type { Issue } from "./placement";

export const PARTITION_MIN_LENGTH = 0.4;
export const OPENING_MIN = 0.6;
export const OPENING_MAX = 3.0;
export const OPENING_EDGE = 0.1; // keep this far from the ends of a wall
export const OPENING_GAP = 0.2; // and from neighbouring openings
const TOUCH = 0.03;

const len = (a: Vec, b: Vec) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Footprint rectangle of a partition proposal. */
export const partitionRect = (n: Pick<PartitionProposalNode, "a" | "b" | "thickness">): Poly => segmentRect(n.a, n.b, n.thickness);

/** Rectangle of a proposed opening in its wall (the wall's own thickness, plus a little so furniture tests bite). */
export function openingProposalRect(baseline: Baseline, n: Pick<OpeningProposalNode, "wallId" | "at" | "width">): Poly | null {
  const w = baseline.walls[n.wallId];
  if (!w) return null;
  const L = len(w.a, w.b) || 1;
  const ux = (w.b[0] - w.a[0]) / L, uy = (w.b[1] - w.a[1]) / L;
  const p0: Vec = [w.a[0] + ux * (n.at - n.width / 2), w.a[1] + uy * (n.at - n.width / 2)];
  const p1: Vec = [w.a[0] + ux * (n.at + n.width / 2), w.a[1] + uy * (n.at + n.width / 2)];
  return segmentRect(p0, p1, w.thickness);
}

/** Centre point of a proposed opening in plan. */
export function openingProposalCenter(baseline: Baseline, n: Pick<OpeningProposalNode, "wallId" | "at">): Vec | null {
  const w = baseline.walls[n.wallId];
  if (!w) return null;
  const L = len(w.a, w.b) || 1;
  return [w.a[0] + ((w.b[0] - w.a[0]) / L) * n.at, w.a[1] + ((w.b[1] - w.a[1]) / L) * n.at];
}

const unverified = (nodeId: string): Issue => ({
  severity: "advisory", code: "unverified", nodeId, message: "Concept only: not verified by an engineer and not approved for construction.",
});

/**
 * Validates every proposal in the document. Item footprints are read through the
 * catalog so a partition cannot be drawn through furniture, and a proposed doorway
 * cannot be placed behind a wardrobe.
 */
export function validateProposals(doc: DesignDocument, baseline: Baseline, catalog: CatalogLookup): Issue[] {
  const issues: Issue[] = [];
  const nodes = Object.values(doc.nodes);
  const rooms = Object.values(baseline.rooms);
  const wallRects = Object.values(baseline.walls).map((w) => ({ w, poly: segmentRect(w.a, w.b, w.thickness) }));
  const items: { id: string; poly: Poly; z0: number }[] = [];
  for (const n of nodes) {
    if (n.kind !== "item") continue;
    const m = catalog.model(n.catalog);
    if (!m || m.placement.layer !== "furniture") continue;
    try {
      const { w, d } = resolveSize(m, n);
      items.push({ id: n.id, poly: footprint(n.transform.x, n.transform.y, n.transform.rot, w, d), z0: n.transform.z + m.placement.elevation });
    } catch { /* invalid items are reported by the placement validator */ }
  }
  const partitions = nodes.filter((n): n is PartitionProposalNode => n.kind === "partitionProposal");
  const openings = nodes.filter((n): n is OpeningProposalNode => n.kind === "openingProposal");

  for (const p of partitions) {
    const rect = partitionRect(p);
    const h = p.height ?? baseline.wallHeight;
    if (len(p.a, p.b) < PARTITION_MIN_LENGTH) issues.push({ severity: "error", code: "partition-length", nodeId: p.id, message: `A partition must be at least ${PARTITION_MIN_LENGTH * 100} cm long.` });
    if (!rooms.some((r) => insidePolygon(rect, r.polygon, TOUCH))) issues.push({ severity: "error", code: "out-of-room", nodeId: p.id, message: "The partition has to stay inside a room." });
    for (const { w, poly } of wallRects) {
      if (overlapDepth(rect, poly) > TOUCH) {
        issues.push({ severity: "error", code: w.structural === "protected" ? "protected-wall" : "hits-wall", nodeId: p.id, otherId: w.id, message: w.structural === "protected" ? "It runs into a protected structural wall." : "It runs into an existing wall; end it on the wall face." });
        break;
      }
    }
    for (const it of items) {
      if (it.z0 < h && overlapDepth(rect, it.poly) > 0.01) { issues.push({ severity: "error", code: "hits-item", nodeId: p.id, otherId: it.id, message: "A piece of furniture is in the way." }); break; }
    }
    for (const op of Object.values(baseline.openings)) {
      const w = baseline.walls[op.wallId];
      if (!w || op.kind === "window") continue;
      const L = len(w.a, w.b) || 1;
      const c0: Vec = [op.center[0] - ((w.b[0] - w.a[0]) / L) * (op.width / 2), op.center[1] - ((w.b[1] - w.a[1]) / L) * (op.width / 2)];
      const c1: Vec = [op.center[0] + ((w.b[0] - w.a[0]) / L) * (op.width / 2), op.center[1] + ((w.b[1] - w.a[1]) / L) * (op.width / 2)];
      if (overlapDepth(rect, segmentRect(c0, c1, w.thickness + 0.1)) > 0.01) { issues.push({ severity: "error", code: "blocks-opening", nodeId: p.id, otherId: op.id, message: "It would block a doorway." }); break; }
    }
    for (const q of partitions) {
      if (q.id >= p.id) continue;
      if (overlapDepth(rect, partitionRect(q)) > TOUCH) issues.push({ severity: "error", code: "overlap", nodeId: p.id, otherId: q.id, message: "It overlaps another proposed partition." });
    }
    // narrow passages left beside the new partition (advisory)
    for (const { w, poly } of wallRects) {
      const d = polygonDistance(rect, poly);
      if (d > TOUCH && d < 0.6) { issues.push({ severity: "advisory", code: "narrow-passage", nodeId: p.id, otherId: w.id, message: `Only ${(d * 100).toFixed(0)} cm between the partition and a wall.` }); break; }
    }
    issues.push(unverified(p.id));
  }

  for (const o of openings) {
    const w = baseline.walls[o.wallId];
    if (!w) { issues.push({ severity: "error", code: "no-wall", nodeId: o.id, message: "That wall does not exist." }); continue; }
    if (w.structural === "protected") issues.push({ severity: "error", code: "protected-wall", nodeId: o.id, otherId: w.id, message: "Openings cannot be proposed in protected structural walls." });
    if (o.width < OPENING_MIN || o.width > OPENING_MAX) issues.push({ severity: "error", code: "opening-width", nodeId: o.id, message: `An opening must be ${OPENING_MIN * 100}-${OPENING_MAX * 100} cm wide.` });
    const L = len(w.a, w.b);
    if (o.at - o.width / 2 < OPENING_EDGE - 1e-9 || o.at + o.width / 2 > L - OPENING_EDGE + 1e-9) issues.push({ severity: "error", code: "outside-wall", nodeId: o.id, otherId: w.id, message: "The opening does not fit inside the wall." });
    const span = [o.at - o.width / 2, o.at + o.width / 2];
    for (const op of Object.values(baseline.openings)) {
      if (op.wallId !== w.id) continue;
      const c = ((op.center[0] - w.a[0]) * (w.b[0] - w.a[0]) + (op.center[1] - w.a[1]) * (w.b[1] - w.a[1])) / (L || 1);
      if (Math.min(span[1], c + op.width / 2) - Math.max(span[0], c - op.width / 2) > -OPENING_GAP + 1e-9) { issues.push({ severity: "error", code: "overlap", nodeId: o.id, otherId: op.id, message: "It is too close to an existing opening." }); break; }
    }
    for (const q of openings) {
      if (q.id >= o.id || q.wallId !== o.wallId) continue;
      if (Math.min(span[1], q.at + q.width / 2) - Math.max(span[0], q.at - q.width / 2) > -OPENING_GAP + 1e-9) issues.push({ severity: "error", code: "overlap", nodeId: o.id, otherId: q.id, message: "It is too close to another proposed opening." });
    }
    const rect = openingProposalRect(baseline, o);
    if (rect) for (const it of items) if (overlapDepth(rect, it.poly) > 0.01) { issues.push({ severity: "error", code: "blocks-opening", nodeId: o.id, otherId: it.id, message: "A piece of furniture stands in the way." }); break; }
    if (w.structural !== "protected") issues.push({ severity: "advisory", code: "structural-check", nodeId: o.id, otherId: w.id, message: "The structural role of this wall is unknown: have an engineer confirm it before relying on this." });
    issues.push(unverified(o.id));
  }
  return issues;
}

/**
 * Snaps a plan point to the nearest wall face (within `within` metres) so a drawn
 * partition ends exactly on the wall. Returns the point unchanged when no wall is close.
 */
export function snapToWallFace(baseline: Baseline, p: Vec, within = 0.2): { point: Vec; snapped: boolean } {
  let best: { point: Vec; d: number } | null = null;
  for (const w of Object.values(baseline.walls)) {
    const L = len(w.a, w.b) || 1;
    const ux = (w.b[0] - w.a[0]) / L, uy = (w.b[1] - w.a[1]) / L;
    const t = Math.max(0, Math.min(L, (p[0] - w.a[0]) * ux + (p[1] - w.a[1]) * uy));
    const cx = w.a[0] + ux * t, cy = w.a[1] + uy * t;
    // signed distance to the centre line: which face is nearer
    const nx = -uy, ny = ux;
    const s = (p[0] - cx) * nx + (p[1] - cy) * ny;
    const face = Math.sign(s || 1) * (w.thickness / 2);
    const fx = cx + nx * face, fy = cy + ny * face;
    const d = Math.hypot(p[0] - fx, p[1] - fy);
    if (d <= within && (!best || d < best.d)) best = { point: [fx, fy], d };
  }
  return best ? { point: best.point, snapped: true } : { point: p, snapped: false };
}

/** The wall nearest to a plan point and where along it the point projects, or null when none is within `within`. */
export function nearestWall(baseline: Baseline, p: Vec, within = 0.5): { wallId: string; at: number; distance: number } | null {
  let best: { wallId: string; at: number; distance: number } | null = null;
  for (const w of Object.values(baseline.walls)) {
    const L = len(w.a, w.b) || 1;
    const t = ((p[0] - w.a[0]) * (w.b[0] - w.a[0]) + (p[1] - w.a[1]) * (w.b[1] - w.a[1])) / L;
    const tc = Math.max(0, Math.min(L, t));
    const d = Math.hypot(p[0] - (w.a[0] + ((w.b[0] - w.a[0]) / L) * tc), p[1] - (w.a[1] + ((w.b[1] - w.a[1]) / L) * tc));
    if (d <= within && (!best || d < best.distance)) best = { wallId: w.id, at: tc, distance: d };
  }
  return best;
}
