/**
 * Plan twin -> immutable baseline entity map.
 *
 * The baseline is the semantic, read-only description of the original
 * apartment (rooms, walls, openings, paintable surfaces). Ids derive from the
 * twin ids so they stay stable across re-publishes of the same twin.
 *
 * Structural status: the twin carries no structural survey. Exterior walls and
 * glazing are treated as `protected`; every other wall is `unverified` and is
 * also never edited silently. Proposals (partitions, new openings) live in the
 * design document and are labelled as unverified concept changes.
 */
import { polygonArea, type Pt, type PlanTwin } from "@/lib/twin/schema";
import { baselineIds, type WallSide } from "../schema/ids";
import type { BaselineRef } from "../schema/document";

export type Structural = "protected" | "unverified";

export type BaselineSurface = {
  id: string;
  type: "wall" | "floor" | "ceiling";
  /** Owning baseline entity id (wall:..., room:...). */
  owner: string;
  roomId?: string;
  side?: WallSide;
  /** Room ids this surface faces (wall sides resolved by point-in-room test). */
  facesRooms: string[];
  /** Area in m^2 (walls: length * height, openings not subtracted). */
  area: number;
};

export type BaselineWall = {
  id: string;
  twinId: string;
  a: Pt;
  b: Pt;
  thickness: number;
  kind: PlanTwin["walls"][number]["kind"];
  structural: Structural;
  surfaces: [string, string];
};

export type BaselineRoom = {
  id: string;
  twinId: string;
  type: PlanTwin["rooms"][number]["type"];
  name: { he: string; en: string };
  polygon: Pt[];
  area: number;
  floor: string;
  ceiling: string;
};

export type BaselineOpening = {
  id: string;
  twinId: string;
  wallId: string;
  kind: PlanTwin["openings"][number]["kind"];
  /** Plan position of the opening centre. */
  center: Pt;
  width: number;
  sill: number;
  head: number;
};

export type Baseline = {
  /** Entity-map schema version (not the design document schema). */
  mapVersion: 1;
  twinHash: string;
  wallHeight: number;
  walls: Record<string, BaselineWall>;
  rooms: Record<string, BaselineRoom>;
  openings: Record<string, BaselineOpening>;
  surfaces: Record<string, BaselineSurface>;
};

/** Canonical JSON: sorted keys, numbers rounded to 0.1 mm, so float noise cannot change the hash. */
export function canonicalJson(v: unknown): string {
  const walk = (x: unknown): unknown => {
    if (typeof x === "number") return Math.round(x * 1e4) / 1e4;
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === "object") {
      return Object.fromEntries(
        Object.keys(x as Record<string, unknown>)
          .sort()
          .map((k) => [k, walk((x as Record<string, unknown>)[k])]),
      );
    }
    return x;
  };
  return JSON.stringify(walk(v));
}

/** cyrb53 string hash, hex. Change detection only - not a security hash. */
export function hashString(s: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

export function twinHash(twin: PlanTwin): string {
  // `source.file` can change between uploads of the same drawing; geometry decides identity.
  const { walls, openings, rooms, wallHeight } = twin;
  return hashString(canonicalJson({ walls, openings, rooms, wallHeight }));
}

function pointInPoly([x, y]: Pt, p: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i];
    const [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function baselineFromTwin(twin: PlanTwin): Baseline {
  const walls: Baseline["walls"] = {};
  const rooms: Baseline["rooms"] = {};
  const openings: Baseline["openings"] = {};
  const surfaces: Baseline["surfaces"] = {};

  for (const r of twin.rooms) {
    const id = baselineIds.room(r.id);
    const floor = baselineIds.floor(r.id);
    const ceiling = baselineIds.ceiling(r.id);
    const area = polygonArea(r.polygon);
    rooms[id] = { id, twinId: r.id, type: r.type, name: r.name, polygon: r.polygon, area, floor, ceiling };
    surfaces[floor] = { id: floor, type: "floor", owner: id, roomId: id, facesRooms: [id], area };
    surfaces[ceiling] = { id: ceiling, type: "ceiling", owner: id, roomId: id, facesRooms: [id], area };
  }

  for (const w of twin.walls) {
    const id = baselineIds.wall(w.id);
    const sa = baselineIds.wallSurface(w.id, "a");
    const sb = baselineIds.wallSurface(w.id, "b");
    walls[id] = {
      id, twinId: w.id, a: w.a, b: w.b, thickness: w.thickness, kind: w.kind,
      structural: w.kind === "exterior" || w.kind === "glazing" ? "protected" : "unverified",
      surfaces: [sa, sb],
    };
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    const mx = (w.a[0] + w.b[0]) / 2;
    const my = (w.a[1] + w.b[1]) / 2;
    const nx = len ? -(w.b[1] - w.a[1]) / len : 0;
    const ny = len ? (w.b[0] - w.a[0]) / len : 0;
    const probe = w.thickness / 2 + 0.15;
    for (const [sid, side, sign] of [[sa, "a", 1], [sb, "b", -1]] as const) {
      const p: Pt = [mx + nx * probe * sign, my + ny * probe * sign];
      const faces = twin.rooms.filter((r) => pointInPoly(p, r.polygon)).map((r) => baselineIds.room(r.id));
      surfaces[sid] = { id: sid, type: "wall", owner: id, side, facesRooms: faces, area: len * twin.wallHeight };
    }
  }

  for (const o of twin.openings) {
    const w = twin.walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1;
    const center: Pt = [w.a[0] + ((w.b[0] - w.a[0]) * o.at) / len, w.a[1] + ((w.b[1] - w.a[1]) * o.at) / len];
    const id = baselineIds.opening(o.id);
    openings[id] = { id, twinId: o.id, wallId: baselineIds.wall(w.id), kind: o.kind, center, width: o.width, sill: o.sill, head: o.head };
  }

  return { mapVersion: 1, twinHash: twinHash(twin), wallHeight: twin.wallHeight, walls, rooms, openings, surfaces };
}

export function baselineRef(id: string, version: number, baseline: Baseline): BaselineRef {
  return { id, version, twinHash: baseline.twinHash };
}

/** Which room a plan point is in (first match), or undefined. */
export function roomAtPoint(baseline: Baseline, p: Pt): BaselineRoom | undefined {
  return Object.values(baseline.rooms).find((r) => pointInPoly(p, r.polygon));
}
