import { BEVEL, box, type GenDims, type Part } from "./types";

const T = 0.022; // board thickness

/** Open bookcase: uprights at least every 90 cm, evenly spaced shelves (about 36 cm apart), thin back panel. */
export function shelving({ w, d, h }: GenDims): Part[] {
  const L = -w / 2;
  const bays = Math.max(1, Math.ceil((w - T) / (0.9 + T)));
  const pitch = (w - T) / bays; // upright to upright
  const rows = Math.max(1, Math.round((h - T) / 0.38)); // shelf openings
  const open = (h - T * (rows + 1)) / rows;
  const parts: Part[] = [];
  for (let i = 0; i <= bays; i++) parts.push(box(`upright-${i}`, "frame", L + i * pitch, 0, -d, T, h, d, BEVEL));
  for (let r = 0; r <= rows; r++) {
    for (let i = 0; i < bays; i++) parts.push(box(`shelf-${r}-${i}`, "frame", L + i * pitch + T, r * (open + T), -d + 0.006, pitch - T, T, d - 0.006, BEVEL));
  }
  parts.push(box("back", "back", L + T, T, -0.006, w - 2 * T, h - 2 * T, 0.006, 0.0015));
  return parts;
}
