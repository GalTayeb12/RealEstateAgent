/**
 * Score a parsed twin against ground truth (e.g. YARKON_TWIN). Both twins are
 * compared in their normalised frames (origin at the apartment's south-west
 * corner), so a scale error shows up everywhere, as it should.
 */
import { type Opening, type PlanTwin, type Pt, type Wall, bbox, pointInPolygon, polygonArea, wallLength } from "../schema";

export interface TwinScore {
  rooms: { got: number; want: number; matched: number; typeOk: number; areaWithin5: number; detail: { want: string; got: string | null; iou: number; areaErr: number | null; typeOk: boolean }[] };
  openings: Record<"door" | "window" | "slider" | "other", { got: number; want: number }>;
  walls: { recall: number; precision: number };
  netArea: { got: number; want: number };
}

function iou(a: Pt[], b: Pt[], step = 0.1): number {
  const [ax1, ay1, ax2, ay2] = bbox(a), [bx1, by1, bx2, by2] = bbox(b);
  const x1 = Math.min(ax1, bx1), y1 = Math.min(ay1, by1), x2 = Math.max(ax2, bx2), y2 = Math.max(ay2, by2);
  let inter = 0, uni = 0;
  for (let x = x1 + step / 2; x < x2; x += step)
    for (let y = y1 + step / 2; y < y2; y += step) {
      const ia = pointInPolygon([x, y], a), ib = pointInPolygon([x, y], b);
      if (ia && ib) inter++;
      if (ia || ib) uni++;
    }
  return uni ? inter / uni : 0;
}

function segDist(p: Pt, w: Wall): number {
  const L = wallLength(w);
  if (L < 1e-9) return Math.hypot(p[0] - w.a[0], p[1] - w.a[1]);
  const t = Math.max(0, Math.min(L, ((p[0] - w.a[0]) * (w.b[0] - w.a[0]) + (p[1] - w.a[1]) * (w.b[1] - w.a[1])) / L));
  const q: Pt = [w.a[0] + ((w.b[0] - w.a[0]) * t) / L, w.a[1] + ((w.b[1] - w.a[1]) * t) / L];
  return Math.hypot(p[0] - q[0], p[1] - q[1]);
}

/** Share of `from` wall length (sampled every 5 cm) lying within `tol` of some wall in `to`. */
export function wallCoverage(from: Wall[], to: Wall[], tol = 0.15): number {
  let n = 0, hit = 0;
  for (const w of from) {
    const L = wallLength(w);
    for (let s = 0.025; s < L; s += 0.05) {
      const p: Pt = [w.a[0] + ((w.b[0] - w.a[0]) * s) / L, w.a[1] + ((w.b[1] - w.a[1]) * s) / L];
      n++;
      if (to.some((o) => segDist(p, o) <= tol)) hit++;
    }
  }
  return n ? hit / n : 1;
}

const group = (k: Opening["kind"]): keyof TwinScore["openings"] =>
  k === "door" || k === "entry" ? "door" : k === "window" ? "window" : k === "slider" ? "slider" : "other";

export function scoreTwin(got: PlanTwin, want: PlanTwin): TwinScore {
  // greedy room matching by IoU
  const pairs: { i: number; j: number; v: number }[] = [];
  want.rooms.forEach((w, i) => got.rooms.forEach((g, j) => { const v = iou(w.polygon, g.polygon); if (v >= 0.3) pairs.push({ i, j, v }); }));
  pairs.sort((a, b) => b.v - a.v);
  const mi = new Map<number, { j: number; v: number }>(), usedJ = new Set<number>();
  for (const p of pairs) if (!mi.has(p.i) && !usedJ.has(p.j)) { mi.set(p.i, p); usedJ.add(p.j); }
  const detail = want.rooms.map((w, i) => {
    const m = mi.get(i);
    if (!m) return { want: w.id, got: null, iou: 0, areaErr: null, typeOk: false };
    const g = got.rooms[m.j];
    const aw = polygonArea(w.polygon);
    return { want: w.id, got: g.id, iou: Math.round(m.v * 100) / 100, areaErr: Math.round(((polygonArea(g.polygon) - aw) / aw) * 1000) / 1000, typeOk: g.type === w.type };
  });
  const openings = { door: { got: 0, want: 0 }, window: { got: 0, want: 0 }, slider: { got: 0, want: 0 }, other: { got: 0, want: 0 } };
  for (const o of got.openings) openings[group(o.kind)].got++;
  for (const o of want.openings) openings[group(o.kind)].want++;
  const net = (t: PlanTwin) => Math.round(t.rooms.filter((r) => r.type !== "balcony").reduce((s, r) => s + polygonArea(r.polygon), 0) * 10) / 10;
  return {
    rooms: {
      got: got.rooms.length, want: want.rooms.length, matched: mi.size,
      typeOk: detail.filter((d) => d.typeOk).length,
      areaWithin5: detail.filter((d) => d.areaErr !== null && Math.abs(d.areaErr) <= 0.05).length,
      detail,
    },
    openings,
    walls: { recall: Math.round(wallCoverage(want.walls, got.walls) * 1000) / 1000, precision: Math.round(wallCoverage(got.walls, want.walls) * 1000) / 1000 },
    netArea: { got: net(got), want: net(want) },
  };
}
