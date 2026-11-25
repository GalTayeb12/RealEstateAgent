import { BEVEL, BEVEL_SMALL, GAP, box, splitRun, type GenDims, type Part } from "./types";

/**
 * Kitchen base run: plinth, carcass, doors (every third unit is a three-drawer
 * stack), bar handles and a stone countertop. Height is fixed at 90 cm
 * (plinth 10, carcass 76, top 4).
 */
export function baseRun({ w, d }: GenDims): Part[] {
  const L = -w / 2;
  const PL = 0.1, TOP = 0.04, H = 0.9;
  const body = H - TOP;
  const { n, unit } = splitRun(w);
  const front = d - 0.038; // carcass depth: 20 mm fronts + 18 mm handle bars stay inside the item depth, the top overhangs
  const fz = -(front + 0.02);
  const parts: Part[] = [
    box("plinth", "carcass", L + 0.01, 0, -(d - 0.06), w - 0.02, PL, d - 0.1, BEVEL),
    box("carcass", "carcass", L, PL, -front, w, body - PL, front, BEVEL),
  ];
  for (let i = 0; i < n; i++) {
    const x0 = L + i * unit + GAP / 2, fw = unit - GAP;
    const drawers = n >= 3 && i % 3 === 1;
    const y0 = PL + GAP / 2, fh = body - PL - GAP;
    const hw = Math.min(0.4, fw * 0.8);
    if (!drawers) {
      parts.push(box(`door-${i}`, "fronts", x0, y0, fz, fw, fh, 0.02, BEVEL, "front"));
      parts.push(box(`handle-${i}`, "handle", x0 + (fw - hw) / 2, y0 + fh - 0.05, fz - 0.018, hw, 0.012, 0.018, BEVEL_SMALL, "hardware"));
    } else {
      const dh = (fh - 2 * GAP) / 3;
      for (let k = 0; k < 3; k++) {
        const yy = y0 + k * (dh + GAP);
        parts.push(box(`drawer-${i}-${k}`, "fronts", x0, yy, fz, fw, dh, 0.02, BEVEL, "front"));
        parts.push(box(`handle-${i}-${k}`, "handle", x0 + (fw - hw) / 2, yy + dh - 0.035, fz - 0.018, hw, 0.012, 0.018, BEVEL_SMALL, "hardware"));
      }
    }
  }
  parts.push(box("countertop", "countertop", L, body, -d, w, TOP, d, 0.004, "top"));
  return parts;
}

/** Wall units: carcass, doors with a bottom-edge handle bar; hung 145 cm above the floor (manifest elevation). */
export function wallRun({ w, d, h }: GenDims): Part[] {
  const L = -w / 2;
  const { n, unit } = splitRun(w);
  const front = d - 0.038;
  const parts: Part[] = [box("carcass", "carcass", L, 0, -front, w, h, front, BEVEL)];
  for (let i = 0; i < n; i++) {
    const x0 = L + i * unit + GAP / 2, fw = unit - GAP;
    const hw = Math.min(0.4, fw * 0.8);
    parts.push(box(`door-${i}`, "fronts", x0, GAP / 2, -(front + 0.02), fw, h - GAP, 0.02, BEVEL, "front"));
    parts.push(box(`handle-${i}`, "handle", x0 + (fw - hw) / 2, 0.025, -d, hw, 0.012, 0.018, BEVEL_SMALL, "hardware"));
  }
  return parts;
}
