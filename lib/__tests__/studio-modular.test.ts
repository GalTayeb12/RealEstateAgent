import { describe, expect, it } from "vitest";
import { configDepth, configWidth, reachableWidths, solveForWidth, validateConfig } from "../studio/catalog/modular";
import { resolveSize, SizingError } from "../studio/catalog/sizing";
import type { ModelManifest } from "../studio/schema/catalog";
import { CHAIR, SOFA, WARDROBE } from "./studio-fixtures";

const sizing = SOFA.sizing as Extract<ModelManifest["sizing"], { mode: "modular" }>;

describe("modular sofa configurations", () => {
  it("accepts the default configuration", () => {
    expect(validateConfig(sizing, sizing.defaultConfig!)).toEqual([]);
    expect(configWidth(sizing, sizing.defaultConfig!)).toBeCloseTo(2.4, 6);
  });

  it("rejects an open left edge, an open right edge and incompatible joins", () => {
    expect(validateConfig(sizing, ["seat-100", "seat-100", "arm-r"])[0].code).toBe("bad-end");
    expect(validateConfig(sizing, ["arm-l", "seat-100", "seat-100"])[0].code).toBe("bad-end");
    expect(validateConfig(sizing, ["arm-l", "arm-r"])[0].code).toBe("no-seat");
    expect(validateConfig(sizing, ["arm-l", "chaise", "seat-100", "arm-r"]).some((i) => i.code === "bad-join")).toBe(true);
  });

  it("rejects unknown modules, empty runs and runs that are too long", () => {
    expect(validateConfig(sizing, ["arm-l", "nope", "arm-r"])[0].code).toBe("unknown-module");
    expect(validateConfig(sizing, [])[0].code).toBe("empty");
    const long = ["arm-l", ...Array(8).fill("seat-80"), "arm-r"];
    expect(validateConfig(sizing, long).some((i) => i.code === "too-many")).toBe(true);
  });

  it.each([2.4, 3.2, 4.0])("finds legal configurations for %s m from real modules", (target) => {
    const sols = solveForWidth(sizing, target, { tol: 0.005 });
    expect(sols.length).toBeGreaterThan(0);
    for (const s of sols) {
      expect(validateConfig(sizing, s.modules)).toEqual([]);
      expect(Math.abs(s.width - target)).toBeLessThanOrEqual(0.005 + 1e-9);
      expect(configWidth(sizing, s.modules)).toBeCloseTo(s.width, 6);
    }
  });

  it("builds the 4 m sofa out of arms and seats, preserving module proportions", () => {
    const best = solveForWidth(sizing, 4.0, { tol: 0.005, limit: 50 }).find((s) => s.modules.at(-1) === "arm-r")!;
    expect(best).toBeDefined();
    expect(best.modules[0]).toBe("arm-l");
    // armrest width is exactly the catalog's 20 cm: no module was stretched
    const arms = best.modules.filter((m) => m.startsWith("arm"));
    expect(arms).toHaveLength(2);
    expect(configWidth(sizing, arms)).toBeCloseTo(0.4, 6);
  });

  it("offers chaise configurations and takes their larger depth", () => {
    const withChaise = solveForWidth(sizing, 3.0, { tol: 0.005, limit: 50 }).find((s) => s.modules.includes("chaise"));
    expect(withChaise).toBeDefined();
    expect(withChaise!.depth).toBeCloseTo(1.6, 6);
    expect(configDepth(sizing, ["arm-l", "seat-100", "arm-r"])).toBeCloseTo(0.95, 6);
  });

  it("returns nothing for widths no combination can reach", () => {
    expect(solveForWidth(sizing, 0.5)).toEqual([]);
  });

  it("ranks the exact, simplest configuration first", () => {
    const sols = solveForWidth(sizing, 2.4, { tol: 0.2 });
    expect(Math.abs(sols[0].width - 2.4)).toBeLessThanOrEqual(Math.abs(sols.at(-1)!.width - 2.4));
    expect(sols[0].modules.length).toBeLessThanOrEqual(sols.find((s) => s.width === sols[0].width && s !== sols[0])?.modules.length ?? 99);
  });

  it("lists reachable widths including 2.4 and 4.0", () => {
    const ws = reachableWidths(sizing, { min: 1, max: 5 });
    expect(ws).toContain(2.4);
    expect(ws).toContain(4);
    expect(ws).toEqual([...ws].sort((a, b) => a - b));
  });
});

describe("resolveSize strategies", () => {
  it("fixed assets keep their catalog size", () => {
    expect(resolveSize({ ...SOFA, sizing: { mode: "fixed" } }, {})).toEqual(SOFA.dims);
  });

  it("modular assets take width and depth from the module list", () => {
    const d = resolveSize(SOFA, { modules: ["arm-l", "seat-120", "seat-120", "seat-120", "arm-r"] });
    expect(d.w).toBeCloseTo(4.0, 6);
    expect(d.h).toBe(SOFA.dims.h);
  });

  it("modular assets without a configuration or with an illegal one are rejected", () => {
    expect(() => resolveSize({ ...SOFA, sizing: { ...sizing, defaultConfig: undefined } }, {})).toThrow(SizingError);
    expect(() => resolveSize(SOFA, { modules: ["arm-l", "arm-r"] })).toThrow(SizingError);
  });

  it("variant assets resolve real manufacturer sizes and reject unknown variants", () => {
    expect(resolveSize(CHAIR, { variantId: "bar" }).h).toBe(1.05);
    expect(resolveSize(CHAIR, {}).h).toBe(0.85);
    expect(() => resolveSize(CHAIR, { variantId: "giant" })).toThrow(SizingError);
  });

  it("parametric assets accept in-range stepped values only", () => {
    expect(resolveSize(WARDROBE, { params: { width: 2.6 } }).w).toBe(2.6);
    expect(() => resolveSize(WARDROBE, { params: { width: 3.4 } })).toThrow(SizingError);
    expect(() => resolveSize(WARDROBE, { params: { width: 2.55 } })).toThrow(SizingError);
  });
});
