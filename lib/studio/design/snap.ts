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

/**
 * Two-finger twist on a touch screen: `a0` / `a1` are the screen angles (radians, y down) of the
 * line between the fingers at the start and now. Turning the fingers clockwise on screen turns
 * the piece clockwise seen from above (plan rotation is counter-clockwise positive), snapped.
 */
export function twistRotation(startRot: number, a0: number, a1: number, step = ROT_STEP): number {
  return snapAngle(startRot - normaliseAngle(a1 - a0), step);
}
