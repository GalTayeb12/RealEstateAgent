import { box, type GenDims, type Part } from "./types";

/** Upholstered bed: wooden platform base, 24 cm mattress with a generous radius, tall headboard panel, one or two pillows. */
export function bed({ w, d, h }: GenDims): Part[] {
  const L = -w / 2;
  const HB = 0.1; // headboard thickness
  const base = 0.3;
  const parts: Part[] = [
    box("headboard", "upholstery", L, 0.1, -HB, w, h - 0.1, HB, 0.03),
    box("base", "frame", L + 0.02, 0, -d, w - 0.04, base, d - HB, 0.006),
    box("mattress", "linen", L + 0.04, base, -d + 0.04, w - 0.08, 0.24, d - HB - 0.06, 0.06),
  ];
  const sides = w >= 1.2 ? 2 : 1;
  const pw = Math.min(0.62, (w - 0.16) / sides - 0.06);
  for (let i = 0; i < sides; i++) {
    const cx = sides === 2 ? L + w / 4 + (i * w) / 2 : 0;
    parts.push(box(`pillow-${i}`, "linen", cx - pw / 2, base + 0.24, -HB - 0.42, pw, 0.14, 0.36, 0.06));
  }
  return parts;
}
