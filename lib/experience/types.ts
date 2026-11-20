/**
 * ProjectExperience — everything the buyer-facing viewers need to show one
 * project's apartment: the building photo stage (fly-in, room stations), the
 * first-person walk and the dollhouse. One JSON per project, validated here;
 * the viewers take it as props instead of hardcoding a project.
 *
 * Coordinates are plan metres, as in the plan twin and walk.json: x east,
 * y north (into the apartment), facade on y = 0. three.js world is y-up, so
 * plan (x, y) ↔ world (x, -z). A yaw of 0 looks north (+y); forward is
 * (-sin yaw, cos yaw) in plan.
 */
import { z } from "zod";

/** Same-site absolute path, e.g. "/walk/yarkon-v2". */
const SitePath = z.string().regex(/^\/(?!\/)/, "must be a same-site path starting with /");

export const Bilingual = z.object({ he: z.string(), en: z.string() });
export type Bilingual = z.infer<typeof Bilingual>;

/** [x1, y1, x2, y2] in plan metres. */
export const Rect = z.tuple([z.number(), z.number(), z.number(), z.number()]);
export type Rect = z.infer<typeof Rect>;

/** [x, y, yaw]: a clear spot in the room and the view direction. */
export const Stand = z.tuple([z.number(), z.number(), z.number()]);
export type Stand = z.infer<typeof Stand>;

// ── building photo stage (the shape of public/buildings/*/on.json) ──────────

/**
 * bands (optional): floor boundaries as image-height fractions, from the roof
 * down to the ground, length floorCount + 1. Lets floors have real, uneven
 * heights (tall lobby, setback penthouse) instead of an even split of h.
 */
export const PhotoBox = z.object({
  x: z.number(), y: z.number(), w: z.number(), h: z.number(),
  bands: z.array(z.number()).optional(),
  /** Fly-in clip for this building; falls back to enter.video. */
  video: z.string().optional(),
  /**
   * Horizontal centre of each apartment on the facade, as fractions of the box
   * width, indexed by the unit's position on its floor. Without it a floor is
   * split evenly, left to right.
   */
  slots: z.array(z.number()).optional(),
});
export type PhotoBox = z.infer<typeof PhotoBox>;

export const StationMeta = z.object({
  id: z.string(),
  /** Still shown for this room. Omit on the first station: it is the arrival frame of the clip. */
  image: SitePath.optional(),
  title: Bilingual,
  text: Bilingual.optional(),
  /** "contain" shows the whole image on a dark backdrop (plans, axonometric cutaways). */
  fit: z.enum(["cover", "contain"]).optional(),
  /** Replace the still with the interactive dollhouse view of the walk apartment (image stays as fallback). */
  view3d: z.boolean().optional(),
});
export type StationMeta = z.infer<typeof StationMeta>;

/**
 * wide: the clip's first frame is the full building shot itself (a drone flight
 * from the hero view), so the camera does not zoom into the photo first.
 * walk: route of the first-person walk, linked from the room tour.
 */
export const EnterMeta = z.object({
  window: SitePath,
  room: SitePath,
  video: SitePath.optional(),
  wide: z.boolean().optional(),
  stations: z.array(StationMeta).optional(),
  walk: SitePath.optional(),
});
export type EnterMeta = z.infer<typeof EnterMeta>;

export const PhotoMeta = z.object({
  aspect: z.number().positive(),
  buildings: z.array(PhotoBox),
  offImage: SitePath.optional(),
  enter: EnterMeta.optional(),
});
export type PhotoMeta = z.infer<typeof PhotoMeta>;

// ── walk + dollhouse ────────────────────────────────────────────────────────

export const WalkRoom = z.object({
  name: Bilingual,
  /** Where "go to room" puts you; derived from the room rectangle when absent. */
  stand: Stand.optional(),
});
export type WalkRoom = z.infer<typeof WalkRoom>;

export const WalkConfig = z.object({
  /** Folder with apartment.glb, walk.json, lightmaps, probes and sky. */
  base: SitePath,
  /** Keyed by the room ids in walk.json. */
  rooms: z.record(z.string(), WalkRoom),
  /**
   * Areas that win over walk.json's room rectangles in "which room am I in"
   * (e.g. a hallway that cuts through a neighbouring rectangle). First match wins.
   */
  zones: z.array(z.object({ room: z.string(), rect: Rect })).default([]),
  /** Room reported when a point is in no rectangle at all. */
  fallbackRoom: z.string().optional(),
  /** Minimap: a top-down plan image and the plan-metre rectangle it shows. */
  plan: z.object({ image: SitePath, x0: z.number(), yTop: z.number(), w: z.number().positive(), h: z.number().positive() }).optional(),
  /**
   * Cut a doorway through a baked mesh that covers it: meshes named `mesh`
   * (or whose parent is) are clipped inside plan x ∈ [x1, x2], below `top` metres.
   */
  doorHoles: z.array(z.object({ mesh: z.string(), x: z.tuple([z.number(), z.number()]), top: z.number() })).default([]),
});
export type WalkConfig = z.infer<typeof WalkConfig>;

export const DollhouseConfig = z.object({
  /** Orbit target, plan metres. */
  center: z.tuple([z.number(), z.number()]),
  /** Walkable extent of the apartment (balcony included), plan metres. */
  bounds: Rect,
});
export type DollhouseConfig = z.infer<typeof DollhouseConfig>;

export const ProjectExperience = z.object({
  version: z.literal(1),
  /** URL key: /walk/{slug}; also the folder public/projects/{slug}. */
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  /** Other keys that resolve to this experience: project ids, the building photo URL. */
  aliases: z.array(z.string()).default([]),
  /** Walk header, e.g. "סיור בדירה — סיד ירקון, 4 חדרים". */
  title: Bilingual,
  walk: WalkConfig,
  dollhouse: DollhouseConfig,
  /** Building photo stage: hero image boxes, fly-in, room stations and the walk link. */
  photoStage: PhotoMeta.optional(),
});
export type ProjectExperience = z.infer<typeof ProjectExperience>;
export type ProjectExperienceInput = z.input<typeof ProjectExperience>;

/** walk.json as written by the bake pipeline (or lib/twin/walk.ts). */
export interface WalkData {
  lightmaps: { A: number; B: number };
  probes: Record<string, number>;
  sky: number;
  skyRot: number;
  probeAt: Record<string, [number, number, number]>;
  rooms: Record<string, Rect>;
  boxes: Rect[];
  spawn: [number, number, number];
}

/** Room under a plan point: zones first, then walk.json's rectangles, then the fallback. */
export function roomAt(walk: Pick<WalkConfig, "zones" | "fallbackRoom">, rooms: Record<string, Rect>, x: number, y: number): string {
  for (const { room, rect: [x1, y1, x2, y2] } of walk.zones) {
    if (x >= x1 && x <= x2 && y >= y1 && y <= y2) return room;
  }
  for (const [n, [x1, y1, x2, y2]] of Object.entries(rooms)) {
    if (x >= x1 && x <= x2 && y >= y1 && y <= y2) return n;
  }
  return walk.fallbackRoom ?? Object.keys(rooms)[0] ?? "";
}

/**
 * Lenient reader for photo-stage meta (the on.json shape): keeps whatever is
 * valid, drops bad stations or paths instead of rejecting the whole file, the
 * way BuildingPhotoStage always read it.
 */
export function readPhotoMeta(j: unknown, defaultAspect: number): PhotoMeta | null {
  const o = j as Partial<Record<keyof PhotoMeta, unknown>> | null;
  if (!o || typeof o !== "object" || !Array.isArray(o.buildings)) return null;
  const path = (v: unknown) => (typeof v === "string" && v.startsWith("/") ? v : undefined);
  const e = o.enter as Record<string, unknown> | undefined;
  const window = path(e?.window), room = path(e?.room);
  return {
    aspect: typeof o.aspect === "number" && o.aspect > 0 ? o.aspect : defaultAspect,
    buildings: o.buildings as PhotoBox[],
    offImage: path(o.offImage),
    enter: e && window && room
      ? {
          window, room,
          video: path(e.video),
          wide: e.wide === true,
          walk: path(e.walk),
          stations: Array.isArray(e.stations)
            ? (e.stations as StationMeta[]).filter((x) => x && typeof x.id === "string" && x.title && (!x.image || x.image.startsWith("/")))
            : undefined,
        }
      : undefined,
  };
}
