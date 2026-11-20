/**
 * Plan twin → the room rectangles and collision boxes the first-person walk
 * (components/walk/ApartmentWalk.tsx, WalkData) reads. Furniture boxes are
 * added later by the furnishing step; this covers the architecture only.
 */
import { type PlanTwin, type Pt, type Wall, alongWall, wallLength } from "./schema";

export type Rect = [number, number, number, number];
const r3 = (n: number) => Math.round(n * 1000) / 1000;

const PASSABLE = new Set(["door", "entry", "slider", "opening"]);

/** Axis-aligned box of a stretch [s1, s2] of a wall, full thickness. */
function wallBox(w: Wall, s1: number, s2: number, t = w.thickness): Rect | null {
  const p = alongWall(w, s1), q = alongWall(w, s2);
  const horizontal = Math.abs(p[1] - q[1]) < 1e-6, vertical = Math.abs(p[0] - q[0]) < 1e-6;
  if (!horizontal && !vertical) return null; // the walk's collider is axis-aligned only
  const h = t / 2;
  return horizontal
    ? [r3(Math.min(p[0], q[0])), r3(p[1] - h), r3(Math.max(p[0], q[0])), r3(p[1] + h)]
    : [r3(p[0] - h), r3(Math.min(p[1], q[1])), r3(p[0] + h), r3(Math.max(p[1], q[1]))];
}

/** Collision boxes for every wall, leaving gaps at doors / sliders / passages (windows stay solid). */
export function wallBoxes(t: PlanTwin): { boxes: Rect[]; skipped: string[] } {
  const boxes: Rect[] = [];
  const skipped: string[] = [];
  for (const w of t.walls) {
    const L = wallLength(w);
    const gaps = t.openings
      .filter((o) => o.wallId === w.id && PASSABLE.has(o.kind))
      .map((o) => [o.at - o.width / 2, o.at + o.width / 2] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    let s = 0;
    for (const [g1, g2] of [...gaps, [L, L] as [number, number]]) {
      if (g1 > s + 1e-6) {
        const b = wallBox(w, s, g1);
        if (b) boxes.push(b); else skipped.push(w.id);
      }
      s = Math.max(s, g2);
    }
  }
  return { boxes, skipped: [...new Set(skipped)] };
}

/**
 * Largest axis-aligned rectangle inside a room polygon whose sides lie on the
 * polygon's own x / y coordinates (exact for rectilinear rooms, which is
 * nearly all of them). Used for room labels and "which room am I in".
 */
export function roomRect(poly: Pt[]): Rect {
  const xs = [...new Set(poly.map((p) => p[0]))].sort((a, b) => a - b);
  const ys = [...new Set(poly.map((p) => p[1]))].sort((a, b) => a - b);
  const inside = (x: number, y: number) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  // grid cells between consecutive coordinates are either fully in or out
  const cell = xs.slice(0, -1).map((x, i) => ys.slice(0, -1).map((y, j) => inside((x + xs[i + 1]) / 2, (y + ys[j + 1]) / 2)));
  let best: Rect = [xs[0], ys[0], xs[0], ys[0]], bestA = -1;
  for (let i1 = 0; i1 < xs.length - 1; i1++)
    for (let i2 = i1 + 1; i2 < xs.length; i2++)
      for (let j1 = 0; j1 < ys.length - 1; j1++)
        for (let j2 = j1 + 1; j2 < ys.length; j2++) {
          let ok = true;
          for (let a = i1; a < i2 && ok; a++) for (let b = j1; b < j2 && ok; b++) ok = cell[a][b];
          const area = (xs[i2] - xs[i1]) * (ys[j2] - ys[j1]);
          if (ok && area > bestA) { bestA = area; best = [xs[i1], ys[j1], xs[i2], ys[j2]]; }
        }
  return best.map(r3) as Rect;
}

export function walkRooms(t: PlanTwin): Record<string, Rect> {
  return Object.fromEntries(t.rooms.map((r) => [r.id, roomRect(r.polygon)]));
}
