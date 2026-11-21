/**
 * Placing apartments in a building: which unit type sits at which floor and
 * position. The developer paints cells of a floor × position grid; this turns
 * the painted grid into the creates / type changes / removals on Unit rows,
 * and never touches an apartment that is already reserved or sold.
 */

export interface PlacedUnit {
  id: string;
  floor: number;
  positionIndex: number;
  unitTypeId: string;
  status: string;
}

/** One painted cell: set the type, or null to leave the cell empty. */
export interface CellEdit {
  floor: number;
  positionIndex: number;
  unitTypeId: string | null;
}

export interface PlacementPlan {
  create: { floor: number; positionIndex: number; unitTypeId: string; unitNumber: string }[];
  retype: { id: string; unitTypeId: string }[];
  remove: string[];
  /** Cells left as they are because the apartment is no longer available. */
  blocked: { floor: number; positionIndex: number; status: string }[];
}

/** "502" = floor 5, second position; "1403" = floor 14, third. Unique within a building floor. */
export function unitNumberFor(floor: number, positionIndex: number): string {
  return `${floor}${String(positionIndex + 1).padStart(2, "0")}`;
}

export function planPlacement(existing: PlacedUnit[], edits: CellEdit[]): PlacementPlan {
  const at = new Map(existing.map((u) => [`${u.floor}:${u.positionIndex}`, u]));
  const plan: PlacementPlan = { create: [], retype: [], remove: [], blocked: [] };
  const seen = new Set<string>();
  for (const e of edits) {
    const key = `${e.floor}:${e.positionIndex}`;
    if (seen.has(key)) continue; // the first edit of a cell wins
    seen.add(key);
    const cur = at.get(key);
    if (!cur) {
      if (e.unitTypeId) plan.create.push({ floor: e.floor, positionIndex: e.positionIndex, unitTypeId: e.unitTypeId, unitNumber: unitNumberFor(e.floor, e.positionIndex) });
      continue;
    }
    if (cur.unitTypeId === e.unitTypeId) continue;
    if (cur.status !== "available") { plan.blocked.push({ floor: e.floor, positionIndex: e.positionIndex, status: cur.status }); continue; }
    if (e.unitTypeId) plan.retype.push({ id: cur.id, unitTypeId: e.unitTypeId });
    else plan.remove.push(cur.id);
  }
  return plan;
}

/** Cells inside the rectangle spanned by two grid cells (inclusive), for drag selection. */
export function cellsBetween(a: { floor: number; positionIndex: number }, b: { floor: number; positionIndex: number }) {
  const out: { floor: number; positionIndex: number }[] = [];
  for (let f = Math.min(a.floor, b.floor); f <= Math.max(a.floor, b.floor); f++) {
    for (let p = Math.min(a.positionIndex, b.positionIndex); p <= Math.max(a.positionIndex, b.positionIndex); p++) out.push({ floor: f, positionIndex: p });
  }
  return out;
}
