/**
 * Measurements for the floor planner: edge lengths, areas, door swings and the
 * free distance around a piece. All values come from the baseline geometry (never
 * from pixels) and are rounded to the centimetre, so what is drawn is what is true.
 */
import type { Baseline, BaselineRoom } from "../baseline/fromTwin";
import { roomAtPoint } from "../baseline/fromTwin";
import { bboxOf, polygonArea, pointInPolygon, type Poly, type Vec } from "../validation/geom2d";

export const cm = (m: number) => Math.round(m * 100) / 100;
export const m2 = (a: number) => Math.round(a * 10) / 10;

export type Edge = { a: Vec; b: Vec; length: number; mid: Vec; /** unit normal pointing into the room */ inward: Vec };

export function roomEdges(room: Pick<BaselineRoom, "polygon">): Edge[] {
  const p = room.polygon as Poly;
  const ccw = signedArea(p) > 0;
  return p.map((a, i) => {
    const b = p[(i + 1) % p.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const left: Vec = [-dy / len, dx / len]; // left of a->b; inside for counter-clockwise polygons
    return { a, b, length: cm(len), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], inward: ccw ? left : [-left[0], -left[1]] };
  });
}

function signedArea(p: Poly): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; s += x1 * y2 - x2 * y1; }
  return s / 2;
}

export function centroid(p: Poly): Vec {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
    const f = x1 * y2 - x2 * y1;
    a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  if (Math.abs(a) < 1e-9) { const b = bboxOf(p); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }
  return [cx / (3 * a), cy / (3 * a)];
}

/** Label anchor: the centroid when it lies inside the room, otherwise the centre of the bounding box's inner region. */
export function labelPoint(p: Poly): Vec {
  const c = centroid(p);
  if (pointInPolygon(c, p)) return c;
  const b = bboxOf(p);
  const mid: Vec = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  if (pointInPolygon(mid, p)) return mid;
  for (const [fx, fy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
    const q: Vec = [b[0] + (b[2] - b[0]) * fx, b[1] + (b[3] - b[1]) * fy];
    if (pointInPolygon(q, p)) return q;
  }
  return c;
}

export type RoomLabel = { id: string; name: { he: string; en: string }; area: number; at: Vec; type: BaselineRoom["type"] };

export function roomLabels(baseline: Baseline): RoomLabel[] {
  return Object.values(baseline.rooms).map((r) => ({ id: r.id, name: r.name, area: m2(polygonArea(r.polygon as Poly)), at: labelPoint(r.polygon as Poly), type: r.type }));
}

/** Total internal floor area of the habitable rooms (balconies excluded), m2. */
export function totalArea(baseline: Baseline): { interior: number; balcony: number } {
  let interior = 0, balcony = 0;
  for (const r of Object.values(baseline.rooms)) {
    if (r.type === "balcony") balcony += r.area;
    else interior += r.area;
  }
  return { interior: m2(interior), balcony: m2(balcony) };
}

export type DoorSwing = { id: string; kind: "door" | "entry"; hinge: Vec; closed: Vec; open: Vec; radius: number; arc: Vec[] };

/** Quarter-circle swing of every door: hinged at the first end of the opening, swinging into the room side. */
export function doorSwings(baseline: Baseline, steps = 14): DoorSwing[] {
  const out: DoorSwing[] = [];
  for (const o of Object.values(baseline.openings)) {
    if (o.kind !== "door" && o.kind !== "entry") continue;
    const w = baseline.walls[o.wallId];
    if (!w) continue;
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1;
    const u: Vec = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L];
    const n: Vec = [-u[1], u[0]];
    const hinge: Vec = [o.center[0] - u[0] * o.width / 2, o.center[1] - u[1] * o.width / 2];
    const closed: Vec = [o.center[0] + u[0] * o.width / 2, o.center[1] + u[1] * o.width / 2];
    // swing into the interior side; for an entry door that is the apartment side (the side that has a room)
    const probe = (s: number): Vec => [o.center[0] + n[0] * s * (w.thickness / 2 + 0.4), o.center[1] + n[1] * s * (w.thickness / 2 + 0.4)];
    const roomA = roomAtPoint(baseline, probe(1)), roomB = roomAtPoint(baseline, probe(-1));
    const pick = (r?: BaselineRoom) => !!r && r.type !== "balcony" && r.type !== "corridor" && r.type !== "entry";
    const side = pick(roomA) && !pick(roomB) ? 1 : pick(roomB) && !pick(roomA) ? -1 : roomA && !roomB ? 1 : roomB && !roomA ? -1 : 1;
    const open: Vec = [hinge[0] + n[0] * side * o.width, hinge[1] + n[1] * side * o.width];
    const arc: Vec[] = [];
    const a0 = Math.atan2(closed[1] - hinge[1], closed[0] - hinge[0]);
    const a1 = Math.atan2(open[1] - hinge[1], open[0] - hinge[0]);
    let d = a1 - a0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    for (let i = 0; i <= steps; i++) { const a = a0 + (d * i) / steps; arc.push([hinge[0] + Math.cos(a) * o.width, hinge[1] + Math.sin(a) * o.width]); }
    out.push({ id: o.id, kind: o.kind, hinge, closed, open, radius: o.width, arc });
  }
  return out;
}

/** Distance from `origin` along unit `dir` to the first crossing of the polygon boundary, or null. */
export function rayDistance(origin: Vec, dir: Vec, poly: Poly): number | null {
  let best: number | null = null;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const den = dir[0] * ey - dir[1] * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((a[0] - origin[0]) * ey - (a[1] - origin[1]) * ex) / den;
    const s = ((a[0] - origin[0]) * dir[1] - (a[1] - origin[1]) * dir[0]) / den;
    if (t >= -1e-9 && s >= -1e-9 && s <= 1 + 1e-9 && (best === null || t < best)) best = t;
  }
  return best;
}

export type Clearances = { west: number | null; east: number | null; south: number | null; north: number | null; room: string | null };

/** Free distance from a footprint's bounding box to the room boundary in the four compass directions (centimetre precision). */
export function footprintClearances(baseline: Baseline, footprint: Poly): Clearances {
  const b = bboxOf(footprint);
  const centre: Vec = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  const room = roomAtPoint(baseline, centre);
  if (!room) return { west: null, east: null, south: null, north: null, room: null };
  const poly = room.polygon as Poly;
  const d = (o: Vec, dir: Vec) => { const v = rayDistance(o, dir, poly); return v === null ? null : cm(Math.max(0, v)); };
  return {
    west: d([b[0], centre[1]], [-1, 0]), east: d([b[2], centre[1]], [1, 0]),
    south: d([centre[0], b[1]], [0, -1]), north: d([centre[0], b[3]], [0, 1]), room: room.id,
  };
}
