/**
 * Original parametric furniture (M11 catalog growth): tables, storage cases and a wall shelf.
 * Same contract as the other generators: bevelled boxes in the item frame (x centred, y up, z in
 * [-depth, 0], front towards -z), real dimensions, no scaling; 3 mm gaps between fronts and a handle
 * on every front, so they pass the same publish gates (verify.ts).
 */
import { BEVEL, BEVEL_SMALL, GAP, box, splitRun, type GenDims, type GenParams, type Part } from "./types";

const TOP = 0.03; // table top thickness
const LEG = 0.045; // square leg section
const SLAB = 0.03; // slab leg / panel thickness
const FRONT = 0.02; // door / drawer front thickness
const HANDLE_D = 0.018; // handle projection; handles end exactly at z = -depth
const RECESS = FRONT + HANDLE_D; // carcass depth = depth - RECESS

/** Table top on four square legs set in from the corners. */
export function tableLegs({ w, d, h }: GenDims): Part[] {
  const L = -w / 2, inset = Math.min(0.06, w * 0.08, d * 0.1);
  const parts: Part[] = [box("top", "top", L, h - TOP, -d, w, TOP, d, 0.004, "top")];
  const xs = [L + inset, L + w - inset - LEG], zs = [-d + inset, -inset - LEG];
  xs.forEach((x, i) => zs.forEach((z, j) => parts.push(box(`leg-${i}${j}`, "base", x, 0, z, LEG, h - TOP, LEG, BEVEL))));
  // apron under the top on long tables keeps the legs from looking stuck on
  if (w >= 1.2 && h > 0.6) {
    parts.push(box("apron-front", "base", xs[0] + LEG, h - TOP - 0.08, zs[0], xs[1] - xs[0] - LEG, 0.08, 0.02, BEVEL));
    parts.push(box("apron-back", "base", xs[0] + LEG, h - TOP - 0.08, zs[1] + LEG - 0.02, xs[1] - xs[0] - LEG, 0.08, 0.02, BEVEL));
  }
  return parts;
}

/**
 * Table top on two slab legs at the ends (desks, benches, low tables). `modesty` (0/1): a back panel
 * between the slabs for desks.
 */
export function tablePanel({ w, d, h }: GenDims, p: GenParams = {}): Part[] {
  const L = -w / 2, inset = Math.min(0.08, w * 0.08), legD = d - 0.08;
  const parts: Part[] = [
    box("top", "top", L, h - TOP, -d, w, TOP, d, 0.004, "top"),
    box("slab-l", "base", L + inset, 0, -d + 0.04, SLAB, h - TOP, legD, BEVEL),
    box("slab-r", "base", L + w - inset - SLAB, 0, -d + 0.04, SLAB, h - TOP, legD, BEVEL),
  ];
  // desks (slab tables at desk height) get the panel unless told otherwise; low tables and benches never do
  if ((p.modesty ?? (h > 0.6 ? 1 : 0)) >= 1 && h > 0.6) {
    const span = w - 2 * inset - 2 * SLAB;
    parts.push(box("modesty", "base", L + inset + SLAB, h - TOP - 0.36, -0.08, span, 0.34, 0.018, BEVEL));
  }
  return parts;
}

type FrontLayout = { kind: "door" | "drawer"; y0: number; h: number }[];

/** Storage case: carcass on legs, a grid of fronts with 3 mm gaps and a handle each. */
function storageCase({ w, d, h }: GenDims, rows: FrontLayout, colTarget: number): Part[] {
  const L = -w / 2, legH = 0.14, body = d - RECESS;
  const parts: Part[] = [box("carcass", "carcass", L, legH, -body, w, h - legH, body, BEVEL)];
  // legs set in under the carcass (never past its footprint)
  const lx = [L + 0.04, L + w - 0.04 - 0.035], lz = [-body + 0.04, -0.04 - 0.035];
  lx.forEach((x, i) => lz.forEach((z, j) => parts.push(box(`leg-${i}${j}`, "base", x, 0, z, 0.035, legH, 0.035, BEVEL))));
  let k = 0;
  for (const row of rows) {
    const { n, unit } = row.kind === "door" ? splitRun(w, colTarget, 0.3, 0.65) : splitRun(w, colTarget, 0.4, 1.0);
    for (let c = 0; c < n; c++) {
      const x0 = L + c * unit + GAP / 2, fw = unit - GAP, y0 = row.y0 + GAP / 2, fh = row.h - GAP;
      parts.push(box(`${row.kind}-${k}`, "fronts", x0, y0, -(body + FRONT), fw, fh, FRONT, BEVEL, "front"));
      if (row.kind === "drawer") {
        const hw = Math.min(0.16, fw * 0.5);
        const hy = fh > 0.2 ? y0 + fh - 0.06 : y0 + fh / 2 - 0.006;
        parts.push(box(`handle-${k}`, "handle", x0 + fw / 2 - hw / 2, hy, -d, hw, 0.012, HANDLE_D, BEVEL_SMALL, "hardware"));
      } else {
        const hh = Math.min(0.16, fh * 0.4);
        const meetsRight = n === 1 ? true : c % 2 === 0;
        const hx = meetsRight ? x0 + fw - 0.045 : x0 + 0.033;
        parts.push(box(`handle-${k}`, "handle", hx, y0 + fh - hh - 0.06, -d, 0.012, hh, HANDLE_D, BEVEL_SMALL, "hardware"));
      }
      k++;
    }
  }
  return parts;
}

/** Case with hinged doors (sideboard). */
export function caseDoors(dims: GenDims): Part[] {
  return storageCase(dims, [{ kind: "door", y0: 0.14, h: dims.h - 0.14 }], 0.5);
}

/** Case with drawers: `drawers` rows (chest of drawers, nightstand, TV unit). */
export function caseDrawers(dims: GenDims, p: GenParams = {}): Part[] {
  const rowsN = Math.max(1, Math.min(6, Math.round(p.drawers ?? 3)));
  const rh = (dims.h - 0.14) / rowsN;
  const rows: FrontLayout = Array.from({ length: rowsN }, (_, i) => ({ kind: "drawer" as const, y0: 0.14 + i * rh, h: rh }));
  return storageCase(dims, rows, 0.8);
}

/** Case with a row of shallow drawers over doors (sideboard / buffet). */
export function caseMixed(dims: GenDims): Part[] {
  const drawerH = Math.min(0.18, (dims.h - 0.14) * 0.3);
  return storageCase(dims, [
    { kind: "door", y0: 0.14, h: dims.h - 0.14 - drawerH },
    { kind: "drawer", y0: dims.h - drawerH, h: drawerH },
  ], 0.5);
}

/** Floating wall shelf: one board on a hidden cleat (the cleat is inside the board's footprint). */
export function wallShelf({ w, d, h }: GenDims): Part[] {
  return [
    box("board", "board", -w / 2, 0, -d, w, h, d, BEVEL, "top"),
  ];
}
