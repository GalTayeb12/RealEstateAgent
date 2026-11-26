/**
 * Parametric generators: pure functions from resolved size + parameters to a list
 * of rounded boxes ("parts"). They know nothing about three.js, so they are unit
 * tested and run on the server (publish gates, AI validation) as well as in the
 * browser. Item frame: x centred, y up from the floor, z in [-depth, 0] with the
 * back at 0 and the front towards -z, exactly like a GLB asset.
 */
export type Part = {
  id: string;
  /** Material slot this part belongs to (slot id in the manifest). */
  slot: string;
  /** Centre of the box, metres. */
  cx: number; cy: number; cz: number;
  w: number; h: number; d: number;
  /** Edge bevel radius, metres. Never 0: a razor-sharp edge is a visual-gate failure. */
  r: number;
  /** "hardware" parts are small (handles); counted by the hardware gate. */
  kind: "body" | "front" | "top" | "hardware";
};

export type GenDims = { w: number; d: number; h: number };
export type GenParams = Record<string, number>;
export type GeneratorId = "base-run" | "wall-run" | "wardrobe" | "shelving" | "bed" | "table" | "sideboard" | "nightstand" | "dresser" | "bench" | "wall-shelf";

/** Gap between neighbouring fronts, metres (3 mm is the industry norm). */
export const GAP = 0.003;
/** Default bevel on visible edges (2 mm), and on small hardware (1 mm). */
export const BEVEL = 0.002;
export const BEVEL_SMALL = 0.001;

/** Axis-aligned box from its min corner, convenient for stacking. */
export function box(id: string, slot: string, x0: number, y0: number, z0: number, w: number, h: number, d: number, r = BEVEL, kind: Part["kind"] = "body"): Part {
  const rr = Math.max(0.0005, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  return { id, slot, cx: x0 + w / 2, cy: y0 + h / 2, cz: z0 + d / 2, w, h, d, r: rr, kind };
}

/** Splits a run of `width` into equal units near `target` wide, each within [min, max]. */
export function splitRun(width: number, target = 0.6, min = 0.4, max = 0.9): { n: number; unit: number } {
  let n = Math.max(1, Math.round(width / target));
  while (width / n > max) n++;
  while (n > 1 && width / n < min) n--;
  return { n, unit: width / n };
}
