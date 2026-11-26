/**
 * The AI designer's output vocabulary: an `AiPlan` of small, human-scale actions.
 *
 * The model never writes raw design-document nodes or ids. It returns actions that name catalog
 * entries by id, rooms by baseline id and earlier placements by a short `ref`; `compile.ts` turns
 * them deterministically into public Commands (versions pinned from the published catalog, node ids
 * minted on the server) and validates each one. An action that would reference an unknown asset,
 * leave the room, overlap something or block a door is dropped with a reason, so nothing invalid
 * reaches the client. The same schema is the input schema of the model's tool (see `claude.ts`) and
 * the output of the free dry-run planner (`dryrun.ts`).
 *
 * Units: metres in plan coordinates (x right, y "up" the plan); rotations in DEGREES, counter-
 * clockwise; an item's front faces +y at 0 degrees. Sizes come only from catalog variants, modular
 * configurations or parametric parameters: there is no scale anywhere.
 */
import { z } from "zod";

const id = z.string().min(1).max(80);
const coord = z.number().finite().min(-50).max(50);

/** Size of a catalog piece: exactly the sizing mode the catalog entry supports. */
export const AiSize = z.strictObject({
  variantId: id.optional(),
  modules: z.array(id).min(1).max(24).optional(),
  params: z.record(z.string(), z.number().finite()).optional(),
});

export const AiPlace = z.strictObject({
  op: z.literal("place"),
  /** Short local name so later actions can refer to this piece ("sofa", "bed"). */
  ref: z.string().min(1).max(32).optional(),
  catalogId: id,
  room: id,
  /**
   * against-wall: back on a free wall face of the room (the default for pieces made to stand
   * against a wall); center: free spot near the room's middle; near: next to another piece; at:
   * exactly at `at` (back-centre of the piece) and `rotation`.
   */
  placement: z.enum(["against-wall", "center", "near", "at"]).optional(),
  at: z.strictObject({ x: coord, y: coord }).optional(),
  rotation: z.number().finite().min(-720).max(720).optional(),
  near: z.strictObject({
    target: id,
    side: z.enum(["front", "left", "right", "back"]),
    /** Free gap between the two pieces, metres. */
    gap: z.number().finite().min(0).max(3).optional(),
  }).optional(),
  size: AiSize.optional(),
  /** slot id -> material catalog id. */
  materials: z.record(z.string(), id).optional(),
});

export const AiMove = z.strictObject({ op: z.literal("move"), target: id, x: coord, y: coord });
export const AiRotate = z.strictObject({ op: z.literal("rotate"), target: id, degrees: z.number().finite().min(-720).max(720) });
export const AiRemove = z.strictObject({ op: z.literal("remove"), target: id });
export const AiSetMaterial = z.strictObject({ op: z.literal("setMaterial"), target: id, slot: id, materialId: id });
export const AiSetSurface = z.strictObject({
  op: z.literal("setSurface"),
  room: id,
  surface: z.enum(["walls", "floor", "ceiling"]),
  materialId: id,
});
export const AiResize = z.strictObject({ op: z.literal("resize"), target: id, size: AiSize });
export const AiKitchen = z.strictObject({
  op: z.literal("kitchenLayout"),
  room: id,
  layout: z.enum(["single", "galley", "l-shape", "u-shape", "best"]),
});

export const AiAction = z.discriminatedUnion("op", [AiPlace, AiMove, AiRotate, AiRemove, AiSetMaterial, AiSetSurface, AiResize, AiKitchen]);
export type AiAction = z.infer<typeof AiAction>;

export const AiPlanSchema = z.strictObject({
  /** One or two sentences for the user, in the user's language. */
  summary: z.string().min(1).max(600),
  actions: z.array(AiAction).max(24),
});
export type AiPlan = z.infer<typeof AiPlanSchema>;

/** The five reference prompts (MASTER_PLAN M10 acceptance: each must yield a valid command batch). */
export const SAMPLE_PROMPTS = [
  { id: "living", en: "Furnish the living room in an organic-modern style", he: "רהט את הסלון בסגנון אורגני מודרני" },
  { id: "bedroom", en: "Set up bedroom 2 with a bed and a wardrobe", he: "סדר את חדר שינה 2 עם מיטה וארון" },
  { id: "kitchen", en: "Design an L-shaped kitchen", he: "תכנן מטבח בצורת ר" },
  { id: "warmer", en: "Make the master bedroom warmer: clay walls and an oak floor", he: "תעשה את חדר ההורים חמים יותר: קירות בגוון חימר ורצפת אלון" },
  { id: "office", en: "Turn bedroom 3 into a home office with shelving and a reading corner", he: "הפוך את חדר שינה 3 לחדר עבודה עם מדפים ופינת קריאה" },
] as const;
