/**
 * Ground truth: the Seed Yarkon 4-room apartment as a plan twin, transcribed
 * from scripts/blender/apartment_shell.py + apartment_walk.py (the hand-built
 * model behind /walk/yarkon). The golden test writes it out as an
 * architect-style DXF, parses that back, and expects to get this again.
 */
import type { Opening, PlanTwin, Room, Wall } from "../schema";

const H = 2.8, EXT = 0.25, INT = 0.12, W = 15, D = 8.5, BAL = 2.2;
const BACK = D + EXT / 2;

const walls: Wall[] = [
  { id: "back", a: [-EXT, BACK], b: [W + EXT, BACK], thickness: EXT, kind: "exterior" },
  // side walls run on past the facade to close the balcony ends
  { id: "west", a: [-EXT / 2, -BAL], b: [-EXT / 2, D], thickness: EXT, kind: "exterior" },
  { id: "east", a: [W + EXT / 2, -BAL], b: [W + EXT / 2, D], thickness: EXT, kind: "exterior" },
  { id: "facade", a: [0, 0], b: [W, 0], thickness: 0.02, kind: "glazing" },
  { id: "rail", a: [0, -BAL + 0.01], b: [W, -BAL + 0.01], thickness: 0.02, kind: "railing" },
  { id: "bed3-front", a: [0, 4.6], b: [3.2, 4.6], thickness: INT, kind: "interior" },
  { id: "bed3-kitchen", a: [3.2, 4.6], b: [3.2, D], thickness: INT, kind: "interior" },
  { id: "kitchen-corridor", a: [7.0, 6.0], b: [7.0, D], thickness: INT, kind: "interior" },
  { id: "corridor-east", a: [8.2, 0], b: [8.2, D], thickness: INT, kind: "interior" },
  { id: "master-back", a: [8.2, 4.6], b: [W, 4.6], thickness: INT, kind: "interior" },
  { id: "bed2-bath", a: [11.2, 4.6], b: [11.2, D], thickness: INT, kind: "interior" },
];

/** [wallId, kind, from, to] in absolute plan x (or y for vertical walls). */
const gaps: [string, Opening["kind"], number, number][] = [
  ["back", "window", 0.6, 2.6],
  ["back", "window", 3.6, 4.6],
  ["back", "entry", 7.25, 8.0],
  ["back", "window", 8.8, 10.6],
  ["back", "window", 12.2, 14.4],
  ["facade", "slider", 3.0, 4.25],
  ["bed3-front", "door", 2.25, 3.1],
  ["corridor-east", "door", 3.55, 4.45],
  ["corridor-east", "door", 5.2, 6.05],
  ["master-back", "door", 11.9, 12.75],
];

const openings: Opening[] = gaps.map(([wallId, kind, from, to], i) => {
  const w = walls.find((x) => x.id === wallId)!;
  const vertical = w.a[0] === w.b[0];
  const start = vertical ? w.a[1] : w.a[0];
  return {
    id: `o${i + 1}`, wallId, kind,
    at: Math.round(((from + to) / 2 - start) * 1000) / 1000,
    width: Math.round((to - from) * 1000) / 1000,
    sill: kind === "window" ? 0.9 : 0,
    head: kind === "window" || kind === "slider" ? H : 2.2,
  };
});

const rect = (x1: number, y1: number, x2: number, y2: number): [number, number][] => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];

const rooms: Room[] = [
  { id: "living", type: "living", name: { he: "סלון ופינת אוכל", en: "Living & dining" },
    polygon: [[0, 0], [8.2, 0], [8.2, 3.4], [7.0, 3.4], [7.0, 4.6], [0, 4.6]] },
  { id: "kitchen", type: "kitchen", name: { he: "מטבח", en: "Kitchen" }, polygon: rect(3.2, 4.6, 7.0, D) },
  { id: "corridor", type: "corridor", name: { he: "מבואה ומסדרון", en: "Entry & hallway" }, polygon: rect(7.0, 3.4, 8.2, D) },
  { id: "bed3", type: "bedroom", name: { he: "חדר שינה 3", en: "Bedroom 3" }, polygon: rect(0, 4.6, 3.2, D) },
  { id: "master", type: "master", name: { he: "יחידת הורים", en: "Master bedroom" }, polygon: rect(8.2, 0, W, 4.6) },
  { id: "bed2", type: "bedroom", name: { he: "חדר שינה 2", en: "Bedroom 2" }, polygon: rect(8.2, 4.6, 11.2, D) },
  { id: "bath", type: "bath", name: { he: "חדר רחצה הורים", en: "Master bath" }, polygon: rect(11.2, 4.6, W, D) },
  { id: "balcony", type: "balcony", name: { he: "מרפסת", en: "Balcony" }, polygon: rect(0, -BAL, W, 0) },
];

export const YARKON_TWIN: PlanTwin = {
  version: 1,
  units: "m",
  source: { kind: "manual", file: "scripts/blender/apartment_shell.py" },
  wallHeight: H,
  walls,
  openings,
  rooms,
  declared: { area: 127, balconyArea: 33, rooms: 4 },
};
