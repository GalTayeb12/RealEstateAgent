import { BEVEL, BEVEL_SMALL, GAP, box, splitRun, type GenDims, type Part } from "./types";

/**
 * Minimalist case furniture and tables, generated at their real size (no scaling).
 * Same conventions as the kitchen: x centred, y up from the floor, z in [-d, 0]
 * (back at 0, front towards -z); fronts 20 mm, 3 mm gaps, a handle on every front.
 */

/** Table / desk: a 30 mm top on four slim square legs set in from the corners. */
export function table({ w, d, h }: GenDims): Part[] {
  const L = -w / 2, T = 0.03, leg = 0.05, inset = Math.min(0.08, w / 8);
  const parts: Part[] = [box("top", "top", L, h - T, -d, w, T, d, 0.004, "top")];
  for (const [i, x] of [L + inset, L + w - inset - leg].entries()) {
    for (const [j, z] of [-d + inset, -inset - leg].entries()) parts.push(box(`leg-${i}${j}`, "legs", x, 0, z, leg, h - T, leg, 0.003));
  }
  return parts;
}

/** Low cabinet on legs (sideboard / TV unit): doors near 50 cm wide, bar handles, metal legs. */
export function sideboard({ w, d, h }: GenDims): Part[] {
  const L = -w / 2, LEG = 0.14;
  const front = d - 0.038, fz = -(front + 0.02);
  const { n, unit } = splitRun(w, 0.5, 0.35, 0.7);
  const parts: Part[] = [box("carcass", "carcass", L, LEG, -front, w, h - LEG, front, BEVEL)];
  for (const [i, x] of [L + 0.04, L + w - 0.07].entries()) for (const [j, z] of [-front + 0.04, -0.07].entries()) parts.push(box(`leg-${i}${j}`, "legs", x, 0, z, 0.03, LEG, 0.03, 0.002));
  for (let i = 0; i < n; i++) {
    const x0 = L + i * unit + GAP / 2, fw = unit - GAP, fh = h - LEG - GAP, hw = Math.min(0.3, fw * 0.6);
    parts.push(box(`door-${i}`, "fronts", x0, LEG + GAP / 2, fz, fw, fh, 0.02, BEVEL, "front"));
    parts.push(box(`handle-${i}`, "handle", x0 + (fw - hw) / 2, LEG + fh - 0.045, -d, hw, 0.012, 0.018, BEVEL_SMALL, "hardware"));
  }
  return parts;
}

/** Drawer chest: `rows` drawers high, split into columns about 50 cm wide; recessed plinth. */
function chest(id: string, { w, d, h }: GenDims, rows: number): Part[] {
  const L = -w / 2, PL = 0.06;
  const front = d - 0.038, fz = -(front + 0.02);
  const { n, unit } = splitRun(w, 0.5, 0.35, 0.8);
  const parts: Part[] = [
    box("plinth", "carcass", L + 0.02, 0, -(front - 0.03), w - 0.04, PL, front - 0.05, BEVEL),
    box("carcass", "carcass", L, PL, -front, w, h - PL, front, BEVEL),
  ];
  const dh = (h - PL - GAP * rows) / rows;
  for (let c = 0; c < n; c++) for (let r = 0; r < rows; r++) {
    const x0 = L + c * unit + GAP / 2, fw = unit - GAP, y0 = PL + GAP / 2 + r * (dh + GAP), hw = Math.min(0.24, fw * 0.5);
    parts.push(box(`${id}-${c}-${r}`, "fronts", x0, y0, fz, fw, dh, 0.02, BEVEL, "front"));
    parts.push(box(`handle-${c}-${r}`, "handle", x0 + (fw - hw) / 2, y0 + dh - 0.04, -d, hw, 0.012, 0.018, BEVEL_SMALL, "hardware"));
  }
  return parts;
}
export const nightstand = (dims: GenDims): Part[] => chest("drawer", dims, 2);
export const dresser = (dims: GenDims): Part[] => chest("drawer", dims, 3);

/** Slab bench: a 40 mm seat board on two full-depth slab legs. */
export function bench({ w, d, h }: GenDims): Part[] {
  const L = -w / 2, T = 0.04, S = 0.04, inset = 0.08;
  return [
    box("seat", "frame", L, h - T, -d, w, T, d, 0.005, "top"),
    box("slab-l", "frame", L + inset, 0, -d + 0.02, S, h - T, d - 0.04, 0.003),
    box("slab-r", "frame", L + w - inset - S, 0, -d + 0.02, S, h - T, d - 0.04, 0.003),
  ];
}

/** Floating wall shelf: one board (the hidden bracket is in the wall); hung at the manifest elevation. */
export function wallShelf({ w, d, h }: GenDims): Part[] {
  return [box("board", "frame", -w / 2, 0, -d, w, h, d, 0.003, "top")];
}
