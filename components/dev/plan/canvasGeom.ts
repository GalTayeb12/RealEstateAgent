/**
 * Geometry of the wall editor's canvas: plan metres <-> the SVG pixels of lib/twin/svg, snapping
 * and hit-testing. Pure, so it is tested without a browser.
 */
import { type PlanTwin, type Pt, alongWall, wallLength } from "@/lib/twin/schema";
import { planSvgFrame } from "@/lib/twin/svg";

export type Frame = ReturnType<typeof planSvgFrame>;
/** Pixels per metre of the plan SVG (planSvg's default). */
export const PPM = 60;

/** The drawing's own frame grown by `margin` metres, so there is room to draw outside the current plan. */
export function editFrame(t: PlanTwin, margin = 1.5): Frame {
  const f = planSvgFrame(t);
  return { x0: f.x0 - margin, yTop: f.yTop + margin, w: f.w + margin * 2, h: f.h + margin * 2 };
}

/** Smallest frame holding both: the editor's frame only ever grows, so the plan does not shift under the pointer. */
export function unionFrame(a: Frame, b: Frame): Frame {
  const x0 = Math.min(a.x0, b.x0), yTop = Math.max(a.yTop, b.yTop);
  const x1 = Math.max(a.x0 + a.w, b.x0 + b.w), y1 = Math.min(a.yTop - a.h, b.yTop - b.h);
  return { x0, yTop, w: x1 - x0, h: yTop - y1 };
}

export const toPx = (f: Frame, p: Pt): Pt => [(p[0] - f.x0) * PPM, (f.yTop - p[1]) * PPM];
export const fromPx = (f: Frame, px: Pt): Pt => [px[0] / PPM + f.x0, f.yTop - px[1] / PPM];

/** Nearest point to p on a segment, with the distance from a and from p. */
export function nearestOnSegment(a: Pt, b: Pt, p: Pt): { t: number; dist: number } {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9;
  const k = Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  const q: Pt = [a[0] + dx * k, a[1] + dy * k];
  return { t: k * Math.sqrt(L2), dist: Math.hypot(p[0] - q[0], p[1] - q[1]) };
}

/** Everything a new point can stick to: wall ends, room corners, and the lines through them. */
function snapTargets(t: PlanTwin, exclude?: string) {
  const points: Pt[] = [], xs: number[] = [], ys: number[] = [];
  for (const w of t.walls) {
    if (w.id === exclude) continue;
    points.push(w.a, w.b);
    xs.push(w.a[0], w.b[0]);
    ys.push(w.a[1], w.b[1]);
  }
  for (const r of t.rooms) for (const q of r.polygon) { points.push(q); xs.push(q[0]); ys.push(q[1]); }
  return { points, xs, ys };
}

const nearest = (vals: number[], v: number, tol: number): number | null => {
  let best: number | null = null, bd = tol;
  for (const x of vals) { const d = Math.abs(x - v); if (d <= bd) { bd = d; best = x; } }
  return best;
};

export interface SnapInfo {
  pt: Pt;
  /** The corner it stuck to, if any. */
  corner: Pt | null;
  /** x / y of the line it stuck to (wall axes, room edges), for drawing a guide. */
  gx: number | null;
  gy: number | null;
}

/**
 * Sticky snapping, strongest first: a wall end or room corner within `tol`; else each coordinate
 * on its own sticks to the line of a wall or room edge within `lineTol`; else the 5 cm grid.
 * `exclude` is the wall being dragged (it must not snap to itself).
 */
export function snapInfo(t: PlanTwin, p: Pt, opts: { tol?: number; lineTol?: number; exclude?: string } = {}): SnapInfo {
  const { tol = 0.22, lineTol = 0.14, exclude } = opts;
  const { points, xs, ys } = snapTargets(t, exclude);
  let corner: Pt | null = null, bd = tol;
  for (const q of points) { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d <= bd) { bd = d; corner = q; } }
  if (corner) return { pt: corner, corner, gx: corner[0], gy: corner[1] };
  const gx = nearest(xs, p[0], lineTol), gy = nearest(ys, p[1], lineTol);
  const grid = (v: number) => Math.round(v / 0.05) * 0.05;
  return { pt: [gx ?? grid(p[0]), gy ?? grid(p[1])], corner: null, gx, gy };
}

/** Back-compatible: just the snapped point. */
export function snapPoint(t: PlanTwin, p: Pt, tol = 0.2, exclude?: string): Pt {
  return snapInfo(t, p, { tol, exclude }).pt;
}

/**
 * Where to put a wall's centre line when it is slid sideways: on the line of another wall or room
 * edge, or flush against a parallel wall (faces touching, never one wall inside another), else the grid.
 */
export function snapLineValue(t: PlanTwin, axis: "x" | "y", v: number, halfThickness: number, exclude?: string, tol = 0.14): { v: number; snapped: boolean } {
  const i = axis === "x" ? 0 : 1, j = 1 - i;
  const cands: number[] = [];
  for (const w of t.walls) {
    if (w.id === exclude) continue;
    cands.push(w.a[i], w.b[i]); // ends of crossing walls
    if (Math.abs(w.a[i] - w.b[i]) < 1e-3 && Math.abs(w.a[j] - w.b[j]) > 1e-3) {
      // a parallel wall: its axis, and the two positions where the faces touch
      const c = w.a[i], gap = w.thickness / 2 + halfThickness;
      cands.push(c, c - gap, c + gap);
    }
  }
  for (const r of t.rooms) for (const q of r.polygon) cands.push(q[i]);
  const hit = nearest(cands, v, tol);
  return hit !== null ? { v: hit, snapped: true } : { v: Math.round(v / 0.05) * 0.05, snapped: false };
}

export type Hit = { kind: "opening"; id: string; wallId: string } | { kind: "wall"; id: string; at: number };

/** What is under p (plan metres): an opening on a wall first, else the nearest wall within `tol`. */
export function hitTest(t: PlanTwin, p: Pt, tol = 0.15): Hit | null {
  let best: { id: string; at: number; d: number } | null = null;
  for (const w of t.walls) {
    const { t: at, dist } = nearestOnSegment(w.a, w.b, p);
    const reach = Math.max(w.thickness / 2, tol);
    if (dist <= reach && (!best || dist < best.d)) best = { id: w.id, at, d: dist };
  }
  if (!best) return null;
  const o = t.openings.find((x) => x.wallId === best!.id && Math.abs(x.at - best!.at) <= x.width / 2);
  return o ? { kind: "opening", id: o.id, wallId: best.id } : { kind: "wall", id: best.id, at: best.at };
}

/** Which end handle of a wall (if any) is under p. */
export function endHandleAt(t: PlanTwin, wallId: string, p: Pt, tol = 0.2): "a" | "b" | null {
  const w = t.walls.find((x) => x.id === wallId);
  if (!w || wallLength(w) === 0) return null;
  const da = Math.hypot(w.a[0] - p[0], w.a[1] - p[1]), db = Math.hypot(w.b[0] - p[0], w.b[1] - p[1]);
  if (Math.min(da, db) > tol) return null;
  return da <= db ? "a" : "b";
}

export const openingCentre = (t: PlanTwin, openingId: string): Pt | null => {
  const o = t.openings.find((x) => x.id === openingId), w = o && t.walls.find((x) => x.id === o.wallId);
  return o && w ? alongWall(w, o.at) : null;
};
