/**
 * Raw extraction (overview pixels, y down) → plan twin (metres, y north).
 *
 * Pure geometry, no API: pick a metric scale, straighten the drawing, snap
 * near-orthogonal walls, merge collinear runs, close junctions, snap room
 * outlines onto the walls, hang openings on their walls, and score each
 * element for the review screen.
 */
import { roomType } from "../dxf/parse";
import {
  ROOM_NAMES, type Opening, type PlanTwin, type Pt, type Room, type RoomType, type Wall,
  bbox, polygonArea, wallLength,
} from "../schema";
import type { Extraction } from "./extract";

export type ScaleSource = "hint" | "dimensions" | "scale-bar" | "room-areas" | "stated-area" | "declared-area" | "door-widths" | "none";

export interface ScaleCandidate { source: ScaleSource; mPerPx: number; n: number; confidence: number }

export interface ScaleEstimate {
  mPerPx: number;
  source: ScaleSource;
  confidence: number;
  candidates: ScaleCandidate[];
  notes: string[];
}

export interface ElementConfidence {
  ref: string;
  kind: "wall" | "opening" | "room" | "scale";
  /** 0–1: model confidence adjusted by what post-processing had to change. */
  score: number;
  notes: string[];
}

export interface BuildOptions {
  file?: string;
  sourceKind: "pdf" | "image";
  /** Apartment net area stated by the developer (m²): scale fallback and declared value. */
  areaM2?: number;
  /** Known scale (metres per overview pixel): overrides everything. */
  mPerPx?: number;
}

export interface BuildResult {
  twin: PlanTwin;
  scale: ScaleEstimate;
  confidence: ElementConfidence[];
  notes: string[];
}

type XP = { x: number; y: number };

const ORTHO_TOL = (6 * Math.PI) / 180;
/** Walls closer than this (m) on the same axis are one line. */
const LINE_TOL = 0.1;
/** Wall ends this close (m) to a perpendicular wall are joined to it. */
const JOIN_TOL = 0.4;
/** Room edges this close (m) to a wall line are snapped onto it. */
const ROOM_SNAP = 0.3;
/** Typical interior door leaf, for the last-resort scale. */
const DOOR_M = 0.85;

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const dpx = (a: XP, b: XP) => Math.hypot(a.x - b.x, a.y - b.y);
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const pxArea = (poly: XP[]) => polygonArea(poly.map((p) => [p.x, p.y] as Pt));

/** Keep values within `tol` (relative) of the median. */
function consistent(v: number[], tol: number): number[] {
  if (!v.length) return v;
  const m = median(v);
  return v.filter((x) => Math.abs(x / m - 1) <= tol);
}

export function estimateScale(x: Extraction, opts: Pick<BuildOptions, "areaM2" | "mPerPx"> = {}): ScaleEstimate {
  const c: ScaleCandidate[] = [];
  const notes: string[] = [];
  if (opts.mPerPx) c.push({ source: "hint", mPerPx: opts.mPerPx, n: 1, confidence: 1 });

  const dims = x.scale.dimensions
    .filter((d) => d.meters > 0.2 && d.meters < 80 && dpx(d.from, d.to) > 15)
    .map((d) => d.meters / dpx(d.from, d.to));
  if (dims.length) {
    const kept = consistent(dims, 0.06);
    const k = kept.reduce((s, v) => s + v, 0) / kept.length;
    const agree = kept.length / dims.length;
    const conf = kept.length >= 3 ? 0.95 * agree : kept.length === 2 ? 0.85 * agree : 0.6;
    c.push({ source: "dimensions", mPerPx: k, n: kept.length, confidence: conf });
    if (agree < 1) notes.push(`${dims.length - kept.length} of ${dims.length} dimension strings disagree with the rest and were ignored`);
  }
  const sb = x.scale.scaleBar;
  if (sb && sb.meters > 0 && dpx(sb.from, sb.to) > 20) c.push({ source: "scale-bar", mPerPx: sb.meters / dpx(sb.from, sb.to), n: 1, confidence: 0.85 });

  const withArea = x.rooms.filter((r) => r.writtenAreaM2 && r.writtenAreaM2 > 0.5 && r.polygon.length >= 3 && pxArea(r.polygon) > 0);
  if (withArea.length) {
    const ratios = withArea.map((r) => Math.sqrt(r.writtenAreaM2! / pxArea(r.polygon)));
    const kept = consistent(ratios, 0.08);
    const k = median(kept);
    c.push({ source: "room-areas", mPerPx: k, n: kept.length, confidence: kept.length >= 3 ? 0.8 : kept.length === 2 ? 0.65 : 0.45 });
  }
  const innerPx = x.rooms.filter((r) => r.type !== "balcony" && r.polygon.length >= 3).reduce((s, r) => s + pxArea(r.polygon), 0);
  if (opts.areaM2 && innerPx > 0) c.push({ source: "stated-area", mPerPx: Math.sqrt(opts.areaM2 / innerPx), n: 1, confidence: 0.75 });
  if (x.declared.apartmentAreaM2 && innerPx > 0)
    c.push({ source: "declared-area", mPerPx: Math.sqrt(x.declared.apartmentAreaM2 / innerPx), n: 1, confidence: 0.55 });
  const doors = x.openings.filter((o) => o.kind === "door").map((o) => dpx(o.jambA, o.jambB)).filter((w) => w > 5);
  if (doors.length) c.push({ source: "door-widths", mPerPx: DOOR_M / median(doors), n: doors.length, confidence: doors.length >= 3 ? 0.35 : 0.2 });

  if (!c.length) {
    notes.push("No scale found: no dimensions, scale bar, areas or doors. Enter the apartment area or a known length.");
    return { mPerPx: 0.01, source: "none", confidence: 0, candidates: [], notes };
  }
  const best = [...c].sort((a, b) => b.confidence - a.confidence)[0];
  if (best.source === "hint") return { mPerPx: best.mPerPx, source: "hint", confidence: 1, candidates: c, notes };
  let confidence = best.confidence;
  // average the trustworthy sources that agree with the best one (each alone is noisy)
  let sw = best.confidence * Math.min(best.n, 5), sk = best.mPerPx * sw;
  for (const o of c) {
    if (o === best || o.confidence < 0.5) continue;
    const dev = o.mPerPx / best.mPerPx - 1;
    if (Math.abs(dev) > 0.05) {
      notes.push(`Scale from ${o.source} differs from ${best.source} by ${(dev * 100).toFixed(0)}%`);
      confidence -= 0.15;
    } else {
      confidence = Math.min(1, confidence + 0.05);
      if (Math.abs(dev) <= 0.03) { const w = o.confidence * Math.min(o.n, 5); sw += w; sk += o.mPerPx * w; }
    }
  }
  return { mPerPx: sk / sw, source: best.source, confidence: clamp01(confidence), candidates: c, notes };
}

interface WW {
  a: Pt; b: Pt; t: number; kind: Wall["kind"]; conf: number; notes: string[];
  o: "h" | "v" | "d";
}

const rot = (p: Pt, th: number): Pt => [p[0] * Math.cos(th) - p[1] * Math.sin(th), p[0] * Math.sin(th) + p[1] * Math.cos(th)];

/** Dominant drawing angle (mod 90°), length-weighted, radians. */
export function dominantAngle(segs: [Pt, Pt][]): number {
  let C = 0, S = 0;
  for (const [a, b] of segs) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const th = Math.atan2(b[1] - a[1], b[0] - a[0]);
    C += L * Math.cos(4 * th); S += L * Math.sin(4 * th);
  }
  return C || S ? Math.atan2(S, C) / 4 : 0;
}

/** Standard wall thicknesses (m) a measured value is snapped to. */
const THICK = [0.07, 0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4];
function quantThickness(t: number, kind: Wall["kind"]): number {
  if (kind === "glazing" || kind === "railing") return 0.02;
  const lo = kind === "exterior" ? 0.15 : 0.07, hi = kind === "exterior" ? 0.45 : 0.3;
  const c = Math.max(lo, Math.min(hi, t));
  return THICK.reduce((b, v) => (Math.abs(v - c) < Math.abs(b - c) ? v : b), THICK[0]);
}

/** Cluster walls of one orientation onto shared axis lines, then merge collinear pieces of the same kind. */
function clusterAndMerge(ws: WW[], o: "h" | "v"): WW[] {
  const ax = o === "h" ? 1 : 0; // the fixed coordinate
  const sp = 1 - ax;            // the running coordinate
  const sorted = ws.filter((w) => w.o === o).sort((p, q) => p.a[ax] - q.a[ax]);
  const groups: WW[][] = [];
  for (const w of sorted) {
    const g = groups[groups.length - 1];
    const mean = g ? g.reduce((s, x) => s + x.a[ax], 0) / g.length : 0;
    if (g && Math.abs(w.a[ax] - mean) <= LINE_TOL) g.push(w); else groups.push([w]);
  }
  const out: WW[] = [];
  for (const g of groups) {
    const wsum = g.reduce((s, w) => s + Math.abs(w.b[sp] - w.a[sp]) * (w.kind === "exterior" ? 2 : 1), 0) || 1;
    const v = g.reduce((s, w) => s + w.a[ax] * Math.abs(w.b[sp] - w.a[sp]) * (w.kind === "exterior" ? 2 : 1), 0) / wsum;
    for (const w of g) {
      const moved = Math.abs(w.a[ax] - v);
      if (moved > 0.05) { w.conf *= 0.9; w.notes.push(`aligned with a neighbouring wall (${Math.round(moved * 100)} cm)`); }
      w.a[ax] = v; w.b[ax] = v;
      if (w.a[sp] > w.b[sp]) [w.a, w.b] = [w.b, w.a];
    }
    // merge overlapping / touching pieces of the same kind and similar thickness
    const byKind = [...g].sort((p, q) => p.a[sp] - q.a[sp]);
    const merged: WW[] = [];
    for (const w of byKind) {
      const m = merged.find((x) => x.kind === w.kind && Math.abs(x.t - w.t) <= 0.06 && w.a[sp] <= x.b[sp] + 0.05);
      if (m) {
        if (w.b[sp] > m.b[sp]) m.b = [...w.b] as Pt;
        m.t = Math.max(m.t, w.t); m.conf = Math.min(m.conf, w.conf); m.notes.push(...w.notes);
      } else merged.push({ ...w, a: [...w.a] as Pt, b: [...w.b] as Pt, notes: [...w.notes] });
    }
    out.push(...merged);
  }
  return out;
}

/** Move each wall end onto the centre line of a perpendicular wall it stops short of (or overshoots). */
function joinEnds(ws: WW[]): void {
  for (const w of ws) {
    if (w.o === "d") continue;
    const ax = w.o === "h" ? 0 : 1; // coordinate that changes along w
    for (const end of ["a", "b"] as const) {
      const p = w[end];
      let best: { v: number; d: number } | null = null;
      for (const o of ws) {
        if (o === w || o.o === "d" || o.o === w.o) continue;
        const ov = o.a[ax]; // o's fixed coordinate along w's axis
        const lo = Math.min(o.a[1 - ax], o.b[1 - ax]), hi = Math.max(o.a[1 - ax], o.b[1 - ax]);
        if (p[1 - ax] < lo - JOIN_TOL || p[1 - ax] > hi + JOIN_TOL) continue;
        const d = Math.abs(p[ax] - ov);
        if (d <= JOIN_TOL && (!best || d < best.d)) best = { v: ov, d };
      }
      if (best && best.d > 1e-6) {
        // never flip the wall over
        const other = w[end === "a" ? "b" : "a"];
        if (Math.abs(best.v - other[ax]) > 0.1) p[ax] = best.v;
      }
    }
  }
}

function snapRoom(poly: Pt[], walls: WW[]): { poly: Pt[]; moved: number } {
  const n = poly.length;
  const p = poly.map((q) => [...q] as Pt);
  // 1. make near-axis edges exactly axis-aligned
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    if (Math.abs(dy) <= Math.tan(ORTHO_TOL) * Math.abs(dx)) { const y = (a[1] + b[1]) / 2; a[1] = y; b[1] = y; }
    else if (Math.abs(dx) <= Math.tan(ORTHO_TOL) * Math.abs(dy)) { const x = (a[0] + b[0]) / 2; a[0] = x; b[0] = x; }
  }
  // 2. snap each axis edge onto the nearest wall line (interior centre / exterior faces)
  let moved = 0;
  const lines = (o: "h" | "v") => walls.filter((w) => w.o === o).flatMap((w) => {
    const ax = o === "h" ? 1 : 0;
    const lo = Math.min(w.a[1 - ax], w.b[1 - ax]), hi = Math.max(w.a[1 - ax], w.b[1 - ax]);
    const vs = w.kind === "exterior" ? [w.a[ax] - w.t / 2, w.a[ax] + w.t / 2] : [w.a[ax]];
    return vs.map((v) => ({ v, lo, hi }));
  });
  const H = lines("h"), V = lines("v");
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    const horiz = a[1] === b[1] && a[0] !== b[0], vert = a[0] === b[0] && a[1] !== b[1];
    if (!horiz && !vert) continue;
    const ax = horiz ? 1 : 0;
    const lo = Math.min(a[1 - ax], b[1 - ax]), hi = Math.max(a[1 - ax], b[1 - ax]);
    let best: { v: number; d: number } | null = null;
    for (const l of horiz ? H : V) {
      if (Math.min(hi, l.hi) - Math.max(lo, l.lo) < Math.min(0.3, (hi - lo) / 2)) continue; // must run alongside the edge
      const d = Math.abs(l.v - a[ax]);
      if (d <= ROOM_SNAP && (!best || d < best.d)) best = { v: l.v, d };
    }
    if (best) { moved = Math.max(moved, best.d); a[ax] = best.v; b[ax] = best.v; }
  }
  // 3. drop repeated and collinear corners
  const out: Pt[] = [];
  for (const q of p) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) > 0.02) out.push(q);
  }
  if (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= 0.02) out.pop();
  const clean = out.filter((q, i) => {
    const a = out[(i - 1 + out.length) % out.length], b = out[(i + 1) % out.length];
    return Math.abs((q[0] - a[0]) * (b[1] - a[1]) - (q[1] - a[1]) * (b[0] - a[0])) > 1e-4;
  });
  return { poly: clean.length >= 3 ? clean : out, moved };
}

const HEB = /[֐-׿]/;

export function buildTwin(x: Extraction, opts: BuildOptions): BuildResult {
  const notes: string[] = [...x.notes];
  const conf: ElementConfidence[] = [];
  const scale = estimateScale(x, opts);
  notes.push(...scale.notes);
  if (x.drawingKind === "rendered_top_view") notes.push("Source is a rendering, not a drawing: walls and openings are inferred from the image.");
  const s = scale.mPerPx;
  const toM = (p: XP): Pt => [p.x * s, -p.y * s];

  // deskew by the dominant wall angle
  const raw = x.walls.filter((w) => dpx(w.from, w.to) * s > 0.1);
  const angle = dominantAngle(raw.map((w) => [toM(w.from), toM(w.to)]));
  const th = Math.abs(angle) > (0.1 * Math.PI) / 180 && Math.abs(angle) < (20 * Math.PI) / 180 ? -angle : 0;
  if (th) notes.push(`Plan was rotated ${((-th * 180) / Math.PI).toFixed(1)}°; straightened.`);
  const T = (p: XP): Pt => rot(toM(p), th);

  // walls: straighten, cluster, merge, join
  let ws: WW[] = raw.map((w) => {
    const a = T(w.from), b = T(w.to);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const m = Math.abs(Math.sin(2 * ang)) < Math.sin(2 * ORTHO_TOL) ? (Math.abs(Math.cos(ang)) > 0.5 ? "h" : "v") : "d";
    const notes2: string[] = [];
    if (m === "h") { const y = (a[1] + b[1]) / 2; a[1] = y; b[1] = y; }
    else if (m === "v") { const xx = (a[0] + b[0]) / 2; a[0] = xx; b[0] = xx; }
    else notes2.push("diagonal wall kept as drawn");
    return { a, b, t: quantThickness(w.thicknessPx * s, w.kind), kind: w.kind, conf: w.confidence, notes: notes2, o: m };
  });
  ws = [...clusterAndMerge(ws, "h"), ...clusterAndMerge(ws, "v"), ...ws.filter((w) => w.o === "d")];
  joinEnds(ws);
  ws = ws.filter((w) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) > 0.15);

  const walls: Wall[] = ws.map((w, i) => ({ id: `w${i + 1}`, a: [r3(w.a[0]), r3(w.a[1])], b: [r3(w.b[0]), r3(w.b[1])], thickness: w.t, kind: w.kind }));
  ws.forEach((w, i) => conf.push({ ref: walls[i].id, kind: "wall", score: r2(clamp01(w.conf)), notes: w.notes }));

  // openings: hang each on the best-fitting wall
  const openings: Opening[] = [];
  const oconf: { o: Opening; c: ElementConfidence }[] = [];
  for (const op of x.openings) {
    const A = T(op.jambA), B = T(op.jambB);
    const mid: Pt = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    const width0 = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const ux = width0 > 1e-6 ? (B[0] - A[0]) / width0 : 0, uy = width0 > 1e-6 ? (B[1] - A[1]) / width0 : 0;
    let best: { w: Wall; at: number; score: number } | null = null;
    for (const w of walls) {
      const L = wallLength(w);
      if (L < 0.3) continue;
      const wx = (w.b[0] - w.a[0]) / L, wy = (w.b[1] - w.a[1]) / L;
      const t = (mid[0] - w.a[0]) * wx + (mid[1] - w.a[1]) * wy;
      const d = Math.abs((mid[0] - w.a[0]) * -wy + (mid[1] - w.a[1]) * wx);
      if (t < -0.2 || t > L + 0.2 || d > Math.max(0.35, w.thickness / 2 + 0.25)) continue;
      let score = d;
      if ((op.kind === "window" || op.kind === "slider") && w.kind === "interior") score += 0.3;
      if ((op.kind === "door" || op.kind === "opening") && w.kind !== "interior") score += 0.15;
      if (w.kind === "railing") score += 0.5;
      if (width0 > 0.2 && Math.abs(ux * wx + uy * wy) < 0.8) score += 0.3;
      if (!best || score < best.score) best = { w, at: t, score };
    }
    const id = `o${openings.length + 1}`;
    if (!best) { notes.push(`A ${op.kind} could not be placed on any wall and was left out`); continue; }
    const L = wallLength(best.w);
    const c: ElementConfidence = { ref: id, kind: "opening", score: op.confidence, notes: [] };
    let width = Math.max(0.4, Math.round(width0 / 0.05) * 0.05);
    if (width > L) { width = L; c.notes.push("wider than its wall; trimmed"); c.score *= 0.7; }
    const at = Math.max(width / 2, Math.min(L - width / 2, best.at));
    if (Math.abs(at - best.at) > 0.15) { c.notes.push("moved to fit within its wall"); c.score *= 0.7; }
    if (best.score > 0.3) { c.notes.push("wall match uncertain"); c.score *= 0.8; }
    const o: Opening = {
      id, wallId: best.w.id, kind: op.kind, at: r3(at), width: r3(width),
      sill: op.kind === "window" ? 0.9 : 0,
      head: op.kind === "window" || op.kind === "slider" ? 2.4 : 2.2,
    };
    openings.push(o); oconf.push({ o, c });
  }
  // resolve overlaps on a wall: trim small overlaps, drop the weaker of big ones
  for (const w of walls) {
    const list = oconf.filter((e) => e.o.wallId === w.id).sort((p, q) => p.o.at - q.o.at);
    for (let i = 1; i < list.length; i++) {
      const p = list[i - 1].o, q = list[i].o;
      const ov = p.at + p.width / 2 - (q.at - q.width / 2);
      if (ov <= 0) continue;
      if (ov < 0.25 && p.width - ov / 2 - 0.01 > 0.4 && q.width - ov / 2 - 0.01 > 0.4) {
        const cut = ov / 2 + 0.01;
        p.width = r3(p.width - cut); p.at = r3(p.at - cut / 2);
        q.width = r3(q.width - cut); q.at = r3(q.at + cut / 2);
        list[i - 1].c.notes.push("trimmed to clear a neighbouring opening"); list[i].c.notes.push("trimmed to clear a neighbouring opening");
      } else {
        const drop = list[i - 1].c.score < list[i].c.score ? list[i - 1] : list[i];
        notes.push(`Dropped ${drop.o.kind} overlapping another opening on wall ${w.id}`);
        oconf.splice(oconf.indexOf(drop), 1);
        list.splice(list.indexOf(drop), 1);
        i = 0;
      }
    }
  }
  const keptOpenings = oconf.map((e, i) => { const id = `o${i + 1}`; e.o.id = id; e.c.ref = id; return e; });
  for (const e of keptOpenings) conf.push({ ...e.c, score: r2(clamp01(e.c.score)) });

  // rooms
  const counters: Partial<Record<RoomType, number>> = {};
  const rooms: Room[] = [];
  const roomConf: ElementConfidence[] = [];
  for (const r of x.rooms) {
    if (r.polygon.length < 3) { notes.push(`Room "${r.label || r.labelEn}" has no outline and was left out`); continue; }
    const { poly, moved } = snapRoom(r.polygon.map(T), ws);
    if (poly.length < 3) continue;
    const kw = roomType(`${r.label} ${r.labelEn}`);
    const type: RoomType = kw !== "other" ? kw : r.type;
    const num = `${r.label} ${r.labelEn}`.match(/\d+/)?.[0];
    counters[type] = (counters[type] ?? 0) + 1;
    const id = `${type}-${num ?? counters[type]}`;
    const c: ElementConfidence = { ref: id, kind: "room", score: r.confidence, notes: [] };
    if (kw !== "other" && kw !== r.type) c.notes.push(`label reads as ${kw}, model said ${r.type}`);
    if (moved > 0.15) { c.notes.push(`outline moved up to ${Math.round(moved * 100)} cm onto the walls`); c.score *= 0.85; }
    const area = polygonArea(poly);
    if (r.writtenAreaM2 && Math.abs(area - r.writtenAreaM2) / r.writtenAreaM2 > 0.08) {
      c.notes.push(`computed ${area.toFixed(1)} m², plan says ${r.writtenAreaM2} m²`); c.score *= 0.6;
    }
    rooms.push({
      id, type,
      name: {
        he: HEB.test(r.label) ? r.label.trim() : ROOM_NAMES[type].he,
        en: r.labelEn.trim() || ROOM_NAMES[type].en,
      },
      polygon: poly.map(([a, b]) => [r3(a), r3(b)] as Pt),
      ...(r.writtenAreaM2 ? { areaDeclared: r.writtenAreaM2 } : {}),
    });
    roomConf.push({ ...c, score: r2(clamp01(c.score)) });
  }
  const seen = new Map<string, number>();
  rooms.forEach((r, i) => {
    const k = seen.get(r.id) ?? 0; seen.set(r.id, k + 1);
    if (k) r.id = `${r.id}-${k + 1}`;
    roomConf[i].ref = r.id;
  });
  conf.push(...roomConf);

  // origin at the south-west corner of the apartment (balconies excluded), like the DXF parser
  const inner = rooms.filter((r) => r.type !== "balcony").flatMap((r) => r.polygon);
  const ref = inner.length ? inner : walls.flatMap((w) => [w.a, w.b]);
  const [ox, oy] = ref.length ? bbox(ref) : [0, 0];
  const shift = (p: Pt): Pt => [r3(p[0] - ox), r3(p[1] - oy)];
  for (const w of walls) { w.a = shift(w.a); w.b = shift(w.b); }
  for (const r of rooms) r.polygon = r.polygon.map(shift);

  conf.unshift({ ref: "scale", kind: "scale", score: r2(scale.confidence), notes: [`${scale.source}: ${(scale.mPerPx * 100).toFixed(3)} cm/px`] });

  const declared: PlanTwin["declared"] = {};
  const area = opts.areaM2 ?? x.declared.apartmentAreaM2;
  if (area) declared.area = area;
  if (x.declared.balconyAreaM2) declared.balconyArea = x.declared.balconyAreaM2;
  if (x.declared.rooms) declared.rooms = x.declared.rooms;

  return {
    twin: {
      version: 1, units: "m",
      source: { kind: opts.sourceKind, file: opts.file },
      wallHeight: 2.8,
      walls, openings: keptOpenings.map((e) => e.o), rooms, declared,
    },
    scale, confidence: conf, notes,
  };
}
