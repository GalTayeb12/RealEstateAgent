/**
 * Synthetic second plan, to prove the generators are not Yarkon-shaped: a
 * 3-room flat (living + master + mamad as the second bedroom) with an
 * L-shaped living room, an L-shaped entry hall, a kitchen behind a wide
 * passage, 30 cm concrete mamad walls, a solid facade wall with a slider and
 * windows (no curtain wall), a half-width balcony with a corner railing and a
 * 2.7 m ceiling.
 *
 *   y 9.5 ┌──────────┬──entry─┬──────┬─────────┐
 *         │ kitchen  │        │ bath │  mamad  │
 *   y 6.0 ├─ ─ ─ ─ ─ ┤  hall  ├─door─┴──door───┤ y 5.6
 *         │          │        └───────────────┤
 *   y 4.2 │  living  └──── (open) ───┬──door──┤
 *         │    (L)                   │ master │
 *   y 0   └══slider══════window══════┴─window─┘
 *         └─ balcony ─┘
 */
import type { Opening, PlanTwin, Room, Wall } from "../schema";

const H = 2.7, EXT = 0.25, INT = 0.12, MAMAD = 0.3, W = 11, D = 9.5, BAL = 1.8, BAL_W = 5.5;
const FRONT = -EXT / 2, BACK = D + EXT / 2;

const walls: Wall[] = [
  { id: "facade", a: [-EXT, FRONT], b: [W + EXT, FRONT], thickness: EXT, kind: "exterior" },
  { id: "back", a: [-EXT, BACK], b: [W + EXT, BACK], thickness: EXT, kind: "exterior" },
  { id: "west", a: [-EXT / 2, -EXT - BAL], b: [-EXT / 2, D], thickness: EXT, kind: "exterior" },
  { id: "east", a: [W + EXT / 2, 0], b: [W + EXT / 2, D], thickness: EXT, kind: "exterior" },
  { id: "rail-s", a: [0, -EXT - BAL + 0.01], b: [BAL_W, -EXT - BAL + 0.01], thickness: 0.02, kind: "railing" },
  { id: "rail-e", a: [BAL_W - 0.01, -EXT - BAL], b: [BAL_W - 0.01, -EXT], thickness: 0.02, kind: "railing" },
  { id: "kitchen-living", a: [0, 6.0], b: [4.2, 6.0], thickness: INT, kind: "interior" },
  { id: "kitchen-hall", a: [4.2, 6.0], b: [4.2, D], thickness: INT, kind: "interior" },
  { id: "hall-bath", a: [5.6, 5.6], b: [5.6, D], thickness: INT, kind: "interior" },
  { id: "hall-back", a: [5.6, 5.6], b: [W, 5.6], thickness: MAMAD, kind: "interior" },
  { id: "bath-mamad", a: [8.0, 5.6], b: [8.0, D], thickness: MAMAD, kind: "interior" },
  { id: "master-hall", a: [7.0, 4.2], b: [W, 4.2], thickness: INT, kind: "interior" },
  { id: "master-living", a: [7.0, 0], b: [7.0, 4.2], thickness: INT, kind: "interior" },
];

const o = (id: string, wallId: string, kind: Opening["kind"], from: number, to: number, sill = 0, head = 2.2): Opening => {
  const w = walls.find((x) => x.id === wallId)!;
  const start = w.a[0] === w.b[0] ? w.a[1] : w.a[0];
  return { id, wallId, kind, at: Math.round(((from + to) / 2 - start) * 1000) / 1000, width: Math.round((to - from) * 1000) / 1000, sill, head };
};

const openings: Opening[] = [
  o("slider", "facade", "slider", 1.0, 3.4, 0, 2.4),
  o("win-living", "facade", "window", 4.2, 6.4, 0.5, 2.4),
  o("win-master", "facade", "window", 8.0, 10.2, 0.9, 2.3),
  o("win-living-w", "west", "window", 4.4, 5.6, 0.9, 2.3),
  o("win-kitchen", "back", "window", 1.2, 3.0, 1.05, 2.3),
  o("win-bath", "back", "window", 6.3, 7.3, 1.5, 2.2),
  o("win-mamad", "back", "window", 9.0, 10.0, 1.0, 2.2),
  o("entry", "back", "entry", 4.45, 5.35),
  o("kitchen-pass", "kitchen-living", "opening", 0.5, 3.5, 0, 2.4),
  o("door-bath", "hall-back", "door", 6.2, 6.95),
  o("door-mamad", "hall-back", "door", 8.5, 9.3),
  o("door-master", "master-hall", "door", 7.3, 8.15),
];

const rect = (x1: number, y1: number, x2: number, y2: number): [number, number][] => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];

const rooms: Room[] = [
  { id: "living", type: "living", name: { he: "סלון ופינת אוכל", en: "Living & dining" },
    polygon: [[0, 0], [7, 0], [7, 4.2], [4.2, 4.2], [4.2, 6.0], [0, 6.0]] },
  { id: "kitchen", type: "kitchen", name: { he: "מטבח", en: "Kitchen" }, polygon: rect(0, 6.0, 4.2, D) },
  { id: "corridor", type: "corridor", name: { he: "מבואה", en: "Entry hall" },
    polygon: [[4.2, 4.2], [W, 4.2], [W, 5.6], [5.6, 5.6], [5.6, D], [4.2, D]] },
  { id: "bath", type: "bath", name: { he: "חדר רחצה", en: "Bathroom" }, polygon: rect(5.6, 5.6, 8.0, D) },
  { id: "mamad", type: "mamad", name: { he: "ממ״ד", en: "Safe room" }, polygon: rect(8.0, 5.6, W, D) },
  { id: "master", type: "master", name: { he: "חדר שינה הורים", en: "Master bedroom" }, polygon: rect(7.0, 0, W, 4.2) },
  { id: "balcony", type: "balcony", name: { he: "מרפסת", en: "Balcony" }, polygon: rect(0, -EXT - BAL, BAL_W, -EXT) },
];

export const TLV3_TWIN: PlanTwin = {
  version: 1,
  units: "m",
  source: { kind: "manual", file: "lib/twin/fixtures/tlv3.ts" },
  wallHeight: H,
  walls,
  openings,
  rooms,
  declared: { rooms: 3 },
};
