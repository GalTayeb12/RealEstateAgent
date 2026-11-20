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
import { ProjectExperience, type Bilingual, type Rect } from "./types";

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
  });
}
