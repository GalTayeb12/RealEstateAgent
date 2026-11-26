import { baseRun, wallRun } from "./kitchen";
import { bed } from "./bed";
import { shelving } from "./shelving";
import { wardrobe } from "./wardrobe";
import { caseDoors, caseDrawers, caseMixed, tableLegs, tablePanel, wallShelf } from "./furniture";
import type { GenDims, GeneratorId, GenParams, Part } from "./types";

export * from "./types";
export const GENERATORS: Record<GeneratorId, (dims: GenDims, params: GenParams) => Part[]> = {
  "base-run": baseRun, "wall-run": wallRun, wardrobe, shelving, bed,
  "table-legs": tableLegs, "table-panel": tablePanel, "case-doors": caseDoors, "case-drawers": caseDrawers, "case-mixed": caseMixed, "wall-shelf": wallShelf,
};
export const GENERATOR_IDS = Object.keys(GENERATORS) as GeneratorId[];

export function generate(id: GeneratorId, dims: GenDims, params: GenParams = {}): Part[] {
  const g = GENERATORS[id];
  if (!g) throw new Error(`Unknown generator "${id}".`);
  return g(dims, params);
}

/** Bounding box of the parts, in the item frame. */
export function partsBounds(parts: Part[]) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of parts) {
    x0 = Math.min(x0, p.cx - p.w / 2); x1 = Math.max(x1, p.cx + p.w / 2);
    y0 = Math.min(y0, p.cy - p.h / 2); y1 = Math.max(y1, p.cy + p.h / 2);
    z0 = Math.min(z0, p.cz - p.d / 2); z1 = Math.max(z1, p.cz + p.d / 2);
  }
  return { x0, x1, y0, y1, z0, z1 };
}
