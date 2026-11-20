/**
 * Plan twin — the structured, verified description of one apartment type,
 * parsed from the architect's plans. Everything downstream (plan drawing,
 * dollhouse, walkthrough, renders, collision) is generated from it.
 *
 * Coordinates are plan metres: x east, y north (into the apartment), with the
 * main facade on y = 0 by convention once normalised. Walls are centre lines
 * with a thickness; openings sit on a wall at a distance along it.
 */
import { z } from "zod";

export const Pt = z.tuple([z.number(), z.number()]);
export type Pt = z.infer<typeof Pt>;

export const WALL_KINDS = ["exterior", "interior", "glazing", "railing"] as const;
export const Wall = z.object({
  id: z.string(),
  a: Pt,
  b: Pt,
  thickness: z.number().positive(),
  kind: z.enum(WALL_KINDS),
});
export type Wall = z.infer<typeof Wall>;

export const OPENING_KINDS = ["door", "entry", "window", "slider", "opening"] as const;
export const Opening = z.object({
  id: z.string(),
  wallId: z.string(),
  kind: z.enum(OPENING_KINDS),
  /** Distance from wall.a to the opening centre, metres. */
  at: z.number(),
  width: z.number().positive(),
  /** Height above floor of the bottom / top edge (window sill / head), metres. */
  sill: z.number().min(0).default(0),
  head: z.number().positive().default(2.2),
});
export type Opening = z.infer<typeof Opening>;

export const ROOM_TYPES = [
  "living", "kitchen", "dining", "corridor", "entry", "bedroom", "master",
  "mamad", "bath", "wc", "laundry", "storage", "balcony", "other",
] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

export const Room = z.object({
  id: z.string(),
  type: z.enum(ROOM_TYPES),
  name: z.object({ he: z.string(), en: z.string() }),
  /** Closed polygon, counter-clockwise or clockwise, no repeated last point. */
  polygon: z.array(Pt).min(3),
  /** Area written on the plan, if any (m²). */
  areaDeclared: z.number().positive().optional(),
});
export type Room = z.infer<typeof Room>;

export const PlanTwin = z.object({
  version: z.literal(1),
  units: z.literal("m"),
  source: z.object({
    kind: z.enum(["dxf", "pdf", "image", "manual"]),
    file: z.string().optional(),
    /** Unit the source file was drawn in, before conversion to metres. */
    sourceUnits: z.enum(["mm", "cm", "m"]).optional(),
  }),
  wallHeight: z.number().positive().default(2.8),
  walls: z.array(Wall),
  openings: z.array(Opening),
  rooms: z.array(Room),
  declared: z
    .object({ area: z.number().positive().optional(), balconyArea: z.number().positive().optional(), rooms: z.number().positive().optional() })
    .default({}),
});
export type PlanTwin = z.infer<typeof PlanTwin>;

// ── geometry helpers shared by the parser, validator and generators ─────────

export function polygonArea(p: Pt[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

export function bbox(p: Pt[]): [number, number, number, number] {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const [x, y] of p) {
    x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y);
  }
  return [x1, y1, x2, y2];
}

export function wallLength(w: Wall): number {
  return Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
}

/** Point at distance t along the wall from a. */
export function alongWall(w: Wall, t: number): Pt {
  const L = wallLength(w) || 1;
  return [w.a[0] + ((w.b[0] - w.a[0]) * t) / L, w.a[1] + ((w.b[1] - w.a[1]) * t) / L];
}

export function pointInPolygon([x, y]: Pt, p: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Default bilingual names per room type (the parser overrides from plan labels). */
export const ROOM_NAMES: Record<RoomType, { he: string; en: string }> = {
  living: { he: "סלון", en: "Living room" },
  kitchen: { he: "מטבח", en: "Kitchen" },
  dining: { he: "פינת אוכל", en: "Dining" },
  corridor: { he: "מסדרון", en: "Hallway" },
  entry: { he: "מבואה", en: "Entry" },
  bedroom: { he: "חדר שינה", en: "Bedroom" },
  master: { he: "יחידת הורים", en: "Master bedroom" },
  mamad: { he: "ממ״ד", en: "Safe room" },
  bath: { he: "חדר רחצה", en: "Bathroom" },
  wc: { he: "שירותים", en: "WC" },
  laundry: { he: "חדר כביסה", en: "Laundry" },
  storage: { he: "מחסן", en: "Storage" },
  balcony: { he: "מרפסת", en: "Balcony" },
  other: { he: "חדר", en: "Room" },
};
