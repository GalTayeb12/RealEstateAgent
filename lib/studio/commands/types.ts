/**
 * The command vocabulary. UI gestures, AI proposals and migrations all produce
 * these; nothing else may mutate a design document. Every command has an
 * inverse (see apply.ts), so undo/redo and "reject AI proposal" are exact.
 */
import { z } from "zod";
import { CatalogRefSchema } from "../schema/catalog";
import { DesignNode, MaterialRefSchema } from "../schema/nodes";
import { SurfaceOverride } from "../schema/document";

export type Command =
  | { type: "add"; node: DesignNode }
  | { type: "remove"; id: string }
  | { type: "duplicate"; id: string; newId: string; offset?: [number, number] }
  | { type: "move"; id: string; x: number; y: number; z?: number }
  | { type: "rotate"; id: string; rot: number }
  | { type: "setVariant"; id: string; variantId: string }
  | { type: "setModules"; id: string; modules: string[] }
  | { type: "setParams"; id: string; params: Record<string, number> }
  | { type: "setSlotMaterial"; id: string; slot: string; material: { id: string; version: number } | null }
  | { type: "setSurfaceMaterial"; surfaceId: string; material: { id: string; version: number } | null }
  | { type: "replace"; id: string; catalog: { id: string; version: number } }
  | { type: "restoreBaseline" }
  // internal inverse commands (accepted by apply, never produced by clients)
  | { type: "setNode"; node: DesignNode }
  | { type: "restoreSnapshot"; nodes: Record<string, DesignNode>; overrides: Record<string, SurfaceOverride> }
  | { type: "batch"; label?: string; commands: Command[] };

const id = z.string().min(1);
const num = z.number().finite();

export const CommandSchema: z.ZodType<Command> = z.lazy(() =>
  z.union([
    z.strictObject({ type: z.literal("add"), node: DesignNode }),
    z.strictObject({ type: z.literal("remove"), id }),
    z.strictObject({ type: z.literal("duplicate"), id, newId: id, offset: z.tuple([num, num]).optional() }),
    z.strictObject({ type: z.literal("move"), id, x: num, y: num, z: num.min(0).optional() }),
    z.strictObject({ type: z.literal("rotate"), id, rot: num }),
    z.strictObject({ type: z.literal("setVariant"), id, variantId: id }),
    z.strictObject({ type: z.literal("setModules"), id, modules: z.array(id).min(1) }),
    z.strictObject({ type: z.literal("setParams"), id, params: z.record(z.string(), num) }),
    z.strictObject({ type: z.literal("setSlotMaterial"), id, slot: id, material: MaterialRefSchema.nullable() }),
    z.strictObject({ type: z.literal("setSurfaceMaterial"), surfaceId: id, material: MaterialRefSchema.nullable() }),
    z.strictObject({ type: z.literal("replace"), id, catalog: CatalogRefSchema }),
    z.strictObject({ type: z.literal("restoreBaseline") }),
    z.strictObject({ type: z.literal("setNode"), node: DesignNode }),
    z.strictObject({
      type: z.literal("restoreSnapshot"),
      nodes: z.record(z.string(), DesignNode),
      overrides: z.record(z.string(), SurfaceOverride),
    }),
    z.strictObject({ type: z.literal("batch"), label: z.string().optional(), commands: z.array(CommandSchema).min(1).max(200) }),
  ]),
);

/** Commands a client or the AI may send (internal inverse commands excluded). */
export const PUBLIC_COMMAND_TYPES = [
  "add", "remove", "duplicate", "move", "rotate", "setVariant", "setModules", "setParams",
  "setSlotMaterial", "setSurfaceMaterial", "replace", "restoreBaseline", "batch",
] as const;

export function isPublicCommand(c: Command): boolean {
  if (!(PUBLIC_COMMAND_TYPES as readonly string[]).includes(c.type)) return false;
  return c.type === "batch" ? c.commands.every(isPublicCommand) : true;
}
