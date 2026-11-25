/**
 * Orthographic plan views (top-down and isometric) as pure math, shared by the
 * three.js camera rig and the SVG overlay so labels and geometry always agree.
 * Plan axes: x east, y north, z up (metres). A view is a centre on the ground
 * plus a scale in pixels per metre.
 */
export type ViewKind = "top" | "iso";
export type PlanView = { kind: ViewKind; cx: number; cy: number; ppm: number };
export type Viewport = { w: number; h: number };
export type V3 = [number, number, number];

const EL = Math.atan(1 / Math.SQRT2); // 35.264 degrees: true isometric elevation

const norm = (v: V3): V3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export type Basis = { right: V3; up: V3; /** unit vector from the scene towards the camera */ toward: V3 };

export function basis(kind: ViewKind): Basis {
  if (kind === "top") return { right: [1, 0, 0], up: [0, 1, 0], toward: [0, 0, 1] };
  // camera in the south-west looking north-east, from above
  const toward = norm([-Math.cos(EL) * Math.SQRT1_2, -Math.cos(EL) * Math.SQRT1_2, Math.sin(EL)]);
  const f: V3 = [-toward[0], -toward[1], -toward[2]];
  const right = norm(cross(f, [0, 0, 1]));
  const up = cross(right, f);
  return { right, up: norm(up), toward };
}

/** Plan point (metres) -> screen pixels. */
export function project(view: PlanView, vp: Viewport, p: V3): [number, number] {
  const b = basis(view.kind);
  const d: V3 = [p[0] - view.cx, p[1] - view.cy, p[2]];
  return [vp.w / 2 + dot(d, b.right) * view.ppm, vp.h / 2 - dot(d, b.up) * view.ppm];
}

/** Screen pixels -> the point on the ground plane (z = 0) under them. */
export function unproject(view: PlanView, vp: Viewport, sx: number, sy: number): [number, number] {
  const b = basis(view.kind);
  const d = (sx - vp.w / 2) / view.ppm;
  const e = (vp.h / 2 - sy) / view.ppm;
  const f: V3 = [-b.toward[0], -b.toward[1], -b.toward[2]];
  // p - c = d*right + e*up + k*f with p.z = 0
  const k = f[2] === 0 ? 0 : -(d * b.right[2] + e * b.up[2]) / f[2];
  return [view.cx + d * b.right[0] + e * b.up[0] + k * f[0], view.cy + d * b.right[1] + e * b.up[1] + k * f[1]];
}

export const MIN_PPM = 6;
export const MAX_PPM = 400;
const clampPpm = (v: number) => Math.min(MAX_PPM, Math.max(MIN_PPM, v));

/** Zooms by `factor` keeping the ground point under (sx, sy) fixed. */
export function zoomAt(view: PlanView, vp: Viewport, factor: number, sx: number, sy: number): PlanView {
  const ppm = clampPpm(view.ppm * factor);
  const [px, py] = unproject(view, vp, sx, sy);
  const probe = unproject({ ...view, ppm }, vp, sx, sy);
  return { ...view, ppm, cx: view.cx + (px - probe[0]), cy: view.cy + (py - probe[1]) };
}

/** Pans so the content follows the pointer by (dx, dy) pixels. */
export function panBy(view: PlanView, vp: Viewport, dx: number, dy: number): PlanView {
  const a = unproject(view, vp, vp.w / 2, vp.h / 2);
  const b = unproject(view, vp, vp.w / 2 - dx, vp.h / 2 - dy);
  return { ...view, cx: view.cx + (b[0] - a[0]), cy: view.cy + (b[1] - a[1]) };
}

/** A view that shows the whole box [x1, y1, x2, y2] (height h) with a margin (fraction of the viewport). */
export function fitView(kind: ViewKind, bounds: [number, number, number, number], height: number, vp: Viewport, margin = 0.08): PlanView {
  const [x1, y1, x2, y2] = bounds;
  const b = basis(kind);
  let minR = Infinity, maxR = -Infinity, minU = Infinity, maxU = -Infinity;
  for (const x of [x1, x2]) for (const y of [y1, y2]) for (const z of [0, height]) {
    const p: V3 = [x, y, z];
    const r = dot(p, b.right), u = dot(p, b.up);
    minR = Math.min(minR, r); maxR = Math.max(maxR, r); minU = Math.min(minU, u); maxU = Math.max(maxU, u);
  }
  const ppm = clampPpm(Math.min((vp.w * (1 - 2 * margin)) / (maxR - minR || 1), (vp.h * (1 - 2 * margin)) / (maxU - minU || 1)));
  // centre: the ground point whose screen position is the middle of the projected box
  const mid = unproject({ kind, cx: 0, cy: 0, ppm: 1 }, { w: 0, h: 0 }, (minR + maxR) / 2, -(minU + maxU) / 2);
  return { kind, cx: mid[0], cy: mid[1], ppm };
}

/** Camera placement for the three.js orthographic camera (three axes: x, y up, -plan y). */
export function threeCamera(view: PlanView, vp: Viewport, distance = 60) {
  const b = basis(view.kind);
  const toThree = (p: V3): V3 => [p[0], p[2], -p[1]];
  const target = toThree([view.cx, view.cy, 0]);
  const pos = toThree([view.cx + b.toward[0] * distance, view.cy + b.toward[1] * distance, b.toward[2] * distance]);
  const hw = vp.w / (2 * view.ppm), hh = vp.h / (2 * view.ppm);
  return { position: pos, target, left: -hw, right: hw, top: hh, bottom: -hh, near: 0.1, far: distance * 3, upVector: view.kind === "top" ? ([0, 0, -1] as V3) : ([0, 1, 0] as V3) };
}
