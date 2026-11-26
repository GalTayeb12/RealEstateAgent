/**
 * Catalog manifests. Data-driven: adding an asset or material means adding a
 * manifest, never application code. Published (id, version) pairs are
 * immutable; designs pin the exact version they use.
 */
import { z } from "zod";

export const STYLES = [
  "modern-minimalist", "japandi", "organic-modern", "contemporary",
  "quiet-luxury", "scandinavian", "modern-industrial",
] as const;
export type Style = (typeof STYLES)[number];

export const MATERIAL_CATEGORIES = [
  "paint", "wallcovering", "wallpaper", "panel", "fabric", "leather", "wood", "parquet",
  "stone", "marble", "quartz", "porcelain", "tile", "concrete", "microcement",
  "metal", "glass", "cabinet", "rug", "ceramic",
] as const;
export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];

export const ASSET_CATEGORIES = [
  "sofa", "armchair", "chair", "stool", "bed", "table", "coffee-table", "side-table", "desk",
  "wardrobe", "cabinet", "shelving", "kitchen-cabinet", "countertop", "tv-unit",
  "rug", "lamp-floor", "lamp-table", "lamp-pendant", "lamp-wall", "plant", "decor", "mirror",
  "bathroom-fixture", "outdoor",
] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export const ROOM_KINDS = [
  "living", "kitchen", "dining", "bedroom", "master", "bath", "wc", "office",
  "balcony", "entry", "corridor", "laundry", "storage", "any",
] as const;

export const GENERATOR_KINDS = ["base-run", "wall-run", "wardrobe", "shelving", "bed"] as const;

export const CAPABILITIES = ["move", "rotate", "material", "variant", "modular", "parametric", "duplicate", "remove"] as const;
export type Capability = (typeof CAPABILITIES)[number];

const pos = z.number().positive();
export const Dims = z.strictObject({ w: pos, d: pos, h: pos });
export type Dims = z.infer<typeof Dims>;

const Bilingual = z.strictObject({ he: z.string().min(1), en: z.string().min(1) });

export const License = z.strictObject({
  spdx: z.enum(["CC0-1.0", "CC-BY-4.0", "HAVENIQ-ORIGINAL", "LicenseRef-Commercial-Approved"]),
  sourceUrl: z.string().min(1),
  author: z.string().min(1),
  attributionText: z.string().optional(),
  retrievedAt: z.string().optional(),
});
export type License = z.infer<typeof License>;

export const MaterialSlot = z.strictObject({
  id: z.string().min(1),
  /** Name of the GLB material this slot controls; defaults to the slot id. */
  target: z.string().min(1).optional(),
  label: Bilingual,
  allowed: z.array(z.enum(MATERIAL_CATEGORIES)).min(1),
  default: z.strictObject({ id: z.string(), version: z.number().int().positive() }).optional(),
});
export type MaterialSlot = z.infer<typeof MaterialSlot>;

export const Placement = z.strictObject({
  /** floor-standing, hung on a wall, resting on another item, hanging from the ceiling. */
  on: z.enum(["floor", "wall", "surface", "ceiling"]),
  /**
   * Collision layer. Floor coverings (rugs) sit under furniture and never
   * collide with it; wall-mounted and ceiling items skip wall collision.
   */
  layer: z.enum(["furniture", "floor-covering", "wall-mounted", "ceiling", "decor"]).default("furniture"),
  /** Height of the item's base above the floor (wall shelves, pendants...). */
  elevation: z.number().min(0).default(0),
  /** Advisory free space around the item, metres. `front` is local +y. */
  clearance: z.strictObject({ front: z.number().min(0).default(0), back: z.number().min(0).default(0), sides: z.number().min(0).default(0) }).default({ front: 0, back: 0, sides: 0 }),
  /** Back should touch a wall when true (advisory). */
  againstWall: z.boolean().default(false),
});
export type Placement = z.infer<typeof Placement>;

// ── sizing strategies (no arbitrary non-uniform scaling, ever) ─────────────

const SizingFixed = z.strictObject({ mode: z.literal("fixed") });

const SizingVariants = z.strictObject({
  mode: z.literal("variants"),
  variants: z.array(z.strictObject({ id: z.string().min(1), label: z.string().min(1), dims: Dims })).min(1),
  defaultVariant: z.string().optional(),
});

/**
 * Modular run: modules are glued left to right. A module's `left`/`right`
 * connector is a type tag; neighbours must carry equal tags. A `null` edge is a
 * finished edge and may only appear at the ends of the run.
 */
export const Module = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(["arm", "seat", "chaise", "ottoman", "end-table"]),
  width: pos,
  depth: pos,
  left: z.string().nullable(),
  right: z.string().nullable(),
  /** Glb node name for this module inside the asset. */
  node: z.string().min(1),
});
export type Module = z.infer<typeof Module>;

const SizingModular = z.strictObject({
  mode: z.literal("modular"),
  modules: z.array(Module).min(2),
  maxModules: z.number().int().min(2).max(24).default(10),
  defaultConfig: z.array(z.string()).optional(),
});

const SizingParametric = z.strictObject({
  mode: z.literal("parametric"),
  /** Built-in geometry generator (lib/studio/catalog/generators). Without one the asset must ship a GLB and is only resized through its parameters' declared dimensions. */
  generator: z.enum(GENERATOR_KINDS).optional(),
  params: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        label: Bilingual,
        unit: z.enum(["m", "count"]),
        min: z.number(),
        max: z.number(),
        step: pos,
        default: z.number(),
        /** Which footprint dimension the parameter drives. */
        drives: z.enum(["w", "d", "h", "none"]),
      }),
    )
    .min(1),
});

export const Sizing = z.discriminatedUnion("mode", [SizingFixed, SizingVariants, SizingModular, SizingParametric]);
export type Sizing = z.infer<typeof Sizing>;

const ModelManifestBase = z.strictObject({
  type: z.literal("model"),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  version: z.number().int().positive(),
  /** Lifecycle (lib/studio/catalog/admin.ts). Missing = published (older manifests). */
  status: z.enum(["draft", "review", "published", "retired"]).optional(),
  name: Bilingual,
  category: z.enum(ASSET_CATEGORIES),
  styles: z.array(z.enum(STYLES)).min(1),
  rooms: z.array(z.enum(ROOM_KINDS)).min(1),
  /**
   * What the GLB's UV coordinates mean. "metres": 1 UV unit = 1 m of surface, so slot materials can be
   * tiled at their real-world tile size. "atlas": 0..1 unwrap (scanned / marketplace assets): slots take
   * colour, roughness and metalness only.
   */
  uvUnits: z.enum(["metres", "atlas"]).default("atlas"),
  /** Real-world default size, metres. Modular/parametric assets override via sizing. */
  dims: Dims,
  sizing: Sizing,
  slots: z.array(MaterialSlot),
  placement: Placement,
  capabilities: z.array(z.enum(CAPABILITIES)).min(1),
  assets: z.strictObject({
    /** Absent for generator-built items (their geometry is created at runtime). */
    glb: z.string().min(1).optional(),
    preview: z.string().min(1),
    decal: z.string().optional(),
    lods: z.array(z.string()).optional(),
  }),
  license: License,
});
export const ModelManifest = ModelManifestBase.superRefine((m, ctx) => {
  const generated = m.sizing.mode === "parametric" && !!m.sizing.generator;
  if (!generated && !m.assets.glb) ctx.addIssue({ code: "custom", path: ["assets", "glb"], message: "a model without a generator needs a GLB" });
  if (generated && m.assets.glb) ctx.addIssue({ code: "custom", path: ["assets", "glb"], message: "a generator-built model has no GLB" });
});
export type ModelManifest = z.infer<typeof ModelManifestBase>;

export const MaterialManifest = z.strictObject({
  type: z.literal("material"),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  version: z.number().int().positive(),
  status: z.enum(["draft", "review", "published", "retired"]).optional(),
  name: Bilingual,
  category: z.enum(MATERIAL_CATEGORIES),
  styles: z.array(z.enum(STYLES)).default([]),
  /** Real-world size one texture tile covers, metres (drives UV scale). */
  tileSize: z.tuple([pos, pos]),
  pbr: z.strictObject({
    baseColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    roughness: z.number().min(0).max(1),
    metalness: z.number().min(0).max(1),
    maps: z.strictObject({
      albedo: z.string().optional(),
      normal: z.string().optional(),
      orm: z.string().optional(),
      emissive: z.string().optional(),
    }).default({}),
  }),
  license: License,
});
export type MaterialManifest = z.infer<typeof MaterialManifest>;

export type CatalogRef = { id: string; version: number };
export const CatalogRefSchema = z.strictObject({ id: z.string().min(1), version: z.number().int().positive() });

/** Resolves a pinned catalog reference; returns undefined for unknown ids/versions. */
export interface CatalogLookup {
  model(ref: CatalogRef): ModelManifest | undefined;
  material(ref: CatalogRef): MaterialManifest | undefined;
}

/** In-memory lookup over published manifests (also used by tests and the AI validator). */
export function catalogFrom(models: ModelManifest[], materials: MaterialManifest[] = []): CatalogLookup {
  const m = new Map(models.map((x) => [`${x.id}@${x.version}`, x]));
  const t = new Map(materials.map((x) => [`${x.id}@${x.version}`, x]));
  return {
    model: (r) => m.get(`${r.id}@${r.version}`),
    material: (r) => t.get(`${r.id}@${r.version}`),
  };
}
