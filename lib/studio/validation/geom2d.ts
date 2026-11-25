/**
 * Small 2D geometry kit for placement validation. Plan metres, x east / y north.
 * Polygons are arrays of points without a repeated last point; all functions
 * are pure and engine independent.
 */
export type Vec = [number, number];
export type Poly = Vec[];

export const EPS = 1e-9;

/** Footprint of a box whose origin is the back-centre: local x in [-w/2, w/2], local y in [0, d]. Front = local +y. */
export function footprint(x: number, y: number, rot: number, w: number, d: number): Poly {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const local: Vec[] = [[-w / 2, 0], [w / 2, 0], [w / 2, d], [-w / 2, d]];
  return local.map(([lx, ly]) => [x + lx * c - ly * s, y + lx * s + ly * c] as Vec);
}

/** Oriented rectangle around a segment (wall centre line) with the given thickness. */
export function segmentRect(a: Vec, b: Vec, thickness: number): Poly {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 1;
  const nx = (-dy / L) * (thickness / 2);
  const ny = (dx / L) * (thickness / 2);
  return [
    [a[0] + nx, a[1] + ny],
    [b[0] + nx, b[1] + ny],
    [b[0] - nx, b[1] - ny],
    [a[0] - nx, a[1] - ny],
  ];
}

export function polygonArea(p: Poly): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

export function pointInPolygon([x, y]: Vec, p: Poly): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i];
    const [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function distPointSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 < EPS ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function orient(a: Vec, b: Vec, c: Vec): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function segmentsCross(a: Vec, b: Vec, c: Vec, d: Vec): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

export function distSegmentSegment(a: Vec, b: Vec, c: Vec, d: Vec): number {
  if (segmentsCross(a, b, c, d)) return 0;
  return Math.min(distPointSegment(a, c, d), distPointSegment(b, c, d), distPointSegment(c, a, b), distPointSegment(d, a, b));
}

/** Distance from a point to the boundary of a polygon. */
export function distToBoundary(p: Vec, poly: Poly): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, distPointSegment(p, poly[i], poly[(i + 1) % poly.length]));
  return best;
}

/** Axes (edge normals) of a convex polygon. */
function axes(p: Poly): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    const ex = x2 - x1;
    const ey = y2 - y1;
    const L = Math.hypot(ex, ey) || 1;
    out.push([-ey / L, ex / L]);
  }
  return out;
}

function project(p: Poly, ax: Vec): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const [x, y] of p) {
    const v = x * ax[0] + y * ax[1];
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return [lo, hi];
}

/**
 * Penetration depth between two convex polygons (SAT): 0 when they are apart
 * or merely touching, otherwise the smallest translation that separates them.
 */
export function overlapDepth(a: Poly, b: Poly): number {
  let depth = Infinity;
  for (const ax of [...axes(a), ...axes(b)]) {
    const [a0, a1] = project(a, ax);
    const [b0, b1] = project(b, ax);
    const o = Math.min(a1, b1) - Math.max(a0, b0);
    if (o <= EPS) return 0;
    depth = Math.min(depth, o);
  }
  return depth === Infinity ? 0 : depth;
}

/** Minimum distance between two convex polygons (0 if they overlap or touch). */
export function polygonDistance(a: Poly, b: Poly): number {
  if (overlapDepth(a, b) > 0) return 0;
  let best = Infinity;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      best = Math.min(best, distSegmentSegment(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length]));
    }
  }
  return best;
}

/**
 * True when every corner and edge midpoint of `inner` lies inside `outer`, or
 * within `tol` metres of its boundary (so furniture pushed against a wall passes).
 */
export function insidePolygon(inner: Poly, outer: Poly, tol = 0.02): boolean {
  const pts: Vec[] = [];
  for (let i = 0; i < inner.length; i++) {
    const a = inner[i];
    const b = inner[(i + 1) % inner.length];
    pts.push(a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  }
  return pts.every((p) => pointInPolygon(p, outer) || distToBoundary(p, outer) <= tol);
}

export function bboxOf(p: Poly): [number, number, number, number] {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const [x, y] of p) {
    x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y);
  }
  return [x1, y1, x2, y2];
}
