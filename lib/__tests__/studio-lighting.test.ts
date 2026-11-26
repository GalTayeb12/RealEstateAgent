import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  NEUTRAL_CUBE, applyCube, correctedIrradiance, cosineLobe, cubeGain, cubeWeights, equirectDir, itemEnvIntensity,
  lobeMatrix, parseItemLight, pmremDiffuseLobe, probeIrradiance, roomCube, solveCube, srgbToLinear, weightedMedian,
  type Cube, type ItemLight, type Rgb,
} from "@/lib/studio/lighting";

const W = 64, H = 32;
/** Equirect test environment: radiance as a function of world direction. */
function env(f: (x: number, y: number, z: number) => Rgb) {
  const rgb = new Float32Array(W * H * 3);
  for (let row = 0; row < H; row++) for (let col = 0; col < W; col++) {
    const v = f(...equirectDir(col, row, W, H));
    rgb.set(v, (row * W + col) * 3);
  }
  return rgb;
}

const room = (cube: Cube = NEUTRAL_CUBE, gain = 1) => ({ cube, gain, target: [null, null, null, null, null, null] as [null, null, null, null, null, null], probe: NEUTRAL_CUBE });
const cal: ItemLight = { version: 2, slug: "x-shell", global: 1.2, globalFrom: "test", generatedAt: "2026-11-27T00:00:00Z", rooms: { bed2: room(undefined, 1.5) } };

describe("studio item lighting: schema and runtime helpers", () => {
  it("parses valid files and rejects malformed ones instead of throwing", () => {
    expect(parseItemLight(cal)).toEqual(cal);
    expect(parseItemLight({ ...cal, version: 1 })).toBeNull();
    expect(parseItemLight({ ...cal, global: 0 })).toBeNull();
    expect(parseItemLight({ ...cal, rooms: { bed2: { ...room(), gain: 0 } } })).toBeNull();
    expect(parseItemLight({ ...cal, rooms: { bed2: { ...room(), cube: [[1, 1, 1]] } } })).toBeNull();
    expect(parseItemLight({ ...cal, extra: true })).toBeNull();
    expect(parseItemLight(null)).toBeNull();
    // a room gain is optional and defaults to 1
    const { gain: _gain, ...noGain } = room();
    void _gain;
    expect(parseItemLight({ ...cal, rooms: { bed2: noGain } })?.rooms.bed2.gain).toBe(1);
  });

  it("falls back to neutral lighting for unknown rooms and a missing file", () => {
    expect(roomCube(null, "living")).toEqual(NEUTRAL_CUBE);
    expect(roomCube(cal, "living")).toEqual(NEUTRAL_CUBE);
    expect(itemEnvIntensity(0.5, 1.12, null)).toBeCloseTo(0.56, 10);
    expect(itemEnvIntensity(0.5, 1.12, cal, "bed2")).toBeCloseTo(0.5 * 1.12 * 1.2 * 1.5, 10);
    expect(itemEnvIntensity(0.5, 1.12, cal, "kitchen")).toBeCloseTo(0.5 * 1.12 * 1.2, 10);
  });

  it("uses three.js equirect directions (u = atan(z, x) / 2pi + 0.5, top row = up)", () => {
    const [, yTop] = equirectDir(0, 0, W, H);
    const [, yBot] = equirectDir(0, H - 1, W, H);
    expect(yTop).toBeGreaterThan(0.99);
    expect(yBot).toBeLessThan(-0.99);
    const [x, , z] = equirectDir(W / 2, H / 2, W, H); // u ~ 0.5 -> atan(z, x) ~ 0 -> +x
    expect(x).toBeGreaterThan(0.99);
    expect(Math.abs(z)).toBeLessThan(0.1);
  });

  it("cube weights sum to 1 and a uniform cube is a uniform gain", () => {
    for (const d of [[1, 0, 0], [0.6, 0.8, 0], [0.48, -0.6, 0.64]] as [number, number, number][]) {
      expect(cubeWeights(...d).reduce((s, w) => s + w, 0)).toBeCloseTo(1, 10);
      expect(cubeGain(NEUTRAL_CUBE, ...d)).toEqual([1, 1, 1].map(() => expect.closeTo(1, 10)));
    }
  });

  it("converts sRGB bytes to linear", () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(255)).toBeCloseTo(1, 6);
    expect(srgbToLinear(188)).toBeCloseTo(0.5, 2);
  });

  it("weighted median ignores bright outliers covering under half the weight", () => {
    expect(weightedMedian([0.2, 0.25, 0.3, 9], [1, 1, 1, 0.5])).toBe(0.25);
    expect(weightedMedian([0.2, 9], [1, 3])).toBe(9);
  });
});

describe("studio item lighting: lobes", () => {
  it("the cosine lobe integrates to 1 and a uniform environment gathers its own radiance", () => {
    const lobe = cosineLobe(64);
    expect(lobe.reduce((s, v) => s + (v * 4 * Math.PI) / 64, 0)).toBeCloseTo(1, 2);
    const M = lobeMatrix(env(() => [0.5, 0.5, 0.5]), W, H, lobe);
    for (const row of probeIrradiance(M)) expect(row[0]).toBeCloseTo(0.5, 1);
  });

  it("simulates the three.js PMREM diffuse lobe: normalised, peaked at the normal, partly behind the surface", () => {
    const lobe = pmremDiffuseLobe(8, 32, 60_000);
    const binOmega = (4 * Math.PI) / 32;
    expect(lobe.reduce((s, v) => s + v * binOmega, 0)).toBeCloseTo(1, 6);
    const behind = lobe.slice(0, 16).reduce((s, v) => s + v * binOmega, 0);
    expect(behind).toBeGreaterThan(0.02); // not a cosine: some light comes from behind the tangent plane
    expect(behind).toBeLessThan(0.15);
    expect(lobe[31]).toBeGreaterThan(cosineLobe(32)[31]); // more peaked than a cosine around the normal
  });
});

describe("studio item lighting: directional correction", () => {
  // a room probe: a bright window towards -z, a brown floor, dim walls
  const probe = env((x, y, z) => (z < -0.8 && Math.abs(y) < 0.4 ? [3, 3.2, 3.6] : y < -0.2 ? [0.3, 0.2, 0.12] : [0.15, 0.15, 0.15]));
  const M = lobeMatrix(probe, W, H);
  const own = probeIrradiance(M);

  it("leaves the probe alone when the targets equal what it already gives", () => {
    const cube = solveCube(M, own, 0.03);
    const got = correctedIrradiance(M, cube);
    for (let d = 0; d < 6; d++) for (let c = 0; c < 3; c++) expect(got[d][c] / own[d][c]).toBeCloseTo(1, 2);
  });

  it("scales uniformly when every target is k times the probe, and neutralises a colour cast", () => {
    const k = 3;
    const cube = solveCube(M, own.map((v) => v.map((c) => c * k)) as Rgb[], 0.03);
    for (const g of cube) for (const c of g) expect(c).toBeCloseTo(k, 1);
    // grey targets with the probe's luminance per axis: the brown floor must be pulled back towards neutral
    const lum = (v: number[]) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    const grey = own.map((v) => [lum(v), lum(v), lum(v)]) as Rgb[];
    const fixed = correctedIrradiance(M, solveCube(M, grey, 0.03));
    const castBefore = own[3][0] / own[3][2], castAfter = fixed[3][0] / fixed[3][2]; // -y: looking at the floor
    expect(castBefore).toBeGreaterThan(1.5);
    expect(Math.abs(castAfter - 1)).toBeLessThan(Math.abs(castBefore - 1) / 3);
  });

  it("keeps gains inside the bounds and fills axes without a target from the probe", () => {
    const cube = solveCube(M, [[50, 50, 50], null, [0.001, 0.001, 0.001], null, null, null], 0.03);
    for (const g of cube) for (const c of g) { expect(c).toBeGreaterThanOrEqual(0.05); expect(c).toBeLessThanOrEqual(60); }
  });

  it("applyCube reproduces the corrected gather (same direction mapping in both)", () => {
    const cube = solveCube(M, own.map((v, d) => v.map((c) => c * (1 + d * 0.3))) as Rgb[], 0.03);
    const copy = Float32Array.from(probe);
    applyCube(copy, W, H, cube, 3);
    const direct = probeIrradiance(lobeMatrix(copy, W, H));
    const viaMatrix = correctedIrradiance(M, cube);
    for (let d = 0; d < 6; d++) for (let c = 0; c < 3; c++) expect(direct[d][c]).toBeCloseTo(viaMatrix[d][c], 4);
  });
});

describe("studio item lighting: shipped calibration", () => {
  it("is valid for the pilot shell and covers every probed room", () => {
    const parsed = parseItemLight(JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/studio/lighting/yarkon-twin-shell.json"), "utf8")));
    const walk = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/walk/yarkon-twin-shell/walk.json"), "utf8"));
    expect(parsed).not.toBeNull();
    expect(parsed!.slug).toBe("yarkon-twin-shell");
    for (const r of Object.keys(walk.probes)) expect(parsed!.rooms[r], r).toBeDefined();
  });
});
