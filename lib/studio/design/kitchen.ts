/**
 * Kitchen layout proposals: single wall, galley, L and U, generated from the
 * kitchen room's geometry with the parametric kitchen runs. Pure and engine
 * independent, so the AI designer and the UI use the same planner. Every layout
 * comes back as ONE batch command (a single undo step) and only if each base run
 * passes the normal placement validation; door and window spans are kept clear.
 */
import type { Baseline, BaselineRoom } from "../baseline/fromTwin";
import type { Command } from "../commands/types";
import type { CatalogLookup } from "../schema/catalog";
import type { DesignDocument } from "../schema/document";
import { newNodeId } from "../schema/ids";
import type { ItemNode } from "../schema/nodes";
import { footprint, pointInPolygon, type Vec } from "../validation/geom2d";
import { resolveSize } from "../catalog/sizing";
import { previewNode } from "./preview";

export const BASE_ID = "kitchen-base-run-01";
export const WALL_ID = "kitchen-wall-run-01";
const DEPTH = 0.6;
const DOOR_CLEAR = 0.1; // free strip kept beside a doorway
const WINDOW_CLEAR = 0.05;

type Side = "S" | "E" | "N" | "W";
type Span = [number, number];
type SideInfo = {
  side: Side;
  /** Interior coordinate range along the side (x for S/N, y for E/W) between the faces of the adjacent walls. */
  range: Span;
  /** Coordinate of the wall face (y for S/N, x for E/W). */
  face: number;
  rot: number;
  /** Free spans for base units (doors blocked) and for wall units (doors and windows blocked). */
  base: Span[];
  wall: Span[];
};

export type KitchenLayout = {
  id: "single" | "galley" | "l-shape" | "u-shape";
  name: { he: string; en: string };
  /** Total base-run length, metres. */
  counter: number;
  commands: Command[];
};

const NAMES: Record<KitchenLayout["id"], { he: string; en: string }> = {
  single: { he: "קו אחד", en: "Single wall" },
  galley: { he: "מטבח מקבילי", en: "Galley" },
  "l-shape": { he: "מטבח בצורת ר", en: "L-shaped" },
  "u-shape": { he: "מטבח בצורת פ", en: "U-shaped" },
};

const subtract = (spans: Span[], cut: Span): Span[] =>
  spans.flatMap(([a, b]) => (cut[1] <= a || cut[0] >= b ? [[a, b] as Span] : ([[a, Math.min(b, cut[0])], [Math.max(a, cut[1]), b]] as Span[]).filter(([x, y]) => y - x > 1e-6)));

/** Rectangular rooms only (the planner reads the bounding box); returns null for anything else. */
function rectOf(room: BaselineRoom): [number, number, number, number] | null {
  const xs = room.polygon.map((p) => p[0]), ys = room.polygon.map((p) => p[1]);
  const b: [number, number, number, number] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const area = (b[2] - b[0]) * (b[3] - b[1]);
  return Math.abs(area - room.area) < 0.05 ? b : null;
}

function sidesOf(baseline: Baseline, room: BaselineRoom): SideInfo[] | null {
  const r = rectOf(room);
  if (!r) return null;
  const [x0, y0, x1, y1] = r;
  type W = Baseline["walls"][string];
  // the wall standing along each side of the room (a side with no wall, e.g. an open plan edge, gets no runs)
  const wallOn = (side: Side): W | undefined => Object.values(baseline.walls).find((w) => {
    const horiz = Math.abs(w.a[1] - w.b[1]) < 1e-6, vert = Math.abs(w.a[0] - w.b[0]) < 1e-6;
    const horizSide = side === "S" || side === "N";
    const lo = horizSide ? Math.min(w.a[0], w.b[0]) : Math.min(w.a[1], w.b[1]);
    const hi = horizSide ? Math.max(w.a[0], w.b[0]) : Math.max(w.a[1], w.b[1]);
    const rLo = horizSide ? x0 : y0, rHi = horizSide ? x1 : y1;
    if (Math.min(hi, rHi) - Math.max(lo, rLo) < 0.5) return false;
    if (w.kind === "glazing" || w.kind === "railing") return false;
    // a side wall belongs to this room when its centre line is within a wall thickness of the room edge
    if (side === "S") return horiz && Math.abs(w.a[1] - y0) < 0.3;
    if (side === "N") return horiz && Math.abs(w.a[1] - y1) < 0.3;
    if (side === "W") return vert && Math.abs(w.a[0] - x0) < 0.3;
    return vert && Math.abs(w.a[0] - x1) < 0.3;
  });
  // coordinate of the wall face on the room side
  const faceOf = (side: Side, w: W) => {
    const t = w.thickness / 2;
    return side === "S" ? w.a[1] + t : side === "N" ? w.a[1] - t : side === "W" ? w.a[0] + t : w.a[0] - t;
  };
  const ws = { S: wallOn("S"), N: wallOn("N"), W: wallOn("W"), E: wallOn("E") };
  const fx0 = ws.W ? faceOf("W", ws.W) : x0, fx1 = ws.E ? faceOf("E", ws.E) : x1;
  const fy0 = ws.S ? faceOf("S", ws.S) : y0, fy1 = ws.N ? faceOf("N", ws.N) : y1;
  const info: SideInfo[] = [];
  const mk = (side: Side, lo: number, hi: number, rot: number) => {
    const w = ws[side];
    if (!w) return;
    const horizSide = side === "S" || side === "N";
    const wLo = horizSide ? Math.min(w.a[0], w.b[0]) : Math.min(w.a[1], w.b[1]);
    const wHi = horizSide ? Math.max(w.a[0], w.b[0]) : Math.max(w.a[1], w.b[1]);
    // only the part of the room edge that actually has wall
    let base: Span[] = [[Math.max(lo, wLo), Math.min(hi, wHi)]];
    let wall: Span[] = [[Math.max(lo, wLo), Math.min(hi, wHi)]];
    for (const op of Object.values(baseline.openings)) {
      if (op.wallId !== w.id) continue;
      const along = horizSide ? op.center[0] : op.center[1];
      const half = op.width / 2;
      if (op.kind === "window") wall = subtract(wall, [along - half - WINDOW_CLEAR, along + half + WINDOW_CLEAR]);
      else { base = subtract(base, [along - half - DOOR_CLEAR, along + half + DOOR_CLEAR]); wall = subtract(wall, [along - half - DOOR_CLEAR, along + half + DOOR_CLEAR]); }
    }
    info.push({ side, range: [lo, hi], face: faceOf(side, w), rot, base, wall });
  };
  mk("S", fx0, fx1, 0);
  mk("N", fx0, fx1, Math.PI);
  mk("W", fy0, fy1, -Math.PI / 2);
  mk("E", fy0, fy1, Math.PI / 2);
  return info;
}

const floor1 = (v: number) => Math.floor(v * 10 + 1e-9) / 10;

function itemFor(side: SideInfo, id: string, version: number, a: number, b: number): ItemNode {
  const w = floor1(b - a);
  const mid = a + (b - a) / 2;
  const horiz = side.side === "S" || side.side === "N";
  return {
    id: newNodeId(), kind: "item", locked: false, catalog: { id, version }, slots: {}, params: { width: w },
    transform: { x: horiz ? mid : side.face, y: horiz ? side.face : mid, z: 0, rot: side.rot },
  };
}

type Run = { side: SideInfo; a: number; b: number };

/** Longest free span of a side that touches (within 5 cm) the given coordinate, if any. */
function spanTouching(spans: Span[], at: number, from: "start" | "end"): Span | null {
  for (const [a, b] of spans) if ((from === "start" && Math.abs(a - at) < 0.05) || (from === "end" && Math.abs(b - at) < 0.05)) return [a, b];
  return null;
}
const longest = (spans: Span[]): Span | null => spans.reduce<Span | null>((m, s) => (!m || s[1] - s[0] > m[1] - m[0] ? s : m), null);

export function proposeKitchenLayouts(baseline: Baseline, doc: DesignDocument, catalog: CatalogLookup, roomId?: string): KitchenLayout[] {
  const room = roomId ? baseline.rooms[roomId] : Object.values(baseline.rooms).find((r) => r.type === "kitchen");
  if (!room) return [];
  const base = catalog.model({ id: BASE_ID, version: 1 }), wall = catalog.model({ id: WALL_ID, version: 1 });
  if (!base || !wall) return [];
  const sides = sidesOf(baseline, room);
  if (!sides) return [];
  const by = Object.fromEntries(sides.map((s) => [s.side, s])) as Partial<Record<Side, SideInfo>>;

  // previous kitchen runs inside this room are replaced, not stacked
  const centreOf = (n: ItemNode): Vec => {
    const m = catalog.model(n.catalog);
    if (!m) return [n.transform.x, n.transform.y];
    const { w, d } = resolveSize(m, n);
    const fp = footprint(n.transform.x, n.transform.y, n.transform.rot, w, d);
    return [fp.reduce((s, p) => s + p[0], 0) / fp.length, fp.reduce((s, p) => s + p[1], 0) / fp.length];
  };
  const old = Object.values(doc.nodes).filter((n): n is ItemNode => n.kind === "item" && (n.catalog.id === BASE_ID || n.catalog.id === WALL_ID) && pointInPolygon(centreOf(n), room.polygon));
  const cleared: DesignDocument = { ...doc, nodes: Object.fromEntries(Object.entries(doc.nodes).filter(([id]) => !old.some((o) => o.id === id))) };

  const layouts: Record<KitchenLayout["id"], Run[] | null> = { single: null, galley: null, "l-shape": null, "u-shape": null };
  const minRun = 1.2;
  const best = (s: SideInfo) => longest(s.base.filter(([a, b]) => b - a >= minRun));

  // single wall: the longest free side
  const singles = sides.map((s) => ({ s, span: best(s) })).filter((x) => x.span).sort((p, q) => q.span![1] - q.span![0] - (p.span![1] - p.span![0]));
  if (singles[0]) layouts.single = [{ side: singles[0].s, a: singles[0].span![0], b: singles[0].span![1] }];

  // galley: two opposite sides, with at least 1.0 m between the counter fronts
  for (const [p, q] of [["S", "N"], ["W", "E"]] as [Side, Side][]) {
    const P = by[p], Q = by[q];
    if (!P || !Q) continue;
    const a = best(P), b = best(Q);
    const gap = Math.abs(Q.face - P.face) - 2 * DEPTH;
    if (a && b && gap >= 1.0 && !layouts.galley) layouts.galley = [{ side: P, a: a[0], b: a[1] }, { side: Q, a: b[0], b: b[1] }];
  }

  // L and U: runs that meet in the corner (the second run starts one depth away from the corner)
  const corners: [Side, Side][] = [["S", "W"], ["S", "E"], ["N", "W"], ["N", "E"]];
  for (const [h, v] of corners) {
    const H = by[h], V = by[v];
    if (!H || !V) continue;
    const hAtCorner = v === "W" ? "start" : "end", cornerH = v === "W" ? H.range[0] : H.range[1];
    const hs = spanTouching(H.base, cornerH, hAtCorner);
    const vCorner = h === "S" ? V.range[0] : V.range[1];
    const vFrom = h === "S" ? "start" : "end";
    const vs = spanTouching(V.base, vCorner, vFrom);
    if (!hs || !vs || hs[1] - hs[0] < minRun) continue;
    const vSpan: Span = h === "S" ? [vs[0] + DEPTH, vs[1]] : [vs[0], vs[1] - DEPTH];
    if (vSpan[1] - vSpan[0] < 0.8) continue;
    if (!layouts["l-shape"]) layouts["l-shape"] = [{ side: H, a: hs[0], b: hs[1] }, { side: V, a: vSpan[0], b: vSpan[1] }];
    // U: a third run on the opposite side, and the middle run stops one depth short of both counters
    const opp = by[(h === "S" ? "N" : "S") as Side];
    const os = opp && spanTouching(opp.base, v === "W" ? opp.range[0] : opp.range[1], v === "W" ? "start" : "end");
    const mid = longest(V.base.map(([x, y]) => [Math.max(x, V.range[0] + DEPTH), Math.min(y, V.range[1] - DEPTH)] as Span).filter(([x, y]) => y - x >= 0.8));
    if (opp && os && os[1] - os[0] >= minRun && mid && !layouts["u-shape"]) {
      layouts["u-shape"] = [{ side: H, a: hs[0], b: hs[1] }, { side: V, a: mid[0], b: mid[1] }, { side: opp, a: os[0], b: os[1] }];
    }
  }

  const out: KitchenLayout[] = [];
  for (const id of Object.keys(layouts) as KitchenLayout["id"][]) {
    const runs = layouts[id];
    if (!runs) continue;
    let working = cleared;
    const adds: Command[] = [];
    let counter = 0, ok = true;
    for (const r of runs) {
      const w = Math.min(floor1(r.b - r.a), 4.8);
      if (w < minRun) { ok = false; break; }
      const node = itemFor(r.side, BASE_ID, 1, r.a, r.a + w);
      const p = previewNode(working, node, baseline, catalog);
      if (!p.ok) { ok = false; break; }
      working = { ...working, nodes: { ...working.nodes, [node.id]: node } };
      adds.push({ type: "add", node });
      counter += w;
      // wall units over the free wall span next to this run
      const span = r.side.wall.find(([a, b]) => b >= r.a + 0.3 && a <= r.a + w - 0.3);
      if (span) {
        const a = Math.max(r.a, span[0]), b = Math.min(r.a + w, span[1]);
        if (b - a >= 0.6) {
          const wn = itemFor(r.side, WALL_ID, 1, a, a + Math.min(floor1(b - a), 3.6));
          wn.transform = { ...wn.transform, z: 0 };
          const wp = previewNode(working, wn, baseline, catalog);
          if (wp.ok) { working = { ...working, nodes: { ...working.nodes, [wn.id]: wn } }; adds.push({ type: "add", node: wn }); }
        }
      }
    }
    if (!ok || !adds.length) continue;
    const commands: Command[] = [...old.map((o) => ({ type: "remove", id: o.id }) as Command), ...adds];
    out.push({ id, name: NAMES[id], counter: Math.round(counter * 10) / 10, commands: [{ type: "batch", label: `Kitchen: ${NAMES[id].en}`, commands }] });
  }
  return out.sort((a, b) => b.counter - a.counter);
}

/** Footprints of the items a layout would add (for drawing a preview). */
export function layoutFootprints(layout: KitchenLayout, catalog: CatalogLookup): Vec[][] {
  const polys: Vec[][] = [];
  const walk = (c: Command) => {
    if (c.type === "batch") c.commands.forEach(walk);
    else if (c.type === "add" && c.node.kind === "item") {
      const m = catalog.model(c.node.catalog);
      if (m) { const { w, d } = resolveSize(m, c.node); polys.push(footprint(c.node.transform.x, c.node.transform.y, c.node.transform.rot, w, d)); }
    }
  };
  layout.commands.forEach(walk);
  return polys;
}
