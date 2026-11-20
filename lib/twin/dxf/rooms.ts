/**
 * Rooms from walls.
 *
 * Real plans rarely carry a closed polyline per room; they carry walls and
 * text labels. This finds the enclosed spaces instead: the walls are painted
 * on a fine grid, the outside is flood-filled from the border, and every
 * separate patch of free cells left inside is one room, traced back into a
 * polygon.
 *
 * A wall run covers its whole length, openings included, so a doorway or an
 * open passage still separates two rooms (the openings themselves are what
 * connect them). That is what a room-by-room model needs: the kitchen of an
 * open-plan flat stays a kitchen, named by its own label.
 */
import type { Pt, Wall } from "../schema";

export interface RoomDetectOptions {
  /** Grid cell, metres. */
  cell?: number;
  /** Smallest space kept, m² (shafts, wall pockets and gaps between walls are not rooms). */
  minArea?: number;
  /** Largest space kept, m² (a hit larger than this is the outside leaking in). */
  maxArea?: number;
}

const polyArea = (p: Pt[]) => {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; }
  return a / 2;
};

/** Douglas–Peucker on an open polyline. */
function dp(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-9;
  let worst = -1, wi = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((pts[i][0] - a[0]) * dy - (pts[i][1] - a[1]) * dx) / L;
    if (d > worst) { worst = d; wi = i; }
  }
  if (worst <= tol) return [a, b];
  return [...dp(pts.slice(0, wi + 1), tol).slice(0, -1), ...dp(pts.slice(wi), tol)];
}

/** Simplify a closed ring: drop collinear points, smooth grid staircases. */
function simplifyRing(ring: Pt[], tol: number): Pt[] {
  let far = 0, fi = 0;
  for (let i = 1; i < ring.length; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > far) { far = d; fi = i; }
  }
  const first = dp(ring.slice(0, fi + 1), tol);
  const second = dp([...ring.slice(fi), ring[0]], tol);
  const out = [...first.slice(0, -1), ...second.slice(0, -1)];
  // drop exactly collinear leftovers
  return out.filter((p, i) => {
    const o = out[(i + out.length - 1) % out.length], n = out[(i + 1) % out.length];
    return Math.abs((p[0] - o[0]) * (n[1] - p[1]) - (p[1] - o[1]) * (n[0] - p[0])) > 1e-6;
  });
}

export function detectRooms(walls: Wall[], opts: RoomDetectOptions = {}): Pt[][] {
  const cell = opts.cell ?? 0.05;
  const minArea = opts.minArea ?? 1.2;
  const maxArea = opts.maxArea ?? 160;
  if (!walls.length) return [];

  const xs = walls.flatMap((w) => [w.a[0], w.b[0]]), ys = walls.flatMap((w) => [w.a[1], w.b[1]]);
  const pad = 1.0 + Math.max(...walls.map((w) => w.thickness));
  const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
  const W = Math.ceil((Math.max(...xs) + pad - x0) / cell), H = Math.ceil((Math.max(...ys) + pad - y0) / cell);
  if (W * H > 6_000_000) return []; // a whole building: crop to one apartment first
  const occ = new Uint8Array(W * H);

  /** Paint every cell centre within t/2 of the segment a–b (a hair wider, so corners close). */
  const paint = (a: Pt, b: Pt, t: number) => {
    const r = Math.max(t, cell * 2) / 2 + cell * 0.35;
    const i1 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - r - x0) / cell)), i2 = Math.min(W - 1, Math.ceil((Math.max(a[0], b[0]) + r - x0) / cell));
    const j1 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - r - y0) / cell)), j2 = Math.min(H - 1, Math.ceil((Math.max(a[1], b[1]) + r - y0) / cell));
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-12;
    for (let j = j1; j <= j2; j++) {
      const py = y0 + (j + 0.5) * cell;
      for (let i = i1; i <= i2; i++) {
        const px = x0 + (i + 0.5) * cell;
        const u = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / L2));
        if (Math.hypot(px - (a[0] + u * dx), py - (a[1] + u * dy)) <= r) occ[j * W + i] = 1;
      }
    }
  };

  for (const w of walls) paint(w.a, w.b, w.thickness);

  // outside: flood from the padded border
  const label = new Int32Array(W * H);
  const stack: number[] = [];
  const flood = (start: number, id: number): number => {
    let n = 0;
    stack.push(start); label[start] = id;
    while (stack.length) {
      const c = stack.pop()!;
      n++;
      const i = c % W, j = (c - i) / W;
      if (i > 0 && !occ[c - 1] && !label[c - 1]) { label[c - 1] = id; stack.push(c - 1); }
      if (i < W - 1 && !occ[c + 1] && !label[c + 1]) { label[c + 1] = id; stack.push(c + 1); }
      if (j > 0 && !occ[c - W] && !label[c - W]) { label[c - W] = id; stack.push(c - W); }
      if (j < H - 1 && !occ[c + W] && !label[c + W]) { label[c + W] = id; stack.push(c + W); }
    }
    return n;
  };
  flood(0, 1);

  const rooms: Pt[][] = [];
  let id = 2;
  for (let c = 0; c < W * H; c++) {
    if (occ[c] || label[c]) continue;
    const n = flood(c, id);
    const area = n * cell * cell;
    if (area >= minArea && area <= maxArea) rooms.push(traceOutline(label, W, H, id, c, x0, y0, cell));
    id++;
  }
  return rooms
    .map((ring) => simplifyRing(ring, cell * 1.4))
    .filter((ring) => ring.length >= 3 && Math.abs(polyArea(ring)) >= minArea * 0.8)
    .map((ring) => (polyArea(ring) < 0 ? [...ring].reverse() : ring))
    // reading order: top-to-bottom, left-to-right, so ids and names come out stable
    .sort((p, q) => {
      const cy = (r: Pt[]) => r.reduce((s, v) => s + v[1], 0) / r.length, cx = (r: Pt[]) => r.reduce((s, v) => s + v[0], 0) / r.length;
      return Math.abs(cy(q) - cy(p)) > 0.5 ? cy(q) - cy(p) : cx(p) - cx(q);
    });
}

/** Outer boundary of one labelled patch of cells, as a counter-clockwise ring in plan metres. */
function traceOutline(label: Int32Array, W: number, H: number, id: number, seed: number, x0: number, y0: number, cell: number): Pt[] {
  const at = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < H && label[j * W + i] === id;
  // collect directed boundary edges, interior on the left
  const edges = new Map<string, [number, number][]>();
  const add = (a: [number, number], b: [number, number]) => {
    const k = `${a[0]},${a[1]}`;
    (edges.get(k) ?? edges.set(k, []).get(k)!).push(b);
  };
  // the patch is connected, so a flood from the seed visits exactly its cells
  const seen = new Set<number>([seed]);
  const todo = [seed];
  while (todo.length) {
    const c = todo.pop()!;
    const i = c % W, j = (c - i) / W;
    if (!at(i, j - 1)) add([i, j], [i + 1, j]); else if (!seen.has(c - W)) { seen.add(c - W); todo.push(c - W); }
    if (!at(i + 1, j)) add([i + 1, j], [i + 1, j + 1]); else if (!seen.has(c + 1)) { seen.add(c + 1); todo.push(c + 1); }
    if (!at(i, j + 1)) add([i + 1, j + 1], [i, j + 1]); else if (!seen.has(c + W)) { seen.add(c + W); todo.push(c + W); }
    if (!at(i - 1, j)) add([i, j + 1], [i, j]); else if (!seen.has(c - 1)) { seen.add(c - 1); todo.push(c - 1); }
  }
  // chain the edges into loops; the loop with the largest area is the outer boundary
  let best: Pt[] = [], bestArea = 0;
  while (edges.size) {
    const [startKey, outs] = edges.entries().next().value as [string, [number, number][]];
    const start = startKey.split(",").map(Number) as [number, number];
    const ring: Pt[] = [];
    let cur = start;
    for (let guard = 0; guard < 4_000_000; guard++) {
      ring.push([x0 + cur[0] * cell, y0 + cur[1] * cell]);
      const k = `${cur[0]},${cur[1]}`;
      const list = edges.get(k);
      if (!list || !list.length) break;
      const next = list.pop()!;
      if (!list.length) edges.delete(k);
      cur = next;
      if (cur[0] === start[0] && cur[1] === start[1]) break;
    }
    if (edges.get(startKey) && !edges.get(startKey)!.length) edges.delete(startKey);
    void outs;
    const a = Math.abs(polyArea(ring));
    if (a > bestArea) { bestArea = a; best = ring; }
  }
  return best;
}
