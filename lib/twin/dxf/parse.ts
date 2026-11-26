/**
 * DXF floor plan → plan twin.
 *
 * Assumes a layered architectural drawing (AIA-style names, with Hebrew and
 * common local aliases): walls drawn as pairs of face lines broken at openings,
 * door blocks on a door layer, glazing lines in window gaps, and closed room
 * boundaries with name / area text inside. Anything it cannot read becomes a
 * validator issue for the developer's review screen, never a silent guess.
 */
import { readDxf, type DxfDoc } from "./read";
import { detectRooms } from "./rooms";
import { cleanRoomLabel } from "../labels";
import { ROOM_NAMES, type Opening, type PlanTwin, type Pt, type Room, type RoomType, type Wall, bbox, pointInPolygon, polygonArea } from "../schema";

export interface LayerRules {
  wall: RegExp;
  glazing: RegExp;
  railing: RegExp;
  door: RegExp;
  room: RegExp;
}

// AIA names (A-WALL, A-DOOR, A-GLAZ), plain English, Spanish / French / German,
// Hebrew and Chinese: what real architects' files use.
export const DEFAULT_LAYERS: LayerRules = {
  railing: /RAIL|BALUSTR|BARANDA|GEL[ÄA]NDER|מעק|栏杆/i,
  glazing: /GLAZ|WIND|WIN\b|VENTANA|FENSTER|FEN[ÊE]TRE|חלון|חלונות|זיגוג|ויטרינ|窗/i,
  door: /DOOR|PUERTA|PORTE|T[ÜU]R\b|דלת|דלתות|门/i,
  wall: /WALL|MURO|PARED|\bMUR\b|WAND\b|קיר|קירות|בניה|בנייה|墙/i,
  room: /AREA|ROOM|SPACE|חדר|שטח/i,
};

/** Layers that never carry walls, even when a guess would pick them. */
const NOT_WALL = /DIM|TEXT|ANNO|NOTE|HATCH|FURN|GRID|TITLE|FRAME|BORDER|DEFPOINTS|STAIR|COTAS|HZ\b|GROUND|PUB_/i;

export interface ParseOptions {
  file?: string;
  layers?: Partial<LayerRules>;
  /**
   * Rectangle [x1, y1, x2, y2] in the drawing's own coordinates: only what is
   * inside is read. A developer's file is often a whole floor with several
   * units; this picks one.
   */
  window?: [number, number, number, number];
}

export interface ParseResult {
  twin: PlanTwin;
  /** Things the parser noticed but could not resolve (shown next to validator issues). */
  notes: string[];
}

type Seg = { a: Pt; b: Pt };

const UNIT_TO_M: Record<number, number> = { 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1 };

const len = (s: Seg) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
const unit = (s: Seg): Pt => { const L = len(s) || 1; return [(s.b[0] - s.a[0]) / L, (s.b[1] - s.a[1]) / L]; };
const isParallel = (s1: Seg, s2: Seg, tol = 0.999) => { const [a, b] = unit(s1), [c, d] = unit(s2); return Math.abs(a * c + b * d) >= tol; };
const isPerp = (s1: Seg, s2: Seg) => { const [a, b] = unit(s1), [c, d] = unit(s2); return Math.abs(a * c + b * d) <= 0.02; };
const near = (p: Pt, q: Pt, tol = 0.01) => Math.abs(p[0] - q[0]) <= tol && Math.abs(p[1] - q[1]) <= tol;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Canonical axis for a direction: unit vector with x > 0 (or y > 0 when vertical). */
function axisOf(s: Seg): Pt {
  let [ux, uy] = unit(s);
  if (ux < -1e-9 || (Math.abs(ux) <= 1e-9 && uy < 0)) { ux = -ux; uy = -uy; }
  return [ux, uy];
}
const along = (ax: Pt, p: Pt) => p[0] * ax[0] + p[1] * ax[1];
const across = (ax: Pt, p: Pt) => -p[0] * ax[1] + p[1] * ax[0];

/** Longest side of the central 98% of the given points, in drawing units (ignores stray far-away objects). */
function robustExtent(pts: [number, number][]): number | null {
  if (pts.length < 4) return null;
  const side = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor((s.length - 1) * 0.99)] - s[Math.floor((s.length - 1) * 0.01)]; };
  return Math.max(side(pts.map((p) => p[0])), side(pts.map((p) => p[1])));
}

/**
 * Metres per drawing unit. $INSUNITS is trusted only when it makes the drawing
 * a plausible size: files routinely say "mm" while drawn in metres (and the
 * other way round), and an apartment is not 3 cm wide.
 */
function scaleFor(doc: DxfDoc, extent: number | null): { k: number; units: "mm" | "cm" | "m"; note?: string } {
  const name = (k: number) => (k === 0.001 ? "mm" : k === 0.01 ? "cm" : "m") as "mm" | "cm" | "m";
  const declared = UNIT_TO_M[doc.insunits];
  const ok = (k: number) => extent !== null && extent * k >= 3 && extent * k <= 90;
  if (declared && (extent === null || ok(declared))) return { k: declared, units: name(declared) };
  if (extent !== null) {
    for (const k of [1, 0.01, 0.001]) {
      if (ok(k)) {
        return {
          k, units: name(k),
          note: declared
            ? `The file declares ${name(declared)} but the plan measures ${extent.toFixed(1)} drawing units across; read as ${name(k)} (${(extent * k).toFixed(1)} m).`
            : `The file declares no units; the plan measures ${extent.toFixed(1)} units across, read as ${name(k)}.`,
        };
      }
    }
    return {
      k: declared ?? 1, units: name(declared ?? 1),
      note: `The plan measures ${extent.toFixed(1)} drawing units across, which is not a plausible apartment in mm, cm or m. It may be a scaled print or a scan; check the scale.`,
    };
  }
  return { k: declared ?? 1, units: name(declared ?? 1) };
}

/**
 * End caps (the short line closing a wall run) look like walls of their own
 * to a naive pairer. A cap is short, joins the ends of perpendicular lines, and
 * is not collinear with any other line it doesn't touch (that would make it the
 * face of a short wall stub instead).
 */
function dropCaps(segs: Seg[], maxT: number): Seg[] {
  const keep: Seg[] = [];
  for (const s of segs) {
    if (len(s) > maxT + 0.01) { keep.push(s); continue; }
    const ends = [s.a, s.b];
    const joined = ends.every((p) => segs.some((o) => o !== s && isPerp(s, o) && (near(o.a, p) || near(o.b, p))));
    if (!joined) { keep.push(s); continue; }
    const ax = axisOf(s), off = across(ax, s.a);
    const lo = Math.min(along(ax, s.a), along(ax, s.b)), hi = Math.max(along(ax, s.a), along(ax, s.b));
    const collinearApart = segs.some((o) => {
      if (o === s || !isParallel(s, o) || Math.abs(across(ax, o.a) - off) > 0.005) return false;
      const olo = Math.min(along(ax, o.a), along(ax, o.b)), ohi = Math.max(along(ax, o.a), along(ax, o.b));
      // only a neighbour within opening range counts: caps of unrelated walls often share a line
      return (ohi < lo - 0.01 && lo - ohi <= 3.0) || (olo > hi + 0.01 && olo - hi <= 3.0);
    });
    if (collinearApart) keep.push(s);
  }
  return keep;
}

interface Piece { ax: Pt; off: number; t: number; lo: number; hi: number }

/** Pair parallel face lines [minT, maxT] apart into centre-line pieces. */
function pairFaces(segs: Seg[], minT: number, maxT: number): Piece[] {
  const out: Piece[] = [];
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const s = segs[i], o = segs[j];
      if (!isParallel(s, o)) continue;
      const ax = axisOf(s);
      const d = across(ax, o.a) - across(ax, s.a);
      const t = Math.abs(d);
      if (t < minT || t > maxT) continue;
      const lo = Math.max(Math.min(along(ax, s.a), along(ax, s.b)), Math.min(along(ax, o.a), along(ax, o.b)));
      const hi = Math.min(Math.max(along(ax, s.a), along(ax, s.b)), Math.max(along(ax, o.a), along(ax, o.b)));
      if (hi - lo < 0.02) continue;
      // another parallel line strictly between the two means they're faces of different walls
      const between = segs.some((m, k) => {
        if (k === i || k === j || !isParallel(s, m)) return false;
        const dm = across(ax, m.a) - across(ax, s.a);
        if (Math.sign(dm) !== Math.sign(d) || Math.abs(dm) < 0.005 || Math.abs(dm) > t - 0.005) return false;
        const mlo = Math.min(along(ax, m.a), along(ax, m.b)), mhi = Math.max(along(ax, m.a), along(ax, m.b));
        return Math.min(hi, mhi) - Math.max(lo, mlo) > 0.05;
      });
      if (between) continue;
      out.push({ ax, off: across(ax, s.a) + d / 2, t: Math.round(t * 200) / 200, lo, hi });
    }
  }
  return out;
}

/**
 * A wall drawn as a closed filled outline (rectangles and L-shapes of "wall
 * material") instead of two face lines. Axis-aligned outlines are cut into
 * rectangles; each rectangle is a wall piece along its long side. Returns null
 * when the outline is not such a solid (a room-sized loop, or a skewed shape),
 * so the caller reads its edges as face lines instead.
 */
function solidPieces(poly: Pt[], maxT: number): Piece[] | null {
  const n = poly.length;
  if (n < 4) return null;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    if (Math.abs(a[0] - b[0]) > 0.003 && Math.abs(a[1] - b[1]) > 0.003) return null;
  }
  const area = Math.abs(polygonArea(poly));
  let perim = 0;
  for (let i = 0; i < n; i++) perim += Math.hypot(poly[i][0] - poly[(i + 1) % n][0], poly[i][1] - poly[(i + 1) % n][1]);
  if (!(area > 0) || (2 * area) / perim > maxT) return null;
  const uniq = (v: number[]) => [...v].sort((a, b) => a - b).filter((x, i, arr) => i === 0 || x - arr[i - 1] > 0.003);
  const xs = uniq(poly.map((p) => p[0])), ys = uniq(poly.map((p) => p[1]));
  // cells inside the outline, merged per row then vertically where the x-range matches
  const strips: { x1: number; x2: number; y1: number; y2: number }[] = [];
  for (let j = 0; j + 1 < ys.length; j++) {
    let start: number | null = null;
    for (let i = 0; i <= xs.length - 1; i++) {
      const inside = i + 1 < xs.length && pointInPolygon([(xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2], poly);
      if (inside && start === null) start = i;
      if (!inside && start !== null) { strips.push({ x1: xs[start], x2: xs[i], y1: ys[j], y2: ys[j + 1] }); start = null; }
    }
  }
  const rects: typeof strips = [];
  for (const st of strips) {
    const prev = rects.find((r) => Math.abs(r.x1 - st.x1) < 0.003 && Math.abs(r.x2 - st.x2) < 0.003 && Math.abs(r.y2 - st.y1) < 0.003);
    if (prev) prev.y2 = st.y2; else rects.push({ ...st });
  }
  return rects.map((r) => {
    const horizontal = r.x2 - r.x1 >= r.y2 - r.y1;
    const ax: Pt = horizontal ? [1, 0] : [0, 1];
    const c: Pt = [(r.x1 + r.x2) / 2, (r.y1 + r.y2) / 2];
    const t = horizontal ? r.y2 - r.y1 : r.x2 - r.x1;
    return { ax, off: across(ax, c), t: Math.round(t * 200) / 200, lo: horizontal ? r.x1 : r.y1, hi: horizontal ? r.x2 : r.y2 };
  }).filter((q) => q.t >= 0.04 && q.hi - q.lo >= 0.04);
}

interface Run { ax: Pt; off: number; t: number; lo: number; hi: number; gaps: [number, number][] }

/** Merge collinear pieces into runs; short holes are filled, holes up to 3 m become candidate openings. */
function mergeRuns(pieces: Piece[]): Run[] {
  const groups: Piece[][] = [];
  for (const p of pieces) {
    const g = groups.find((gr) => {
      const q = gr[0];
      return Math.abs(q.ax[0] * p.ax[0] + q.ax[1] * p.ax[1]) > 0.999 && Math.abs(q.off - p.off) < 0.02 && Math.abs(q.t - p.t) < 0.02;
    });
    if (g) g.push(p); else groups.push([p]);
  }
  const runs: Run[] = [];
  for (const gr of groups) {
    const sorted = [...gr].sort((a, b) => a.lo - b.lo);
    const spans: [number, number][] = [];
    for (const p of sorted) {
      const last = spans[spans.length - 1];
      if (last && p.lo <= last[1] + 0.02) last[1] = Math.max(last[1], p.hi);
      else spans.push([p.lo, p.hi]);
    }
    const { ax, off, t } = gr[0];
    let cur: Run | null = null;
    for (const [lo, hi] of spans) {
      if (cur && lo - cur.hi <= 3.0) {
        if (lo - cur.hi >= 0.3) cur.gaps.push([cur.hi, lo]);
        cur.hi = hi;
      } else {
        if (cur) runs.push(cur);
        cur = { ax, off, t, lo, hi, gaps: [] };
      }
    }
    if (cur) runs.push(cur);
  }
  return runs;
}

const ptOn = (r: Run, s: number, n = 0): Pt => [r.ax[0] * s - r.ax[1] * (r.off + n), r.ax[1] * s + r.ax[0] * (r.off + n)];

const ROOM_KEYWORDS: [RegExp, RoomType][] = [
  [/阳台|balc[oó]n|terraza/i, "balcony"],
  [/卫生间|卫|浴室|ba[ñn]o|aseo/i, "bath"],
  [/厨房|cocina/i, "kitchen"],
  [/客厅|起居室|sal[oó]n|estar/i, "living"],
  [/餐厅|comedor/i, "dining"],
  [/主卧/, "master"],
  [/卧室|书房|dormitorio|habitaci[oó]n/i, "bedroom"],
  [/מרפסת|balcony|terrace|loggia/i, "balcony"],
  [/ממ["״']?ד|mamad|safe\s*room|shelter/i, "mamad"],
  [/רחצ|אמבט|מקלחת|bath|shower/i, "bath"],
  [/שירותי|שרותי|wc|toilet|powder/i, "wc"],
  [/חדר שירות|שירות|utility/i, "laundry"],
  [/כביסה|laundry|utility/i, "laundry"],
  [/מחסן|storage|store/i, "storage"],
  [/סלון|חדר מגורים|מגורים|living|lounge|family/i, "living"],
  [/מטבח|kitchen/i, "kitchen"],
  [/פינת אוכל|dining/i, "dining"],
  // "מבואת הורים" is the lobby of the master suite, not the master bedroom
  [/מבואת\s/, "corridor"],
  [/הורים|master|parents/i, "master"],
  [/מסדרון|מבואה|פרוזדור|hall|corridor|entry|foyer|lobby/i, "corridor"],
  [/שינה|bedroom|bed\b|חדר ילדים|ילדים|עבודה|study|office/i, "bedroom"],
];
const AREA_RE = /(\d+(?:[.,]\d+)?)\s*(?:מ["״']?ר|מטר|m²|m2|sq\.?\s*m|sqm)/i;
const ROOMS_RE = /(\d+(?:[.,]\d+)?)\s*(?:חדרים|חד['׳]|rooms)/i;

/** Room type from a plan label (Hebrew or English); shared with the image parser. */
export function roomType(label: string): RoomType {
  for (const [re, t] of ROOM_KEYWORDS) if (re.test(label)) return t;
  return "other";
}

/** When one outline holds several labels (an open living area), the most important function names the room. */
const TYPE_PRIORITY: RoomType[] = ["living", "kitchen", "dining", "master", "bedroom", "mamad", "bath", "wc", "laundry", "storage", "corridor", "balcony", "other"];
export function roomTypeOfLabels(labels: string[]): RoomType {
  const types = labels.map(roomType);
  return TYPE_PRIORITY.find((t) => types.includes(t)) ?? "other";
}

export function parseDxf(src: string, opts: ParseOptions = {}): ParseResult {
  const rules = { ...DEFAULT_LAYERS, ...opts.layers };
  const doc = readDxf(src);
  const notes: string[] = [];
  const win = opts.window;
  const refOf = (e: DxfDoc["entities"][number]): [number, number] =>
    e.type === "LINE" ? [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2]
      : e.type === "POLY" ? [e.pts.reduce((s, p) => s + p[0], 0) / (e.pts.length || 1), e.pts.reduce((s, p) => s + p[1], 0) / (e.pts.length || 1)]
        : e.type === "ARC" ? e.c : e.at;
  const inWin = (e: DxfDoc["entities"][number]) => {
    if (!win) return true;
    const [x, y] = refOf(e);
    return x >= win[0] && x <= win[2] && y >= win[1] && y <= win[3];
  };
  const layers = new Set(doc.entities.map((e) => e.layer));

  // No layer matches a wall name: guess the layer that looks like walls (many axis-aligned segments).
  let guessedWall: string | null = null;
  if (![...layers].some((l) => rules.wall.test(l))) {
    const score = new Map<string, { n: number; axis: number }>();
    for (const e of doc.entities) {
      if (e.type !== "LINE" && e.type !== "POLY") continue;
      if (NOT_WALL.test(e.layer) || rules.door.test(e.layer) || rules.glazing.test(e.layer) || rules.railing.test(e.layer)) continue;
      const pts = e.type === "LINE" ? [e.a, e.b] : e.pts;
      const sc = score.get(e.layer) ?? { n: 0, axis: 0 };
      for (let i = 0; i + 1 < pts.length; i++) {
        const dx = Math.abs(pts[i + 1][0] - pts[i][0]), dy = Math.abs(pts[i + 1][1] - pts[i][1]);
        sc.n++;
        if (Math.min(dx, dy) < 0.02 * Math.max(dx, dy)) sc.axis++;
      }
      score.set(e.layer, sc);
    }
    const best = [...score].filter(([, s]) => s.n >= 20 && s.axis / s.n >= 0.6).sort((a, b) => b[1].axis - a[1].axis)[0];
    if (best) { guessedWall = best[0]; notes.push(`No layer is named like walls; "${best[0]}" looks like the walls (${best[1].axis} straight segments), read as walls.`); }
  }

  const cls = (layer: string): "railing" | "glazing" | "door" | "wall" | "room" | null =>
    rules.railing.test(layer) ? "railing" : rules.glazing.test(layer) ? "glazing" : rules.door.test(layer) ? "door"
      : rules.wall.test(layer) || layer === guessedWall ? "wall" : rules.room.test(layer) ? "room" : null;

  // units: judged on the wall geometry (else on every line), inside the window if there is one
  const wallPts: [number, number][] = [], anyPts: [number, number][] = [];
  for (const e of doc.entities) {
    if ((e.type !== "LINE" && e.type !== "POLY") || !inWin(e)) continue;
    const pts = e.type === "LINE" ? [e.a, e.b] : e.pts;
    (cls(e.layer) === "wall" ? wallPts : NOT_WALL.test(e.layer) ? [] : anyPts).push(...pts);
  }
  const sc = scaleFor(doc, robustExtent(wallPts.length ? wallPts : anyPts));
  const { k, units } = sc;
  if (sc.note) notes.push(sc.note);
  const P = ([x, y]: [number, number]): Pt => [x * k, y * k];

  const segs: Record<"wall" | "glazing" | "railing", Seg[]> = { wall: [], glazing: [], railing: [] };
  const doors: { at: Pt; block: string }[] = [];
  const arcDoors: { c: Pt; r: number; ends: [Pt, Pt] }[] = [];
  const roomPolys: Pt[][] = [];
  const solids: Piece[] = [];
  const texts: { at: Pt; text: string }[] = [];
  const ignored = new Set<string>();

  for (const e of doc.entities) {
    if (!inWin(e)) continue;
    const c = cls(e.layer);
    if (e.type === "ARC") {
      // a door swing: centre = hinge, radius = leaf width, the arc ends where the leaf closes
      if (c === "door") {
        const rad = (d: number) => (d * Math.PI) / 180;
        const ends: [Pt, Pt] = [[e.c[0] + e.r * Math.cos(rad(e.a1)), e.c[1] + e.r * Math.sin(rad(e.a1))], [e.c[0] + e.r * Math.cos(rad(e.a2)), e.c[1] + e.r * Math.sin(rad(e.a2))]];
        arcDoors.push({ c: P(e.c), r: e.r * k, ends: [P(ends[0]), P(ends[1])] });
      }
      continue;
    }
    if (e.type === "TEXT") { texts.push({ at: P(e.at), text: e.text }); continue; }
    if (e.type === "INSERT") {
      if (c === "door" || rules.door.test(e.block) || /SLID|הזזה/i.test(e.block)) doors.push({ at: P(e.at), block: e.block });
      continue;
    }
    if (c === "room") {
      if (e.type === "POLY" && e.closed && e.pts.length >= 3) {
        const pts = e.pts.map(P);
        if (near(pts[0], pts[pts.length - 1], 0.001)) pts.pop();
        roomPolys.push(pts);
      }
      continue;
    }
    if (c === "wall" || c === "glazing" || c === "railing") {
      const list = segs[c];
      if (e.type === "LINE") list.push({ a: P(e.a), b: P(e.b) });
      else if (e.type === "POLY") {
        const pts = e.pts.map(P);
        if (c === "wall" && e.closed) {
          if (near(pts[0], pts[pts.length - 1], 0.001)) pts.pop();
          const solid = solidPieces(pts, 0.6);
          if (solid) { solids.push(...solid); continue; }
          pts.push(pts[0]);
        }
        for (let i = 0; i + 1 < pts.length; i++) list.push({ a: pts[i], b: pts[i + 1] });
        if (e.closed && pts.length > 2) list.push({ a: pts[pts.length - 1], b: pts[0] });
      }
      continue;
    }
    if (c === null && !/FURN|FIXT|EQUIP|ריהוט|סניטר|כלים/i.test(e.layer)) ignored.add(e.layer);
  }
  for (const k2 of Object.keys(segs) as (keyof typeof segs)[]) segs[k2] = segs[k2].filter((s) => len(s) > 0.005);
  if (ignored.size) notes.push(`Layers not recognised (ignored): ${[...ignored].join(", ")}`);
  if (!segs.wall.length && !solids.length) {
    const texts0 = doc.entities.filter((e) => e.type === "TEXT").length;
    notes.push(layers.size <= 2 && texts0 === 0
      ? "No wall layer and no text: this looks like a scan converted to lines, not a CAD plan. Upload it as a PDF or an image (read by Claude), or ask the architect for the original DXF."
      : "No wall lines found: check the wall layer names.");
  }

  // ── walls ──
  const wallRuns = mergeRuns([...pairFaces(dropCaps(segs.wall, 0.45), 0.05, 0.45), ...solids]);

  // Door swings drawn as arcs: the opening is the stretch of wall the leaf closes over.
  // Walls are often drawn unbroken with the door symbol on top, so add the gap here.
  let arcPlaced = 0;
  for (const d of arcDoors) {
    if (d.r < 0.45 || d.r > 1.4) continue;
    for (const run of wallRuns) {
      const dist = (p: Pt) => Math.abs(across(run.ax, p) - run.off);
      const band = (p: Pt) => dist(p) <= run.t / 2 + 0.12;
      const inRun = (p: Pt) => { const s = along(run.ax, p); return s >= run.lo - 0.05 && s <= run.hi + 0.05; };
      let span: [number, number] | null = null;
      if (band(d.c) && inRun(d.c)) {
        const e = d.ends.filter(band).sort((p, q) => dist(p) - dist(q))[0];
        if (e) { const s1 = along(run.ax, d.c), s2 = along(run.ax, e); span = [Math.min(s1, s2), Math.max(s1, s2)]; }
      } else {
        const e = d.ends.find((p) => band(p) && inRun(p));
        if (e) { const s = along(run.ax, e); span = [s - d.r / 2, s + d.r / 2]; }
      }
      if (!span || span[1] - span[0] < 0.4) continue;
      const lo = Math.max(span[0], run.lo), hi = Math.min(span[1], run.hi);
      if (hi - lo < 0.4) continue;
      const covered = run.gaps.some(([g1, g2]) => Math.min(hi, g2) - Math.max(lo, g1) >= (hi - lo) * 0.5);
      if (!covered) { run.gaps.push([lo, hi]); run.gaps.sort((a, b) => a[0] - b[0]); }
      doors.push({ at: ptOn(run, (lo + hi) / 2), block: "arc" });
      arcPlaced++;
      break;
    }
  }
  if (arcDoors.length) notes.push(`${arcPlaced} of ${arcDoors.length} door swings were placed on a wall.`);

  // Glazing drawn on top of an unbroken wall (the same habit as door swings): a window.
  // Cut the gap where the line lies along the wall centre.
  segs.glazing = segs.glazing.filter((s) => {
    const L = len(s);
    if (L < 0.4 || L > 4.5) return true;
    for (const run of wallRuns) {
      if (!isParallel(s, { a: ptOn(run, 0), b: ptOn(run, 1) })) continue;
      const nA = Math.abs(across(run.ax, s.a) - run.off), nB = Math.abs(across(run.ax, s.b) - run.off);
      if (nA > run.t / 2 + 0.12 || nB > run.t / 2 + 0.12) continue;
      const s1 = along(run.ax, s.a), s2 = along(run.ax, s.b);
      const lo = Math.max(Math.min(s1, s2), run.lo), hi = Math.min(Math.max(s1, s2), run.hi);
      if (hi - lo < 0.4) continue;
      const covered = run.gaps.some(([g1, g2]) => Math.min(hi, g2) - Math.max(lo, g1) >= (hi - lo) * 0.5);
      if (!covered) { run.gaps.push([lo, hi]); run.gaps.sort((a, b) => a[0] - b[0]); }
      return true; // keep it: the gap lookup below turns it into a window
    }
    return true;
  });

  // glazing lines that sit inside a wall gap are windows, the rest are glass walls
  const inGap = (p: Pt): { run: Run; gap: [number, number] } | null => {
    for (const run of wallRuns) {
      const s = along(run.ax, p), n = across(run.ax, p) - run.off;
      if (Math.abs(n) > run.t / 2 + 0.05) continue;
      const gap = run.gaps.find(([g1, g2]) => s > g1 - 0.02 && s < g2 + 0.02);
      if (gap) return { run, gap };
    }
    return null;
  };
  const windowGaps = new Set<string>();
  const freeGlass: Seg[] = [];
  for (const s of segs.glazing) {
    const mid: Pt = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2];
    const hit = inGap(mid);
    if (hit) windowGaps.add(`${wallRuns.indexOf(hit.run)}:${hit.gap[0]}`);
    else freeGlass.push(s);
  }
  const glassRuns = mergeRuns(pairFaces(freeGlass, 0.005, 0.3));
  const railRuns = mergeRuns(pairFaces(segs.railing, 0.005, 0.3));

  const walls: Wall[] = [];
  const openings: Opening[] = [];
  const all: [Run, Wall["kind"]][] = [
    ...wallRuns.map((r) => [r, r.t >= 0.2 ? "exterior" : "interior"] as [Run, Wall["kind"]]),
    ...glassRuns.map((r) => [r, "glazing"] as [Run, Wall["kind"]]),
    ...railRuns.map((r) => [r, "railing"] as [Run, Wall["kind"]]),
  ];
  for (const [run, kind] of all) {
    const id = `w${walls.length + 1}`;
    walls.push({ id, a: ptOn(run, run.lo), b: ptOn(run, run.hi), thickness: run.t, kind });
    const ri = wallRuns.indexOf(run);
    for (const [g1, g2] of run.gaps) {
      const door = doors.find((d) => {
        const s = along(run.ax, d.at), n = across(run.ax, d.at) - run.off;
        return Math.abs(n) < run.t / 2 + 0.15 && s > g1 - 0.15 && s < g2 + 0.15;
      });
      let okind: Opening["kind"];
      if (door && (kind === "glazing" || /SLID|הזזה/i.test(door.block))) okind = "slider";
      else if (door) okind = /ENTR|MAIN|כניסה|ראשית/i.test(door.block) ? "entry" : "door";
      else if (ri >= 0 && windowGaps.has(`${ri}:${g1}`)) okind = "window";
      else okind = "opening";
      openings.push({
        id: `o${openings.length + 1}`, wallId: id, kind: okind,
        at: r3((g1 + g2) / 2 - run.lo), width: r3(g2 - g1),
        sill: okind === "window" ? 0.9 : 0,
        head: okind === "window" || okind === "slider" ? 2.4 : 2.2,
      });
    }
  }

  // ── rooms ──
  if (!roomPolys.length && walls.length) {
    roomPolys.push(...detectRooms(walls));
    if (roomPolys.length) notes.push(`No room outlines in the file: ${roomPolys.length} rooms were found from the walls; check names and types.`);
  }
  if (walls.length) {
    const [bx1, by1, bx2, by2] = bbox(walls.flatMap((w) => [w.a, w.b]));
    const w = bx2 - bx1, h = by2 - by1;
    if (Math.max(w, h) > 28 || w * h > 450) {
      notes.push(`The drawing is ${w.toFixed(0)} × ${h.toFixed(0)} m, larger than one apartment: it probably shows a whole floor with several units. Select one unit (crop window) and parse again.`);
    }
  }
  const used = new Set<number>();
  const counters: Partial<Record<RoomType, number>> = {};
  const rooms: Room[] = roomPolys.map((poly) => {
    const inside = texts.map((t, i) => ({ ...t, i })).filter((t) => pointInPolygon(t.at, poly));
    inside.forEach((t) => used.add(t.i));
    const areaText = inside.find((t) => AREA_RE.test(t.text) && !/[א-תA-Za-z]{3,}/.test(t.text.replace(AREA_RE, "")));
    const nameText = inside.filter((t) => t !== areaText).map((t) => t.text).join(" ").trim();
    const type = roomTypeOfLabels(inside.filter((t) => t !== areaText).map((t) => t.text));
    const num = nameText.match(/\d+/)?.[0];
    counters[type] = (counters[type] ?? 0) + 1;
    const id = `${type}-${num ?? counters[type]}`;
    const m = areaText?.text.match(AREA_RE);
    return {
      id, type,
      name: { he: cleanRoomLabel(nameText) || ROOM_NAMES[type].he, en: ROOM_NAMES[type].en + (num && num.length <= 2 ? ` ${num}` : "") },
      polygon: poly.map(([x, y]) => [r3(x), r3(y)] as Pt),
      ...(m ? { areaDeclared: parseFloat(m[1].replace(",", ".")) } : {}),
    };
  });
  // unique ids
  const seen = new Map<string, number>();
  for (const r of rooms) { const n = seen.get(r.id) ?? 0; seen.set(r.id, n + 1); if (n) r.id = `${r.id}-${n + 1}`; }
  if (!rooms.length) notes.push("No closed room boundaries found: rooms must be marked in review.");

  // ── title block (text outside rooms) ──
  const declared: PlanTwin["declared"] = {};
  texts.forEach((t, i) => {
    if (used.has(i)) return;
    const a = t.text.match(AREA_RE), n = t.text.match(ROOMS_RE);
    if (a && /מרפסת|balcony|terrace/i.test(t.text)) declared.balconyArea = parseFloat(a[1].replace(",", "."));
    else if (a && /שטח|דירה|area|apartment|net|נטו/i.test(t.text)) declared.area = parseFloat(a[1].replace(",", "."));
    if (n) declared.rooms = parseFloat(n[1].replace(",", "."));
  });

  // ── normalise: origin at the apartment's south-west corner (balconies excluded) ──
  const inner = rooms.filter((r) => r.type !== "balcony").flatMap((r) => r.polygon);
  const ref = inner.length ? inner : walls.flatMap((w) => [w.a, w.b]);
  const [ox, oy] = ref.length ? bbox(ref) : [0, 0];
  const shift = (p: Pt): Pt => [r3(p[0] - ox), r3(p[1] - oy)];
  for (const w of walls) { w.a = shift(w.a); w.b = shift(w.b); }
  for (const r of rooms) r.polygon = r.polygon.map(shift);

  return {
    twin: {
      version: 1, units: "m",
      source: { kind: "dxf", file: opts.file, sourceUnits: units },
      wallHeight: 2.8, walls, openings, rooms, declared,
    },
    notes,
  };
}
