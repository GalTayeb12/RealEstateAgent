/**
 * A project experience for a walk built from a plan twin (scripts/twin/build-worker.ts).
 *
 * Everything comes from the verified data, nothing is hand-tuned: room names
 * from the twin, stand points and dollhouse framing from walk.json
 * (deriveWalkDefaults), and the minimap from the twin's own floor-plan SVG,
 * framed exactly as lib/twin/svg.ts draws it.
 */
import type { PlanTwin } from "@/lib/twin/schema";
import { planSvgFrame } from "@/lib/twin/svg";
import { deriveWalkDefaults, twinHints } from "./derive";
import { cleanName } from "@/lib/twin/labels";
import { roomCaption } from "@/lib/tour/fromTwin";
import { ProjectExperience, type Bilingual, type Rect, type StationMeta } from "./types";

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export interface BuiltWalk {
  /** /walk/<slug> and public/projects/<slug>/ */
  slug: string;
  /** Folder of the built assets, e.g. "/walk/ut-abc". */
  base: string;
  /** walk.json written by the pack step (only rooms and boxes are read here). */
  walk: { rooms: Record<string, Rect>; boxes: Rect[] };
  twin: PlanTwin;
  /** Header of the walk, e.g. project name + unit label. */
  title: Bilingual;
  /** Other keys that resolve to this experience (unit type id, project id…). */
  aliases?: string[];
  /** The plan SVG published next to the walk assets (minimap). */
  planImage?: string;
  /**
   * Stills rendered for the building page (scripts/blender/twin_stills.py), as
   * file names inside `<base>/stills`: still-<room>.webp, top.webp, axo.webp.
   */
  stills?: string[];
}

const ROOM_ORDER = ["living", "kitchen", "dining", "master", "bedroom", "mamad", "bath", "wc", "laundry", "balcony", "corridor", "entry", "storage", "other"];

/**
 * The room tour of the building page for this apartment type: one station per
 * room that has a still (living room first), then the plan and the top-down
 * dollhouse view. No video: the stage goes straight from the apartment click
 * to the stations.
 */
export function stageFromBuild(b: BuiltWalk, rooms: string[]): ProjectExperience["photoStage"] {
  const has = new Set(b.stills ?? []);
  const url = (f: string) => `${b.base}/stills/${f}`;
  const byType = new Map(b.twin.rooms.map((r) => [r.id, r]));
  const ordered = rooms
    .filter((id) => has.has(`still-${id}.webp`))
    .sort((x, y) => ROOM_ORDER.indexOf(byType.get(x)?.type ?? "other") - ROOM_ORDER.indexOf(byType.get(y)?.type ?? "other"));
  if (!ordered.length) return undefined;
  const stations: StationMeta[] = ordered.map((id) => ({
    id, image: url(`still-${id}.webp`), title: cleanName(byType.get(id)?.name ?? { he: id, en: id }),
    ...(byType.get(id) ? { text: roomCaption(b.twin, byType.get(id)!) } : {}),
  }));
  if (has.has("top.webp")) stations.push({ id: "plan-top", image: url("top.webp"), fit: "contain", title: { he: "תוכנית הדירה", en: "Floor plan" } });
  if (has.has("axo.webp")) stations.push({ id: "plan-axo", image: url("axo.webp"), fit: "contain", view3d: true, title: { he: "הדירה במבט על", en: "The apartment from above" } });
  const first = url(`still-${ordered[0]}.webp`);
  return { aspect: 1.7778, buildings: [], enter: { window: first, room: first, walk: `/walk/${b.slug}`, stations } };
}

export function experienceFromBuild(b: BuiltWalk): ProjectExperience {
  const hints = twinHints(b.twin);
  const { rooms, dollhouse } = deriveWalkDefaults(b.walk, hints);
  const frame = planSvgFrame(b.twin);
  return ProjectExperience.parse({
    version: 1,
    slug: b.slug,
    aliases: b.aliases ?? [],
    title: b.title,
    walk: {
      base: b.base,
      rooms,
      fallbackRoom: Object.keys(b.walk.rooms)[0],
      ...(b.planImage
        ? { plan: { image: b.planImage, x0: r3(frame.x0), yTop: r3(frame.yTop), w: r3(frame.w), h: r3(frame.h) } }
        : {}),
    },
    dollhouse,
    ...(b.stills?.length ? { photoStage: stageFromBuild(b, Object.keys(b.walk.rooms)) } : {}),
  });
}
