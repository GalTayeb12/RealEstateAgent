/**
 * Plan twin → the room rectangles and collision boxes the first-person walk
 * (components/walk/ApartmentWalk.tsx, WalkData) reads. Furniture boxes are
 * added by the Blender furnishing step (scripts/blender/twin_furnish.py) and
 * merged in assembleWalk().
 */
import { type PlanTwin, type Pt, type Wall, alongWall, pointInPolygon, wallLength } from "./schema";

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

// ── whole walk.json from a twin ─────────────────────────────────────────────

const roomAt = (t: PlanTwin, p: Pt): string | null => t.rooms.find((r) => pointInPolygon(p, r.polygon))?.id ?? null;

export interface OpeningSide {
  id: string;
  kind: PlanTwin["openings"][number]["kind"];
  wallId: string;
  wallKind: Wall["kind"];
  centre: Pt;
  /** Unit vector along the wall (a → b) and its left normal. */
  along: Pt;
  normal: Pt;
  width: number;
  sill: number;
  head: number;
  thickness: number;
  /** Room on the +normal side and on the -normal side (null: outside the apartment). */
  front: string | null;
  back: string | null;
}

/** Each opening with the rooms it joins: what the shell builder and the furnisher need to know about doors. */
export function openingSides(t: PlanTwin): OpeningSide[] {
  return t.openings.map((o) => {
    const w = t.walls.find((x) => x.id === o.wallId)!;
    const L = wallLength(w) || 1;
    const along: Pt = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L];
    const normal: Pt = [-along[1], along[0]];
    const c = alongWall(w, o.at);
    const d = w.thickness / 2 + 0.15;
    return {
      id: o.id, kind: o.kind, wallId: w.id, wallKind: w.kind, centre: [r3(c[0]), r3(c[1])], along, normal,
      width: o.width, sill: o.sill, head: o.head, thickness: w.thickness,
      front: roomAt(t, [c[0] + normal[0] * d, c[1] + normal[1] * d]),
      back: roomAt(t, [c[0] - normal[0] * d, c[1] - normal[1] * d]),
    };
  });
}

/** Yaw for the walk camera so that forward = (-sin yaw, cos yaw) points along v. */
const yawOf = (v: Pt) => r3(Math.atan2(-v[0], v[1]));

/**
 * Spawn: just inside the front door, looking into the flat. Falls back to any
 * door on an exterior wall, then to the middle of the living room.
 */
export function walkSpawn(t: PlanTwin): [number, number, number] {
  const sides = openingSides(t);
  const ext = new Set(t.walls.filter((w) => w.kind === "exterior").map((w) => w.id));
  const door = sides.find((s) => s.kind === "entry") ??
    sides.find((s) => s.kind === "door" && ext.has(s.wallId) && (!s.front || !s.back));
  if (door && (door.front || door.back)) {
    const sign = door.front ? 1 : -1;
    const n: Pt = [door.normal[0] * sign, door.normal[1] * sign];
    const d = door.thickness / 2 + 0.6;
    return [r3(door.centre[0] + n[0] * d), r3(door.centre[1] + n[1] * d), yawOf(n)];
  }
  const living = t.rooms.find((r) => r.type === "living") ?? t.rooms[0];
  const [x1, y1, x2, y2] = roomRect(living.polygon);
  return [r3((x1 + x2) / 2), r3((y1 + y2) / 2), 0];
}

/** Reflection probe per indoor room: middle of its walk rectangle, 1.4 m up (above beds and counters). */
export function walkProbes(t: PlanTwin): Record<string, [number, number, number]> {
  const out: Record<string, [number, number, number]> = {};
  for (const r of t.rooms) {
    if (r.type === "balcony") continue; // the walk lights balconies with the sky
    const [x1, y1, x2, y2] = roomRect(r.polygon);
    out[r.id] = [r3((x1 + x2) / 2), r3((y1 + y2) / 2), 1.4];
  }
  return out;
}

/** Everything walk.json needs that comes from the plan alone (no Blender); also the Blender builders' input. */
export function walkLayout(t: PlanTwin) {
  const { boxes, skipped } = wallBoxes(t);
  return {
    rooms: walkRooms(t),
    roomTypes: Object.fromEntries(t.rooms.map((r) => [r.id, r.type])),
    wallBoxes: boxes,
    skippedWalls: skipped,
    probeAt: walkProbes(t),
    spawn: walkSpawn(t),
    openings: openingSides(t),
  };
}
export type WalkLayout = ReturnType<typeof walkLayout>;

/** The shape components/walk/ApartmentWalk.tsx loads (WalkData). */
export interface WalkJson {
  lightmaps: { A: number; B: number };
  probes: Record<string, number>;
  sky: number;
  skyRot: number;
  probeAt: Record<string, [number, number, number]>;
  rooms: Record<string, Rect>;
  boxes: Rect[];
  spawn: [number, number, number];
}

export interface BakeResult {
  /** lightmaps.json written by apartment_bake.py: { LM_A: {scale}, probe_<room>: {scale}, sky: {scale, rot_z} } */
  meta: Record<string, { scale: number; rot_z?: number }>;
  /** Furniture / built-in / door-leaf collision boxes measured in Blender (collision.json "boxes"). */
  furniture: Rect[];
}

/** walk.json = plan geometry from the twin + furniture boxes and light scales from the bake. */
export function assembleWalk(t: PlanTwin, bake: BakeResult): WalkJson {
  const lay = walkLayout(t);
  const probes: Record<string, number> = {};
  for (const id of Object.keys(lay.probeAt)) {
    const m = bake.meta[`probe_${id}`];
    if (m) probes[id] = m.scale;
  }
  const probeAt = Object.fromEntries(Object.entries(lay.probeAt).filter(([id]) => id in probes));
  const seen = new Set<string>();
  const boxes = [...lay.wallBoxes, ...bake.furniture.map((b) => b.map(r3) as Rect)].filter((b) => {
    const k = b.join(",");
    if (b[2] - b[0] <= 0 || b[3] - b[1] <= 0 || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return {
    lightmaps: { A: bake.meta.LM_A?.scale ?? 1, B: bake.meta.LM_B?.scale ?? 1 },
    probes,
    sky: bake.meta.sky?.scale ?? 1,
    skyRot: bake.meta.sky?.rot_z ?? 0,
    probeAt,
    rooms: lay.rooms,
    boxes,
    spawn: lay.spawn,
  };
}

/**
 * Walkability check on a finished walk.json: rasterise the boxes, grow them by
 * half the path width (a disc-shaped walker), and flood from the spawn.
 * Returns the doors / passages whose two sides are not both reachable along a
 * path at least `width` wide.
 */
export function unreachableDoors(t: PlanTwin, walk: Pick<WalkJson, "boxes" | "spawn">, width = 0.6, cell = 0.05): string[] {
  const all = t.rooms.flatMap((r) => r.polygon);
  const bx1 = Math.min(...all.map((p) => p[0])) - 0.5, by1 = Math.min(...all.map((p) => p[1])) - 0.5;
  const nx = Math.ceil((Math.max(...all.map((p) => p[0])) + 0.5 - bx1) / cell);
  const ny = Math.ceil((Math.max(...all.map((p) => p[1])) + 0.5 - by1) / cell);
  const free = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++)
      if (roomAt(t, [bx1 + (i + 0.5) * cell, by1 + (j + 0.5) * cell])) free[j * nx + i] = 1;
  // doorways through thick walls belong to no room polygon: count them as floor
  for (const o of t.openings) {
    if (!PASSABLE.has(o.kind)) continue;
    const w = t.walls.find((x) => x.id === o.wallId)!;
    const r = wallBox(w, o.at - o.width / 2, o.at + o.width / 2);
    if (!r) continue;
    for (let j = Math.max(0, Math.floor((r[1] - by1) / cell)); j <= Math.min(ny - 1, Math.floor((r[3] - by1) / cell)); j++)
      for (let i = Math.max(0, Math.floor((r[0] - bx1) / cell)); i <= Math.min(nx - 1, Math.floor((r[2] - bx1) / cell)); i++)
        free[j * nx + i] = 1;
  }
  const h = width / 2;
  for (const [x1, y1, x2, y2] of walk.boxes) {
    const i1 = Math.max(0, Math.floor((x1 - h - bx1) / cell)), i2 = Math.min(nx - 1, Math.floor((x2 + h - bx1) / cell));
    const j1 = Math.max(0, Math.floor((y1 - h - by1) / cell)), j2 = Math.min(ny - 1, Math.floor((y2 + h - by1) / cell));
    for (let j = j1; j <= j2; j++)
      for (let i = i1; i <= i2; i++) {
        const cx = bx1 + (i + 0.5) * cell, cy = by1 + (j + 0.5) * cell;
        const dx = Math.max(x1 - cx, 0, cx - x2), dy = Math.max(y1 - cy, 0, cy - y2);
        if (dx * dx + dy * dy < h * h - 1e-9) free[j * nx + i] = 0;
      }
  }
  const idx = (p: Pt) => Math.floor((p[1] - by1) / cell) * nx + Math.floor((p[0] - bx1) / cell);
  const seen = new Uint8Array(nx * ny);
  const start = idx([walk.spawn[0], walk.spawn[1]]);
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const k = stack.pop()!;
    const i = k % nx, j = (k - i) / nx;
    for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
      if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
      const n = b * nx + a;
      if (seen[n] || !free[n]) continue;
      seen[n] = 1;
      stack.push(n);
    }
  }
  const bad: string[] = [];
  for (const s of openingSides(t)) {
    if (s.kind === "window" || s.kind === "entry") continue;
    // both sides of the doorway, 0.45 m out from the wall centre line, must be reachable
    for (const [sign, room] of [[1, s.front], [-1, s.back]] as const) {
      if (!room) continue;
      const d = s.thickness / 2 + 0.45;
      if (!seen[idx([s.centre[0] + s.normal[0] * d * sign, s.centre[1] + s.normal[1] * d * sign])]) { bad.push(s.id); break; }
    }
  }
  return bad;
}
