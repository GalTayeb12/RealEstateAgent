/**
 * Default walk / dollhouse settings computed from walk.json (rooms + collision
 * boxes), optionally helped by the plan twin (room names, windows). This is
 * what a generated project starts from before anyone hand-tunes it:
 *
 * - room names: the twin's names, else guessed from the room id;
 * - stand points: the room centre (nudged off furniture), facing a window on
 *   the room's edge if it has one, else its longest open side;
 * - dollhouse: centre and bounds of all rooms;
 * - minimap: the plan image's extent, framed around the dollhouse centre.
 */
import { ROOM_NAMES as TYPE_NAMES, ROOM_TYPES, type PlanTwin, type RoomType, alongWall } from "@/lib/twin/schema";
import { cleanName } from "@/lib/twin/labels";
import type { Bilingual, DollhouseConfig, Rect, Stand, WalkConfig, WalkRoom } from "./types";

/** A segment on the plan, e.g. a window: [[x1, y1], [x2, y2]]. */
export type Segment = [[number, number], [number, number]];

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const BODY = 0.3;   // clearance around the stand point, metres
const EDGE_TOL = 0.2; // how far off a room edge a wall box or window may sit and still count as on it

/** Bilingual name guessed from a room id: "bed2" → "חדר שינה 2", "master" → "יחידת הורים". */
export function guessRoomName(id: string): Bilingual {
  const m = /^([a-z]+?)[-_]?(\d+)?$/i.exec(id);
  const word = (m?.[1] ?? id).toLowerCase();
  const num = m?.[2];
  const alias: Record<string, RoomType> = { bed: "bedroom", bedroom: "bedroom", hall: "corridor", hallway: "corridor", lounge: "living", toilet: "wc", shower: "bath", bathroom: "bath", terrace: "balcony", safe: "mamad" };
  const type = (ROOM_TYPES as readonly string[]).includes(word) ? (word as RoomType) : alias[word];
  const base = type ? TYPE_NAMES[type] : TYPE_NAMES.other;
  return num ? { he: `${base.he} ${num}`, en: `${base.en} ${num}` } : { ...base };
}

/** Yaw that looks from the room centre toward a side: forward = (-sin yaw, cos yaw). */
const SIDE_YAW = { s: Math.PI, n: 0, w: Math.PI / 2, e: -Math.PI / 2 } as const;
type Side = keyof typeof SIDE_YAW;

/** Length of [a1, a2] not covered by any of the intervals. */
function uncovered(a1: number, a2: number, cover: [number, number][]): number {
  const iv = cover.map(([p, q]) => [Math.max(a1, Math.min(p, q)), Math.min(a2, Math.max(p, q))] as [number, number])
    .filter(([p, q]) => q > p).sort((u, v) => u[0] - v[0]);
  let covered = 0, end = a1;
  for (const [p, q] of iv) {
    if (q <= end) continue;
    covered += q - Math.max(p, end);
    end = q;
  }
  return Math.max(0, a2 - a1 - covered);
}

/** The four sides of a rect, each as its line coordinate and its span along it. */
function sides([x1, y1, x2, y2]: Rect) {
  return [
    { side: "s" as Side, horizontal: true, at: y1, a1: x1, a2: x2 },
    { side: "n" as Side, horizontal: true, at: y2, a1: x1, a2: x2 },
    { side: "w" as Side, horizontal: false, at: x1, a1: y1, a2: y2 },
    { side: "e" as Side, horizontal: false, at: x2, a1: y1, a2: y2 },
  ];
}

/** Which side of the room to face: the one with the most window on it, else the most open (not walled) length. */
export function facingSide(rect: Rect, boxes: Rect[], windows: Segment[] = []): Side {
  let best: Side = "n", bestScore = -1;
  for (const s of sides(rect)) {
    const onLine = (lo: number, hi: number) => lo - EDGE_TOL <= s.at && hi + EDGE_TOL >= s.at;
    // window length along this side
    const win = windows
      .filter(([[ax, ay], [bx, by]]) => (s.horizontal
        ? Math.abs(ay - by) < 1e-3 && Math.abs(ay - s.at) <= EDGE_TOL
        : Math.abs(ax - bx) < 1e-3 && Math.abs(ax - s.at) <= EDGE_TOL))
      .map(([[ax, ay], [bx, by]]) => (s.horizontal ? [ax, bx] : [ay, by]) as [number, number]);
    const winLen = win.length ? (s.a2 - s.a1) - uncovered(s.a1, s.a2, win) : 0;
    // thin boxes lying along this side are walls / glazing; whatever they leave is open
    const walls = boxes
      .filter(([bx1, by1, bx2, by2]) => (s.horizontal ? by2 - by1 <= 0.4 && onLine(by1, by2) : bx2 - bx1 <= 0.4 && onLine(bx1, bx2)))
      .map(([bx1, by1, bx2, by2]) => (s.horizontal ? [bx1, bx2] : [by1, by2]) as [number, number]);
    const open = uncovered(s.a1, s.a2, walls);
    // any window beats any open length
    const score = winLen > 0 ? 1000 + winLen : open;
    if (score > bestScore + 1e-6) { bestScore = score; best = s.side; }
  }
  return best;
}

const blocked = (x: number, y: number, boxes: Rect[]) =>
  boxes.some(([x1, y1, x2, y2]) => x > x1 - BODY && x < x2 + BODY && y > y1 - BODY && y < y2 + BODY);

/** Room centre, or the nearest free point to it inside the room (furniture, columns). */
export function freeSpot(rect: Rect, boxes: Rect[]): [number, number] {
  const [x1, y1, x2, y2] = rect;
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  if (!blocked(cx, cy, boxes)) return [r3(cx), r3(cy)];
  const step = 0.1;
  let best: [number, number] = [cx, cy], bestD = Infinity;
  for (let x = x1 + BODY; x <= x2 - BODY + 1e-9; x += step)
    for (let y = y1 + BODY; y <= y2 - BODY + 1e-9; y += step) {
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d < bestD && !blocked(x, y, boxes)) { bestD = d; best = [x, y]; }
    }
  return [r3(best[0]), r3(best[1])];
}

export function standFor(rect: Rect, boxes: Rect[], windows: Segment[] = []): Stand {
  const [x, y] = freeSpot(rect, boxes);
  return [x, y, r3(SIDE_YAW[facingSide(rect, boxes, windows)])];
}

export function dollhouseFor(rooms: Record<string, Rect>): DollhouseConfig {
  const rs = Object.values(rooms);
  const bounds: Rect = rs.length
    ? [Math.min(...rs.map((r) => r[0])), Math.min(...rs.map((r) => r[1])), Math.max(...rs.map((r) => r[2])), Math.max(...rs.map((r) => r[3]))]
    : [0, 0, 0, 0];
  return { center: [r3((bounds[0] + bounds[2]) / 2), r3((bounds[1] + bounds[3]) / 2)], bounds };
}

/**
 * Minimap extent for a top-down plan render of `aspect` (width / height) that
 * frames the bounds with `margin` metres each side, centred on the dollhouse centre.
 */
export function planFor(d: DollhouseConfig, image: string, aspect = 1600 / 1120, margin = 0.8): NonNullable<WalkConfig["plan"]> {
  const [x1, y1, x2, y2] = d.bounds;
  const w = Math.max(x2 - x1 + 2 * margin, (y2 - y1 + 2 * margin) * aspect);
  const h = w / aspect;
  return { image, x0: r3(d.center[0] - w / 2), yTop: r3(d.center[1] + h / 2), w: r3(w), h: r3(h) };
}

export interface WalkDefaults {
  rooms: Record<string, WalkRoom & { stand: Stand }>;
  dollhouse: DollhouseConfig;
}

/** Room names, stand points and dollhouse framing from walk.json's rooms and boxes. */
export function deriveWalkDefaults(
  walk: { rooms: Record<string, Rect>; boxes: Rect[] },
  opts: { names?: Record<string, Bilingual>; windows?: Segment[] } = {},
): WalkDefaults {
  const rooms = Object.fromEntries(Object.entries(walk.rooms).map(([id, rect]) => [id, {
    name: opts.names?.[id] ?? guessRoomName(id),
    stand: standFor(rect, walk.boxes, opts.windows),
  }]));
  return { rooms, dollhouse: dollhouseFor(walk.rooms) };
}

/** Names and window segments of a plan twin, in the form deriveWalkDefaults takes. */
export function twinHints(t: PlanTwin): { names: Record<string, Bilingual>; windows: Segment[] } {
  const walls = new Map(t.walls.map((w) => [w.id, w]));
  const windows: Segment[] = [];
  for (const o of t.openings) {
    const w = walls.get(o.wallId);
    if (!w || (o.kind !== "window" && o.kind !== "slider")) continue;
    windows.push([alongWall(w, o.at - o.width / 2), alongWall(w, o.at + o.width / 2)]);
  }
  // glazing walls are windows end to end
  for (const w of t.walls) if (w.kind === "glazing") windows.push([w.a, w.b]);
  return { names: Object.fromEntries(t.rooms.map((r) => [r.id, cleanName(r.name)])), windows };
}
