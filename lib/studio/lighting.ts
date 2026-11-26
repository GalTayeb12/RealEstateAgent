/**
 * Item lighting that agrees with the baked shell, per room and per direction.
 *
 * The shell is lit by its baked lightmap; live items are lit by the realtime sun plus the room's
 * reflection probe. The two disagree: the probes are 8-bit images normalised at their 98th
 * percentile (the window, most of a dim room's light, is clipped), the shell's lightmap is
 * white-balanced while the probe is not, three.js gathers diffuse light from the probe through its
 * PMREM lobe (not a cosine), and one probe at the room centre misjudges walls facing different
 * ways. Measured on Yarkon before this module (scripts/studio/light-tone.mjs, a wardrobe painted
 * exactly like the plain wall behind it), items on side walls read at 23-56 % of the wall's
 * luminance, with a strong brown cast in the bedrooms. So the correction is directional and comes
 * from the bake itself:
 *
 *   target[d]  what the bake says a surface facing world axis d receives in this room: the median
 *              lightmap value (x lightmap scale x shell white balance) of the room's baked surfaces
 *              facing d (scripts/studio/item-light.mjs reads the shell GLB and lightmap);
 *   probe[d]   what the item would receive from the probe: its mean radiance around d gathered
 *              through three's PMREM diffuse lobe (`pmremDiffuseLobe`), x probe scale;
 *   cube[d]    a gain field over directions (ambient-cube interpolation) multiplied into the probe
 *              so that, after the multiplication, probe[d] ~ target[d] for the six axes
 *              (regularised least squares per colour channel, see `solveCube`).
 *
 * What one probe per room cannot express (a deep room's light falls off away from the window,
 * screen-space AO) is absorbed by scalars fitted in the real renderer: `global`, and one `gain` per
 * room fitted on ONE plain wall per room (light-tone.mjs set A) and judged on a wall facing another
 * way that was never used to fit (set B). Nothing here scales geometry.
 *
 * Axes are WORLD axes (three.js: y up; plan (x, y) maps to world (x, -z)), in the order
 * +x, -x, +y, -y, +z, -z. Equirect conventions follow three.js (`equirectUv`).
 */
import { z } from "zod";

export type Rgb = [number, number, number];
export type Cube = [Rgb, Rgb, Rgb, Rgb, Rgb, Rgb];

export const AXES: readonly (readonly [number, number, number])[] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];
export const AXIS_NAMES = ["+x", "-x", "+y", "-y", "+z", "-z"] as const;

const RgbSchema = z.tuple([z.number().nonnegative(), z.number().nonnegative(), z.number().nonnegative()]);
const CubeSchema = z.tuple([RgbSchema, RgbSchema, RgbSchema, RgbSchema, RgbSchema, RgbSchema]);

export const RoomLightSchema = z.strictObject({
  /** Gain field over directions, multiplied into the probe radiance (linear RGB). */
  cube: CubeSchema,
  /**
   * Scalar on the room's item light, fitted in the renderer on ONE wall per room (light-tone.mjs set A)
   * and validated on a wall facing another way (set B). It absorbs what one probe per room cannot
   * express (a deep room's light falls off away from the window). 1 = not fitted.
   */
  gain: z.number().min(0.1).max(10).default(1),
  /** Bake-derived target per axis (radiance units of the probe after its scale); null for an axis with no baked surface. */
  target: z.tuple([RgbSchema.nullable(), RgbSchema.nullable(), RgbSchema.nullable(), RgbSchema.nullable(), RgbSchema.nullable(), RgbSchema.nullable()]),
  /** The probe's own cosine-weighted mean radiance per axis (x its scale), before correction. */
  probe: CubeSchema,
});
export type RoomLight = z.infer<typeof RoomLightSchema>;

export const ItemLightSchema = z.strictObject({
  version: z.literal(2),
  slug: z.string().min(1),
  /** Global factor on the item environment intensity, fitted in the renderer on one reference wall. */
  global: z.number().min(0.05).max(20),
  /** How `global` was obtained (room, wall set, tier, measured ratio before the fit). */
  globalFrom: z.string(),
  generatedAt: z.string(),
  rooms: z.record(z.string(), RoomLightSchema),
});
export type ItemLight = z.infer<typeof ItemLightSchema>;

const ONE: Rgb = [1, 1, 1];
export const NEUTRAL_CUBE: Cube = [ONE, ONE, ONE, ONE, ONE, ONE];

/** Parses a calibration file; anything malformed falls back to "no calibration" rather than breaking the scene. */
export function parseItemLight(raw: unknown): ItemLight | null {
  const r = ItemLightSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** The gain cube for a room (neutral when the room or the whole calibration is missing). */
export function roomCube(cal: ItemLight | null | undefined, room: string): Cube {
  return (cal?.rooms[room]?.cube as Cube | undefined) ?? NEUTRAL_CUBE;
}

/** Environment intensity for an item: probe radiance scale x global exposure x calibrated global factor x room gain. */
export function itemEnvIntensity(probeScale: number, exposure: number, cal: ItemLight | null | undefined, room?: string): number {
  return probeScale * exposure * (cal?.global ?? 1) * ((room && cal?.rooms[room]?.gain) || 1);
}

/** Ambient-cube weights of a unit direction: squared positive components; they sum to 1. */
export function cubeWeights(x: number, y: number, z: number): number[] {
  return [x > 0 ? x * x : 0, x < 0 ? x * x : 0, y > 0 ? y * y : 0, y < 0 ? y * y : 0, z > 0 ? z * z : 0, z < 0 ? z * z : 0];
}

/** Gain of the cube in a direction (RGB). */
export function cubeGain(cube: Cube, x: number, y: number, z: number): Rgb {
  const w = cubeWeights(x, y, z);
  const g: Rgb = [0, 0, 0];
  for (let k = 0; k < 6; k++) for (let c = 0; c < 3; c++) g[c] += w[k] * cube[k][c];
  return g;
}

/**
 * World direction of an equirect texel, three.js convention (`equirectUv`: u = atan(z, x) / 2pi + 0.5,
 * v = asin(y) / pi + 0.5, v = 1 at the top). `row` counts from the TOP of the image (row 0 = up).
 */
export function equirectDir(col: number, row: number, W: number, H: number): [number, number, number] {
  const u = (col + 0.5) / W, v = 1 - (row + 0.5) / H;
  const phi = (u - 0.5) * 2 * Math.PI, theta = (v - 0.5) * Math.PI;
  return [Math.cos(theta) * Math.cos(phi), Math.sin(theta), Math.cos(theta) * Math.sin(phi)];
}

const SRGB_LUT = Float32Array.from({ length: 256 }, (_, i) => {
  const v = i / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
});
/** sRGB 8-bit value -> linear. */
export const srgbToLinear = (v: number) => SRGB_LUT[v];

/**
 * Angular density (per steradian, integrating to 1 over the sphere) of the lobe through which three.js
 * gathers DIFFUSE light from a PMREM environment: `getIBLIrradiance` reads the prefiltered map at
 * roughness 1, i.e. the last of the PMREM LODs, each built from the previous one by a GGX VNDF filter
 * (three 0.186 `PMREMGenerator._applyGGXFilter`: 256 Hammersley samples, V = N, weight N.L, roughness
 * sqrt(t^2 - s^2) * 1.25 t for LOD t = i / (n - 1)). This lobe is not a cosine: it leans towards grazing
 * directions, so for a wall-facing item it sees much more floor and ceiling. Simulated here by walking
 * random paths through that chain of filters. `lodMax` = log2(cube face size) = log2(equirect width / 4).
 * Returns `bins` densities over cos(angle) from -1 to 1 (equal-width bins in cos = equal solid angle).
 */
export function pmremDiffuseLobe(lodMax = 8, bins = 64, paths = 200_000, seed = 7): Float64Array {
  const LOD_MIN = 4, EXTRA_LODS = 6, SAMPLES = 256;
  const n = lodMax - LOD_MIN + 1 + EXTRA_LODS;
  const radicalInverse = (i: number) => {
    let b = i >>> 0;
    b = ((b << 16) | (b >>> 16)) >>> 0;
    b = (((b & 0x55555555) << 1) | ((b & 0xaaaaaaaa) >>> 1)) >>> 0;
    b = (((b & 0x33333333) << 2) | ((b & 0xcccccccc) >>> 2)) >>> 0;
    b = (((b & 0x0f0f0f0f) << 4) | ((b & 0xf0f0f0f0) >>> 4)) >>> 0;
    b = (((b & 0x00ff00ff) << 8) | ((b & 0xff00ff00) >>> 8)) >>> 0;
    return b * 2.3283064365386963e-10;
  };
  // per step: the sample directions L (tangent space, N = +z) and their cumulative N.L weights
  const steps: { L: number[][]; cdf: number[] }[] = [];
  for (let i = 1; i < n; i++) {
    const t = i / (n - 1), s = (i - 1) / (n - 1);
    const rough = Math.sqrt(t * t - s * s) * t * 1.25, alpha = rough * rough;
    const L: number[][] = [], cdf: number[] = [];
    let acc = 0;
    for (let k = 0; k < SAMPLES; k++) {
      const xi0 = k / SAMPLES, xi1 = radicalInverse(k);
      const r = Math.sqrt(xi0), phi = 2 * Math.PI * xi1;
      const t1 = r * Math.cos(phi);
      const t2 = r * Math.sin(phi); // V = (0, 0, 1): s = 1, so t2 is unchanged
      const nh = [t1, t2, Math.sqrt(Math.max(0, 1 - t1 * t1 - t2 * t2))];
      let h = [alpha * nh[0], alpha * nh[1], Math.max(0, nh[2])];
      const hl = Math.hypot(h[0], h[1], h[2]) || 1;
      h = h.map((v) => v / hl);
      const l = [2 * h[2] * h[0], 2 * h[2] * h[1], 2 * h[2] * h[2] - 1]; // reflect(-V, H) with V = +z
      const ll = Math.hypot(l[0], l[1], l[2]) || 1;
      const lz = l[2] / ll;
      if (lz > 0) { acc += lz; L.push(l.map((v) => v / ll)); cdf.push(acc); }
    }
    steps.push({ L, cdf: cdf.map((c) => c / acc) });
  }
  let st = seed >>> 0;
  const rand = () => { st = (Math.imul(st, 1664525) + 1013904223) >>> 0; return st / 4294967296; };
  const hist = new Float64Array(bins);
  for (let p = 0; p < paths; p++) {
    let d = [0, 0, 1];
    for (const { L, cdf } of steps) {
      const u = rand();
      let lo = 0, hi = cdf.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < u) lo = mid + 1; else hi = mid; }
      const l = L[lo];
      // the shader's tangent frame around the current direction
      const up = Math.abs(d[2]) < 0.999 ? [0, 0, 1] : [1, 0, 0];
      let tx = [up[1] * d[2] - up[2] * d[1], up[2] * d[0] - up[0] * d[2], up[0] * d[1] - up[1] * d[0]];
      const tl = Math.hypot(tx[0], tx[1], tx[2]);
      tx = tx.map((v) => v / tl);
      const bx = [d[1] * tx[2] - d[2] * tx[1], d[2] * tx[0] - d[0] * tx[2], d[0] * tx[1] - d[1] * tx[0]];
      d = [0, 1, 2].map((c) => tx[c] * l[0] + bx[c] * l[1] + d[c] * l[2]);
      const dl = Math.hypot(d[0], d[1], d[2]);
      d = d.map((v) => v / dl);
    }
    const b = Math.min(bins - 1, Math.floor(((d[2] + 1) / 2) * bins));
    hist[b]++;
  }
  // equal-width bins in cos(angle) are equal solid angles (4 pi / bins each)
  const binOmega = (4 * Math.PI) / bins;
  for (let b = 0; b < bins; b++) hist[b] /= paths * binOmega;
  return hist;
}

/** Density of a lobe table (from `pmremDiffuseLobe`) at cos(angle). */
export function lobeAt(lobe: Float64Array, cos: number): number {
  const b = Math.min(lobe.length - 1, Math.max(0, Math.floor(((cos + 1) / 2) * lobe.length)));
  return lobe[b];
}

/** The plain cosine lobe max(0, cos) / pi as a table, for comparison and tests. */
export function cosineLobe(bins = 64): Float64Array {
  return Float64Array.from({ length: bins }, (_, b) => Math.max(0, -1 + ((b + 0.5) * 2) / bins) / Math.PI);
}

/**
 * Mean radiance of an equirect environment as gathered around each axis through `lobe` (density over
 * cos(angle), integrating to 1), split by which cube lobe the light comes from:
 * M[d][k][c] = integral of L_c(w) * cubeWeight_k(w) * lobe(w.axis_d) dw. Summing over k gives what an
 * item facing d receives without correction. `rgb` is linear, 3 floats per texel, rows from the top.
 * Default lobe: cosine (physical irradiance / pi).
 */
export function lobeMatrix(rgb: Float32Array, W: number, H: number, lobe: Float64Array = cosineLobe()): number[][][] {
  const M = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => [0, 0, 0]));
  const dPhi = (2 * Math.PI) / W, dTheta = Math.PI / H;
  for (let row = 0; row < H; row++) {
    const theta = (0.5 - (row + 0.5) / H) * Math.PI;
    const dOmega = Math.cos(theta) * dPhi * dTheta;
    for (let col = 0; col < W; col++) {
      const [x, y, z] = equirectDir(col, row, W, H);
      const w = cubeWeights(x, y, z);
      const i = (row * W + col) * 3;
      const cos = [x, -x, y, -y, z, -z];
      for (let d = 0; d < 6; d++) {
        const f = lobeAt(lobe, cos[d]) * dOmega;
        if (f <= 0) continue;
        for (let k = 0; k < 6; k++) {
          if (!w[k]) continue;
          const fw = f * w[k];
          M[d][k][0] += rgb[i] * fw; M[d][k][1] += rgb[i + 1] * fw; M[d][k][2] += rgb[i + 2] * fw;
        }
      }
    }
  }
  return M;
}

/** The probe's own mean radiance per axis (no correction). */
export function probeIrradiance(M: number[][][]): Cube {
  return M.map((row) => [0, 1, 2].map((c) => row.reduce((s, k) => s + k[c], 0))) as Cube;
}

/** Solves A x = b (6x6) by Gaussian elimination with partial pivoting; null when singular. */
function solve6(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = A.map((r, i) => [...r, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    if (Math.abs(m[piv][col]) < 1e-12) return null;
    [m[col], m[piv]] = [m[piv], m[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      for (let k = col; k <= n; k++) m[r][k] -= f * m[col][k];
    }
  }
  return m.map((r, i) => r[n] / r[i]);
}

/**
 * Gain cube that makes the corrected probe's mean radiance per axis match `target` (per channel).
 *
 * The six cosine lobes overlap heavily, so the exact 6x6 solve is ill-conditioned (it answers small
 * target differences with gains alternating between huge and ~0). Instead this solves a regularised
 * least-squares problem in RELATIVE error:
 *   minimise  sum_d ((A g)_d / b_d - 1)^2  +  lambda * sum_k (g_k / gbar - 1)^2
 * where gbar is the overall target/probe ratio, so the gain field stays smooth and only bends as far
 * as the data asks. Axes without a target are left out of the data term. Gains are clamped to
 * [minGain, maxGain].
 */
export function solveCube(M: number[][][], target: (Rgb | null)[], lambda = 0.15, minGain = 0.05, maxGain = 60): Cube {
  const own = probeIrradiance(M);
  const out: number[][] = Array.from({ length: 6 }, () => [1, 1, 1]);
  for (let c = 0; c < 3; c++) {
    const A = M.map((row) => row.map((k) => k[c]));
    const rows = target.map((t, d) => (t && t[c] > 0 ? d : -1)).filter((d) => d >= 0);
    const tSum = rows.reduce((s, d) => s + target[d]![c], 0), oSum = rows.reduce((s, d) => s + own[d][c], 0);
    const gbar = rows.length && oSum > 0 ? tSum / oSum : 1;
    // normal equations of the stacked system [A_d / b_d ; sqrt(lambda) I / gbar] g = [1 ; sqrt(lambda)]
    const N = Array.from({ length: 6 }, () => [0, 0, 0, 0, 0, 0]);
    const rhs = [0, 0, 0, 0, 0, 0];
    for (const d of rows) {
      const b = target[d]![c];
      for (let i = 0; i < 6; i++) {
        rhs[i] += A[d][i] / b;
        for (let j = 0; j < 6; j++) N[i][j] += (A[d][i] * A[d][j]) / (b * b);
      }
    }
    for (let i = 0; i < 6; i++) { N[i][i] += lambda / (gbar * gbar); rhs[i] += lambda / gbar; }
    const x = solve6(N, rhs) ?? [gbar, gbar, gbar, gbar, gbar, gbar];
    for (let d = 0; d < 6; d++) out[d][c] = Math.min(maxGain, Math.max(minGain, Number.isFinite(x[d]) ? x[d] : gbar));
  }
  return out as Cube;
}

/** Corrected mean radiance per axis for a gain cube (what the item sees after the correction). */
export function correctedIrradiance(M: number[][][], cube: Cube): Cube {
  return M.map((row) => [0, 1, 2].map((c) => row.reduce((s, k, ki) => s + k[c] * cube[ki][c], 0))) as Cube;
}

/**
 * Applies a room's gain cube to an equirect probe in place. `rgb` is linear, `stride` floats per texel
 * (3 or 4), rows from the top, so the same `equirectDir` mapping is used here and in `lobeMatrix`.
 */
export function applyCube(rgb: Float32Array, W: number, H: number, cube: Cube, stride = 3): void {
  for (let row = 0; row < H; row++) {
    for (let col = 0; col < W; col++) {
      const [x, y, z] = equirectDir(col, row, W, H);
      const g = cubeGain(cube, x, y, z);
      const i = (row * W + col) * stride;
      rgb[i] *= g[0]; rgb[i + 1] *= g[1]; rgb[i + 2] *= g[2];
    }
  }
}

/** Weighted median (weights > 0). */
export function weightedMedian(values: number[], weights: number[]): number {
  const idx = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
  const total = weights.reduce((s, w) => s + w, 0);
  let acc = 0;
  for (const i of idx) { acc += weights[i]; if (acc >= total / 2) return values[i]; }
  return values[idx[idx.length - 1]] ?? 0;
}
