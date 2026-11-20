/**
 * Automatic checks on a plan twin, run after parsing and again after every
 * manual correction. Errors block generation; warnings go to the developer's
 * review screen. Messages are bilingual because the developer sees them.
 */
import {
  PlanTwin, type Opening, type Pt, type Room, type Wall,
  alongWall, bbox, pointInPolygon, polygonArea, wallLength,
} from "./schema";

export interface Issue {
  level: "error" | "warning" | "info";
  code: string;
  he: string;
  en: string;
  /** Room / wall / opening id the issue points at. */
  ref?: string;
}

export interface Report {
  ok: boolean;
  issues: Issue[];
  /** Net floor area per room (m², from polygons) and total excluding balconies. */
  areas: Record<string, number>;
  netArea: number;
  /** Room adjacency through doors or open boundaries. */
  links: [string, string][];
}

const PASSABLE = new Set<Opening["kind"]>(["door", "entry", "slider", "opening"]);
const MIN_PASSAGE = 0.6;
/** How far apart two room edges can be and still share a wall (wall thickness + drawing slack). */
const SHARE_TOL = 0.4;
const HABITABLE = new Set<Room["type"]>(["living", "bedroom", "master", "mamad"]);

type Seg = { a: Pt; b: Pt };
type Interval = [number, number];

function edges(p: Pt[]): Seg[] {
  return p.map((a, i) => ({ a, b: p[(i + 1) % p.length] }));
}

/** Unit direction and length of a segment. */
function dir(s: Seg): { ux: number; uy: number; L: number } {
  const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1];
  const L = Math.hypot(dx, dy) || 1;
  return { ux: dx / L, uy: dy / L, L };
}

function parallel(s1: Seg, s2: Seg, cosTol = 0.996): boolean {
  const d1 = dir(s1), d2 = dir(s2);
  return Math.abs(d1.ux * d2.ux + d1.uy * d2.uy) >= cosTol;
}

/** Signed distance of point p from the infinite line through s (normal = left of a→b). */
function lineDist(s: Seg, p: Pt): number {
  const { ux, uy } = dir(s);
  return (p[0] - s.a[0]) * -uy + (p[1] - s.a[1]) * ux;
}

/** Projection of p onto the line through s, as distance from s.a. */
function proj(s: Seg, p: Pt): number {
  const { ux, uy } = dir(s);
  return (p[0] - s.a[0]) * ux + (p[1] - s.a[1]) * uy;
}

function subtract(base: Interval[], cut: Interval): Interval[] {
  const out: Interval[] = [];
  for (const [a, b] of base) {
    if (cut[1] <= a || cut[0] >= b) { out.push([a, b]); continue; }
    if (cut[0] > a) out.push([a, cut[0]]);
    if (cut[1] < b) out.push([cut[1], b]);
  }
  return out;
}

/**
 * Length of the longest passable stretch on the boundary shared by two rooms,
 * or -1 when they share no boundary at all.
 */
function passage(r1: Room, r2: Room, walls: Wall[], openingsByWall: Map<string, Opening[]>): number {
  let best = -1;
  for (const e1 of edges(r1.polygon)) {
    for (const e2 of edges(r2.polygon)) {
      if (!parallel(e1, e2)) continue;
      const gap = Math.abs(lineDist(e1, e2.a));
      if (gap > SHARE_TOL) continue;
      const t1 = proj(e1, e2.a), t2 = proj(e1, e2.b);
      const lo = Math.max(0, Math.min(t1, t2)), hi = Math.min(dir(e1).L, Math.max(t1, t2));
      if (hi - lo < 0.05) continue;
      // reference line half-way between the two room edges
      const mid: Seg = { a: e1.a, b: e1.b };
      const off = lineDist(e1, e2.a) / 2;
      let free: Interval[] = [[lo, hi]];
      for (const w of walls) {
        const ws: Seg = { a: w.a, b: w.b };
        if (!parallel(mid, ws)) continue;
        const d = Math.abs(lineDist(mid, w.a) - off);
        if (d > w.thickness / 2 + SHARE_TOL / 2) continue;
        let blocked: Interval[] = [[Math.min(proj(mid, w.a), proj(mid, w.b)), Math.max(proj(mid, w.a), proj(mid, w.b))]];
        for (const o of openingsByWall.get(w.id) ?? []) {
          if (!PASSABLE.has(o.kind)) continue;
          const c1 = proj(mid, alongWall(w, o.at - o.width / 2)), c2 = proj(mid, alongWall(w, o.at + o.width / 2));
          blocked = blocked.flatMap((iv) => subtract([iv], [Math.min(c1, c2), Math.max(c1, c2)]));
        }
        for (const iv of blocked) free = free.flatMap((f) => subtract([f], iv));
      }
      const longest = free.reduce((m, [a, b]) => Math.max(m, b - a), 0);
      best = Math.max(best, longest);
    }
  }
  return best;
}

/** Does any wall of the given kinds (or any window/slider) run along this room's boundary? */
function hasDaylight(r: Room, walls: Wall[], openingsByWall: Map<string, Opening[]>): boolean {
  for (const e of edges(r.polygon)) {
    for (const w of walls) {
      const ws: Seg = { a: w.a, b: w.b };
      if (!parallel(e, ws)) continue;
      if (Math.abs(lineDist(e, w.a)) > w.thickness / 2 + SHARE_TOL) continue;
      const t1 = proj(e, w.a), t2 = proj(e, w.b);
      if (Math.max(t1, t2) < 0.05 || Math.min(t1, t2) > dir(e).L - 0.05) continue;
      if (w.kind === "glazing") return true;
      for (const o of openingsByWall.get(w.id) ?? []) {
        if (o.kind !== "window" && o.kind !== "slider") continue;
        const c = proj(e, alongWall(w, o.at));
        if (c > -0.05 && c < dir(e).L + 0.05) return true;
      }
    }
  }
  return false;
}

function overlapArea(a: Room, b: Room): number {
  const [ax1, ay1, ax2, ay2] = bbox(a.polygon), [bx1, by1, bx2, by2] = bbox(b.polygon);
  const x1 = Math.max(ax1, bx1), y1 = Math.max(ay1, by1), x2 = Math.min(ax2, bx2), y2 = Math.min(ay2, by2);
  if (x2 - x1 < 0.1 || y2 - y1 < 0.1) return 0;
  const step = 0.1;
  let n = 0;
  for (let x = x1 + step / 2; x < x2; x += step)
    for (let y = y1 + step / 2; y < y2; y += step)
      if (pointInPolygon([x, y], a.polygon) && pointInPolygon([x, y], b.polygon)) n++;
  return n * step * step;
}

export function validateTwin(input: unknown): Report {
  const issues: Issue[] = [];
  const parsed = PlanTwin.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false, areas: {}, netArea: 0, links: [],
      issues: parsed.error.issues.map((i) => ({
        level: "error" as const, code: "schema",
        he: `מבנה הנתונים לא תקין: ${i.path.join(".")} ${i.message}`,
        en: `Invalid data: ${i.path.join(".")} ${i.message}`,
      })),
    };
  }
  const t = parsed.data;
  const add = (level: Issue["level"], code: string, he: string, en: string, ref?: string) => issues.push({ level, code, he, en, ref });

  const wallById = new Map(t.walls.map((w) => [w.id, w]));
  const openingsByWall = new Map<string, Opening[]>();
  for (const o of t.openings) {
    const w = wallById.get(o.wallId);
    if (!w) { add("error", "opening-wall", `פתח ${o.id} מחובר לקיר שלא קיים`, `Opening ${o.id} references a missing wall`, o.id); continue; }
    const L = wallLength(w);
    if (o.at - o.width / 2 < -0.02 || o.at + o.width / 2 > L + 0.02)
      add("error", "opening-range", `פתח ${o.id} חורג מאורך הקיר`, `Opening ${o.id} extends past its wall`, o.id);
    if ((o.kind === "door" || o.kind === "entry") && o.width < MIN_PASSAGE)
      add("warning", "door-narrow", `דלת ${o.id} צרה מ-60 ס״מ (${Math.round(o.width * 100)} ס״מ)`, `Door ${o.id} is narrower than 60 cm (${Math.round(o.width * 100)} cm)`, o.id);
    (openingsByWall.get(o.wallId) ?? openingsByWall.set(o.wallId, []).get(o.wallId)!).push(o);
  }
  for (const [wid, list] of openingsByWall) {
    const s = [...list].sort((a, b) => a.at - b.at);
    for (let i = 1; i < s.length; i++)
      if (s[i - 1].at + s[i - 1].width / 2 > s[i].at - s[i].width / 2 + 0.01)
        add("error", "opening-overlap", `פתחים חופפים על קיר ${wid}`, `Overlapping openings on wall ${wid}`, s[i].id);
  }

  // areas
  const areas: Record<string, number> = {};
  let netArea = 0;
  for (const r of t.rooms) {
    const a = polygonArea(r.polygon);
    areas[r.id] = Math.round(a * 100) / 100;
    if (r.type !== "balcony") netArea += a;
    if (a < 1) add("warning", "room-tiny", `${r.name.he}: שטח קטן מ-1 מ״ר`, `${r.name.en}: smaller than 1 m²`, r.id);
    if (r.areaDeclared && Math.abs(a - r.areaDeclared) / r.areaDeclared > 0.08)
      add("warning", "room-area", `${r.name.he}: שטח מחושב ${a.toFixed(1)} מ״ר, בתוכנית כתוב ${r.areaDeclared} מ״ר`,
        `${r.name.en}: computed ${a.toFixed(1)} m², plan says ${r.areaDeclared} m²`, r.id);
  }
  netArea = Math.round(netArea * 100) / 100;
  if (t.declared.area && netArea > t.declared.area * 1.02)
    add("warning", "total-area", `סך שטח החדרים (${netArea} מ״ר) גדול מהשטח המוצהר (${t.declared.area} מ״ר)`,
      `Room total (${netArea} m²) exceeds the declared area (${t.declared.area} m²)`);
  else if (t.declared.area && netArea < t.declared.area * 0.8)
    add("warning", "total-area", `סך שטח החדרים (${netArea} מ״ר) קטן ב-20% ומעלה מהשטח המוצהר (${t.declared.area} מ״ר); אולי חסר חדר`,
      `Room total (${netArea} m²) is 20%+ below the declared area (${t.declared.area} m²); a room may be missing`);

  // overlaps
  for (let i = 0; i < t.rooms.length; i++)
    for (let j = i + 1; j < t.rooms.length; j++) {
      const ov = overlapArea(t.rooms[i], t.rooms[j]);
      if (ov > 0.3) add("error", "room-overlap", `${t.rooms[i].name.he} ו${t.rooms[j].name.he} חופפים (${ov.toFixed(1)} מ״ר)`,
        `${t.rooms[i].name.en} and ${t.rooms[j].name.en} overlap (${ov.toFixed(1)} m²)`, t.rooms[i].id);
    }

  // connectivity
  const links: [string, string][] = [];
  const adj = new Map<string, string[]>(t.rooms.map((r) => [r.id, []]));
  for (let i = 0; i < t.rooms.length; i++)
    for (let j = i + 1; j < t.rooms.length; j++) {
      const p = passage(t.rooms[i], t.rooms[j], t.walls, openingsByWall);
      if (p >= MIN_PASSAGE) {
        links.push([t.rooms[i].id, t.rooms[j].id]);
        adj.get(t.rooms[i].id)!.push(t.rooms[j].id);
        adj.get(t.rooms[j].id)!.push(t.rooms[i].id);
      }
    }
  const entries = t.openings.filter((o) => o.kind === "entry");
  let start: Room | undefined;
  if (entries.length) {
    const o = entries[0], w = wallById.get(o.wallId);
    if (w) {
      const c = alongWall(w, o.at);
      start = t.rooms.find((r) => {
        const [x1, y1, x2, y2] = bbox(r.polygon);
        return c[0] > x1 - 0.4 && c[0] < x2 + 0.4 && c[1] > y1 - 0.4 && c[1] < y2 + 0.4;
      });
    }
  } else {
    add("warning", "no-entry", "לא סומנה דלת כניסה לדירה", "No entry door is marked");
  }
  start ??= [...t.rooms].sort((a, b) => polygonArea(b.polygon) - polygonArea(a.polygon))[0];
  if (start) {
    const seen = new Set([start.id]);
    const q = [start.id];
    while (q.length) for (const n of adj.get(q.shift()!) ?? []) if (!seen.has(n)) { seen.add(n); q.push(n); }
    for (const r of t.rooms)
      if (!seen.has(r.id))
        add("error", "room-unreachable", `${r.name.he}: אין דלת או מעבר אליו מהכניסה`, `${r.name.en}: no door or passage from the entry`, r.id);
  }

  // daylight in habitable rooms
  for (const r of t.rooms)
    if (HABITABLE.has(r.type) && !hasDaylight(r, t.walls, openingsByWall))
      add("warning", "no-window", `${r.name.he}: לא נמצא חלון`, `${r.name.en}: no window found`, r.id);

  if (t.declared.rooms !== undefined) {
    // Israeli convention: living room counts as a room, kitchen/bath/balcony do not
    const counted = t.rooms.filter((r) => ["living", "bedroom", "master", "mamad"].includes(r.type)).length;
    if (counted !== t.declared.rooms)
      add("warning", "room-count", `נספרו ${counted} חדרים, בתוכנית כתוב ${t.declared.rooms}`,
        `Counted ${counted} rooms, plan says ${t.declared.rooms}`);
  }

  return { ok: !issues.some((i) => i.level === "error"), issues, areas, netArea, links };
}
