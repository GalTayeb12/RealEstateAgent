import { describe, expect, it } from "vitest";
import { idleStill, STILL_PRESETS, stillEta, stillFilename, stillProgress, stillShouldStop, stillSize } from "@/lib/studio/render/still";

describe("path-traced still: pure helpers", () => {
  it("sizes are even, follow the aspect and never exceed the preset width", () => {
    for (const p of ["draft", "standard", "fine"] as const) {
      const { w, h } = stillSize(p, 16 / 9);
      expect(w).toBe(STILL_PRESETS[p].width);
      expect(w % 2).toBe(0);
      expect(h % 2).toBe(0);
      expect(Math.abs(w / h - 16 / 9)).toBeLessThan(0.01);
    }
    expect(stillSize("draft", Number.NaN)).toEqual(stillSize("draft", 16 / 9));
    expect(stillSize("draft", 100).h).toBeGreaterThanOrEqual(2);
  });

  it("the standard preset keeps its time budget under the 60 s gate", () => {
    expect(STILL_PRESETS.standard.maxSeconds).toBeLessThan(60);
  });

  it("progress is clamped", () => {
    expect(stillProgress(50, 200)).toBe(0.25);
    expect(stillProgress(500, 200)).toBe(1);
    expect(stillProgress(1, 0)).toBe(0);
  });

  it("eta extrapolates from the pace and is capped by the budget", () => {
    expect(stillEta(2, 100, 1000, 60)).toBeNull();
    expect(stillEta(50, 100, 10_000, 60)).toBeCloseTo(10, 5);
    expect(stillEta(50, 100, 10_000, 12)).toBeCloseTo(2, 5);
    expect(stillEta(50, 100, 70_000, 60)).toBe(0);
  });

  it("stops at the target or when the budget is spent, but not before a minimum of samples", () => {
    expect(stillShouldStop(200, 200, 1000, 55)).toEqual({ stop: true, truncated: false });
    expect(stillShouldStop(80, 200, 56_000, 55)).toEqual({ stop: true, truncated: true });
    expect(stillShouldStop(3, 200, 56_000, 55)).toEqual({ stop: false, truncated: false });
    expect(stillShouldStop(80, 200, 5_000, 55)).toEqual({ stop: false, truncated: false });
  });

  it("file names are plain ascii", () => {
    const d = new Date(2026, 10, 26);
    expect(stillFilename("My Flat / דירה 3", "fine", d)).toBe("haveniq-my-flat-3-fine-20261126.png");
    expect(stillFilename("דירה", "draft", d)).toBe("haveniq-design-draft-20261126.png");
    expect(stillFilename(null, "standard", d)).toBe("haveniq-design-standard-20261126.png");
  });

  it("starts idle with the preset's target", () => {
    const s = idleStill("fine");
    expect(s.status).toBe("idle");
    expect(s.target).toBe(STILL_PRESETS.fine.samples);
  });
});
