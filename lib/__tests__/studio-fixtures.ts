/** Shared catalog fixtures for the studio tests. Not a test file. */
import { catalogFrom, MaterialManifest, ModelManifest } from "../studio/schema/catalog";

const license = { spdx: "HAVENIQ-ORIGINAL", sourceUrl: "https://haveniq.local/fixtures", author: "HAVENIQ" } as const;
const name = (en: string) => ({ he: en, en });
const caps = ["move", "rotate", "material", "duplicate", "remove"] as const;

const seat = (id: string, width: number) => ({ id, kind: "seat" as const, width, depth: 0.95, left: "seat", right: "seat", node: id });

export const SOFA = ModelManifest.parse({
  type: "model", id: "sofa-modular", version: 1, name: name("Modular sofa"), category: "sofa",
  styles: ["organic-modern", "quiet-luxury"], rooms: ["living"],
  dims: { w: 2.4, d: 0.95, h: 0.8 },
  sizing: {
    mode: "modular",
    modules: [
      { id: "arm-l", kind: "arm", width: 0.2, depth: 0.95, left: null, right: "seat", node: "arm-l" },
      { id: "arm-r", kind: "arm", width: 0.2, depth: 0.95, left: "seat", right: null, node: "arm-r" },
      seat("seat-80", 0.8), seat("seat-100", 1.0), seat("seat-120", 1.2),
      { id: "chaise", kind: "chaise", width: 1.6, depth: 1.6, left: "seat", right: null, node: "chaise" },
    ],
    maxModules: 8,
    defaultConfig: ["arm-l", "seat-100", "seat-100", "arm-r"],
  },
  slots: [
    { id: "upholstery", label: name("Upholstery"), allowed: ["fabric", "leather"] },
    { id: "legs", label: name("Legs"), allowed: ["metal", "wood"] },
  ],
  placement: { on: "floor", layer: "furniture", elevation: 0, clearance: { front: 0.8, back: 0, sides: 0 }, againstWall: true },
  capabilities: [...caps, "modular"],
  assets: { glb: "sofa-modular/1/model.glb", preview: "sofa-modular/1/preview.webp" },
  license,
});

export const TABLE = ModelManifest.parse({
  type: "model", id: "coffee-table-travertine", version: 1, name: name("Travertine coffee table"), category: "coffee-table",
  styles: ["organic-modern"], rooms: ["living"], dims: { w: 1.2, d: 0.6, h: 0.4 },
  sizing: { mode: "fixed" },
  slots: [{ id: "top", label: name("Top"), allowed: ["stone", "marble", "wood"] }],
  placement: { on: "floor", layer: "furniture", elevation: 0, clearance: { front: 0, back: 0, sides: 0 }, againstWall: false },
  capabilities: [...caps],
  assets: { glb: "t/1/model.glb", preview: "t/1/preview.webp" }, license,
});

export const RUG = ModelManifest.parse({
  type: "model", id: "rug-woven", version: 1, name: name("Woven rug"), category: "rug",
  styles: ["japandi"], rooms: ["living", "bedroom"], dims: { w: 2.0, d: 3.0, h: 0.02 },
  sizing: { mode: "fixed" }, slots: [],
  placement: { on: "floor", layer: "floor-covering", elevation: 0, clearance: { front: 0, back: 0, sides: 0 }, againstWall: false },
  capabilities: [...caps],
  assets: { glb: "r/1/model.glb", preview: "r/1/preview.webp" }, license,
});

export const CHAIR = ModelManifest.parse({
  type: "model", id: "dining-chair", version: 2, name: name("Dining chair"), category: "chair",
  styles: ["scandinavian"], rooms: ["dining", "living"], dims: { w: 0.5, d: 0.55, h: 0.85 },
  sizing: {
    mode: "variants",
    variants: [
      { id: "standard", label: "Standard", dims: { w: 0.5, d: 0.55, h: 0.85 } },
      { id: "bar", label: "Bar height", dims: { w: 0.5, d: 0.55, h: 1.05 } },
    ],
  },
  slots: [{ id: "seat", label: name("Seat"), allowed: ["fabric", "leather"] }],
  placement: { on: "floor", layer: "furniture", elevation: 0, clearance: { front: 0, back: 0, sides: 0 }, againstWall: false },
  capabilities: [...caps, "variant"],
  assets: { glb: "c/2/model.glb", preview: "c/2/preview.webp" }, license,
});

export const WARDROBE = ModelManifest.parse({
  type: "model", id: "wardrobe-param", version: 1, name: name("Wardrobe"), category: "wardrobe",
  styles: ["modern-minimalist"], rooms: ["bedroom"], dims: { w: 2.0, d: 0.6, h: 2.4 },
  sizing: { mode: "parametric", params: [{ id: "width", label: name("Width"), unit: "m", min: 1.0, max: 3.0, step: 0.1, default: 2.0, drives: "w" }] },
  slots: [{ id: "front", label: name("Fronts"), allowed: ["cabinet", "wood"] }],
  placement: { on: "floor", layer: "furniture", elevation: 0, clearance: { front: 0.9, back: 0, sides: 0 }, againstWall: true },
  capabilities: [...caps, "parametric"],
  assets: { glb: "w/1/model.glb", preview: "w/1/preview.webp" }, license,
});

export const SHELF = ModelManifest.parse({
  type: "model", id: "wall-shelf", version: 1, name: name("Wall shelf"), category: "shelving",
  styles: ["japandi"], rooms: ["any"], dims: { w: 0.9, d: 0.25, h: 0.04 },
  sizing: { mode: "fixed" }, slots: [],
  placement: { on: "wall", layer: "wall-mounted", elevation: 1.4, clearance: { front: 0, back: 0, sides: 0 }, againstWall: true },
  capabilities: [...caps], assets: { glb: "s/1/model.glb", preview: "s/1/preview.webp" }, license,
});

const mat = (id: string, category: string, color: string, tile: [number, number] = [1, 1]) =>
  MaterialManifest.parse({
    type: "material", id, version: 1, name: name(id), category, styles: [], tileSize: tile,
    pbr: { baseColor: color, roughness: 0.6, metalness: 0, maps: {} }, license,
  });

export const PAINT = mat("paint-limewash", "paint", "#e8e2d6");
export const PARQUET = mat("parquet-oak", "parquet", "#b08a5a", [0.2, 1.2]);
export const TRAVERTINE = mat("travertine-ivory", "stone", "#d9cdb5", [0.6, 0.6]);
export const BOUCLE = mat("boucle-cream", "fabric", "#eee7d8");
export const LEATHER = mat("leather-tan", "leather", "#8a5a3a");
export const BRASS = mat("brass-brushed", "metal", "#b08d57");

export const CATALOG = catalogFrom([SOFA, TABLE, RUG, CHAIR, WARDROBE, SHELF], [PAINT, PARQUET, TRAVERTINE, BOUCLE, LEATHER, BRASS]);
export const ref = (m: { id: string; version: number }) => ({ id: m.id, version: m.version });
