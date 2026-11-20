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
import { ROOM_NAMES, type Opening, type PlanTwin, type Pt, type Room, type RoomType, type Wall, bbox, pointInPolygon } from "../schema";

export interface LayerRules {
  wall: RegExp;
  glazing: RegExp;
  railing: RegExp;
  door: RegExp;
  room: RegExp;
}

export const DEFAULT_LAYERS: LayerRules = {
  railing: /RAIL|מעקה/i,
  glazing: /GLAZ|WIND|WIN\b|חלון|חלונות|זיגוג|ויטרינ/i,
  door: /DOOR|דלת|דלתות/i,
  wall: /WALL|קיר|קירות|בניה|בנייה/i,
  room: /AREA|ROOM|SPACE|חדר|שטח/i,
};

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

function scaleFor(doc: DxfDoc): { k: number; units: "mm" | "cm" | "m" } {
  const k = UNIT_TO_M[doc.insunits];
  if (k) return { k, units: k === 0.001 ? "mm" : k === 0.01 ? "cm" : "m" };
  // unitless: guess from the drawing size (an apartment is ~5–40 m across)
  let span = 0;
  for (const e of doc.entities) {
    if (e.type === "LINE") span = Math.max(span, Math.abs(e.a[0] - e.b[0]), Math.abs(e.a[1] - e.b[1]));
  }
  if (span > 1000) return { k: 0.001, units: "mm" };
  if (span > 80) return { k: 0.01, units: "cm" };
  return { k: 1, units: "m" };
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
  [/מרפסת|balcony|terrace|loggia/i, "balcony"],
  [/ממ["״']?ד|mamad|safe\s*room|shelter/i, "mamad"],
  [/רחצה|אמבט|מקלחת|bath|shower/i, "bath"],
  [/שירותים|שרותים|wc|toilet|powder/i, "wc"],
  [/כביסה|laundry|utility/i, "laundry"],
  [/מחסן|storage|store/i, "storage"],
  [/מטבח|kitchen/i, "kitchen"],
  [/סלון|living|lounge|family/i, "living"],
  [/פינת אוכל|dining/i, "dining"],
  [/הורים|master|parents/i, "master"],
  [/מסדרון|מבואה|פרוזדור|hall|corridor|entry|foyer|lobby/i, "corridor"],
  [/שינה|bedroom|bed\b|חדר ילדים|ילדים|עבודה|study|office/i, "bedroom"],
];
const AREA_RE = /(\d+(?:[.,]\d+)?)\s*(?:מ["״']?ר|מטר|m²|m2|sq\.?\s*m|sqm)/i;
const ROOMS_RE = /(\d+(?:[.,]\d+)?)\s*(?:חדרים|חד['׳]|rooms)/i;

function roomType(label: string): RoomType {
  for (const [re, t] of ROOM_KEYWORDS) if (re.test(label)) return t;
  return "other";
}

export function parseDxf(src: string, opts: { file?: string; layers?: Partial<LayerRules> } = {}): ParseResult {
  const rules = { ...DEFAULT_LAYERS, ...opts.layers };
  const doc = readDxf(src);
  const { k, units } = scaleFor(doc);
  const notes: string[] = [];
  const P = ([x, y]: [number, number]): Pt => [x * k, y * k];

  const cls = (layer: string): "railing" | "glazing" | "door" | "wall" | "room" | null =>
    rules.railing.test(layer) ? "railing" : rules.glazing.test(layer) ? "glazing" : rules.door.test(layer) ? "door"
      : rules.wall.test(layer) ? "wall" : rules.room.test(layer) ? "room" : null;

  const segs: Record<"wall" | "glazing" | "railing", Seg[]> = { wall: [], glazing: [], railing: [] };
  const doors: { at: Pt; block: string }[] = [];
  const roomPolys: Pt[][] = [];
  const texts: { at: Pt; text: string }[] = [];
  const ignored = new Set<string>();

  for (const e of doc.entities) {
    const c = cls(e.layer);
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
        for (let i = 0; i + 1 < pts.length; i++) list.push({ a: pts[i], b: pts[i + 1] });
        if (e.closed && pts.length > 2) list.push({ a: pts[pts.length - 1], b: pts[0] });
      }
      continue;
    }
    if (c === null) ignored.add(e.layer);
  }
  for (const k2 of Object.keys(segs) as (keyof typeof segs)[]) segs[k2] = segs[k2].filter((s) => len(s) > 0.005);
  if (ignored.size) notes.push(`Layers not recognised (ignored): ${[...ignored].join(", ")}`);
  if (!segs.wall.length) notes.push("No wall lines found: check the wall layer names.");

  // ── walls ──
  const wallRuns = mergeRuns(pairFaces(dropCaps(segs.wall, 0.45), 0.05, 0.45));

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
  const used = new Set<number>();
  const counters: Partial<Record<RoomType, number>> = {};
  const rooms: Room[] = roomPolys.map((poly) => {
    const inside = texts.map((t, i) => ({ ...t, i })).filter((t) => pointInPolygon(t.at, poly));
    inside.forEach((t) => used.add(t.i));
    const areaText = inside.find((t) => AREA_RE.test(t.text) && !/[א-תA-Za-z]{3,}/.test(t.text.replace(AREA_RE, "")));
    const nameText = inside.filter((t) => t !== areaText).map((t) => t.text).join(" ").trim();
    const type = roomType(nameText);
    const num = nameText.match(/\d+/)?.[0];
    counters[type] = (counters[type] ?? 0) + 1;
    const id = `${type}-${num ?? counters[type]}`;
    const m = areaText?.text.match(AREA_RE);
    return {
      id, type,
      name: { he: nameText || ROOM_NAMES[type].he, en: ROOM_NAMES[type].en + (num ? ` ${num}` : "") },
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
