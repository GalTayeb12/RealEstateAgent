import { BEVEL, BEVEL_SMALL, GAP, box, splitRun, type GenDims, type Part } from "./types";

/** Hinged wardrobe: recessed plinth, carcass, full-height doors (40-75 cm each) with vertical bar handles on the meeting edges. */
export function wardrobe({ w, d, h }: GenDims): Part[] {
  const L = -w / 2, PL = 0.06;
  const { n, unit } = splitRun(w, 0.55, 0.4, 0.75);
  const front = d - 0.038;
  const parts: Part[] = [
    box("plinth", "carcass", L + 0.02, 0, -(d - 0.06), w - 0.04, PL, d - 0.08, BEVEL),
    box("carcass", "carcass", L, PL, -front, w, h - PL, front, BEVEL),
  ];
  for (let i = 0; i < n; i++) {
    const x0 = L + i * unit + GAP / 2, fw = unit - GAP, fh = h - PL - GAP;
    parts.push(box(`door-${i}`, "fronts", x0, PL + GAP / 2, -(front + 0.02), fw, fh, 0.02, BEVEL, "front"));
    // the handle sits on the edge that meets the neighbour (pairs meet in the middle); a single door gets it on the right
    const meetsRight = n === 1 ? true : i % 2 === 0;
    const hx = meetsRight ? x0 + fw - 0.045 : x0 + 0.033;
    parts.push(box(`handle-${i}`, "handle", hx, PL + fh / 2 - 0.2, -d, 0.012, 0.4, 0.018, BEVEL_SMALL, "hardware"));
  }
  return parts;
}
