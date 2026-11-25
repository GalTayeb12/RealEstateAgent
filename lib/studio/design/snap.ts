/** Placement helpers shared by mouse, touch and keyboard editing. Pure, engine independent. */

export const GRID = 0.05; // metres
export const ROT_STEP = Math.PI / 12; // 15 degrees

export const snapTo = (v: number, step = GRID) => Math.round(v / step) * step;

/** Snaps an angle to the nearest multiple of `step`, normalised to (-PI, PI]. */
export function snapAngle(rot: number, step = ROT_STEP): number {
  const s = Math.round(rot / step) * step;
  return normaliseAngle(s);
}

export function normaliseAngle(a: number): number {
  const t = Math.PI * 2;
  let r = a % t;
  if (r > Math.PI) r -= t;
  if (r <= -Math.PI) r += t;
  return Math.abs(r) < 1e-9 ? 0 : r;
}

/** Rotates by `steps` increments of 15 degrees (positive = counter-clockwise, same as plan rotation). */
export function rotateBy(rot: number, steps: number): number {
  return snapAngle(rot + steps * ROT_STEP);
}
