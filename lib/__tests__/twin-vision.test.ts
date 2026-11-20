/**
 * Image/PDF plan parsing without the API: a fake caller returns what a
 * perfect (or slightly noisy, skewed) reading of the Yarkon plan would be,
 * and the post-processing must turn it back into the Yarkon twin.
 */
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { YARKON_TWIN } from "../twin/fixtures/yarkon";
import { type PlanTwin, type Pt, alongWall, bbox, polygonArea } from "../twin/schema";
import { planSvg } from "../twin/svg";
import { validateTwin } from "../twin/validate";
import { buildTwin, estimateScale } from "../twin/vision/build";
import { buildContent, type Extraction, type VisionCaller } from "../twin/vision/extract";
import { parsePlanImage } from "../twin/vision";
import { makeViews, rasterize } from "../twin/vision/raster";
import { scoreTwin } from "../twin/vision/score";

/** Deterministic noise in [-1, 1]. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return (s / 0xffffffff) * 2 - 1; };
}

/** What the model would return for `t` drawn at `ppm` px/m, rotated `deg`, with ±`noise` px jitter. */
function fakeExtraction(t: PlanTwin, ppm: number, deg = 0, noise = 0, seed = 1): Extraction {
  const r = rng(seed);
  const pts = [...t.walls.flatMap((w) => [w.a, w.b]), ...t.rooms.flatMap((x) => x.polygon)];
  const [x1, y1, x2, y2] = bbox(pts);
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, th = (deg * Math.PI) / 180;
  const px = ([x, y]: Pt) => {
    const dx = x - cx, dy = y - cy;
    const rx = dx * Math.cos(th) - dy * Math.sin(th), ry = dx * Math.sin(th) + dy * Math.cos(th);
    return { x: 100 + (rx + (x2 - x1) / 2 + 1) * ppm + r() * noise, y: 100 + ((y2 - y1) / 2 + 1 - ry) * ppm + r() * noise };
  };
  return {
    drawingKind: "architectural_plan",
    scale: {
      dimensions: [
        { text: "1500", meters: 15, from: px([0, -3]), to: px([15, -3]), confidence: 0.9 },
        { text: "850", meters: 8.5, from: px([-1, 0]), to: px([-1, 8.5]), confidence: 0.9 },
        { text: "320", meters: 3.2, from: px([0, 9.5]), to: px([3.2, 9.5]), confidence: 0.9 },
      ],
      scaleBar: { from: px([0, -4]), to: px([5, -4]), meters: 5 },
      writtenScale: null,
    },
    walls: t.walls.map((w) => ({ from: px(w.a), to: px(w.b), thicknessPx: w.thickness * ppm, kind: w.kind, confidence: 0.9 })),
    openings: t.openings.map((o) => {
      const w = t.walls.find((x) => x.id === o.wallId)!;
      return { kind: o.kind, jambA: px(alongWall(w, o.at - o.width / 2)), jambB: px(alongWall(w, o.at + o.width / 2)), confidence: 0.9 };
    }),
    rooms: t.rooms.map((x) => ({
      label: x.name.he, labelEn: x.name.en, type: x.type, polygon: x.polygon.map(px),
      writtenAreaM2: Math.round(polygonArea(x.polygon) * 10) / 10, confidence: 0.9,
    })),
    declared: { apartmentAreaM2: t.declared.area ?? null, balconyAreaM2: t.declared.balconyArea ?? null, rooms: t.declared.rooms ?? null },
    notes: [],
  };
}

function expectYarkon(twin: PlanTwin, areaTol = 0.05) {
  const s = scoreTwin(twin, YARKON_TWIN);
  expect(s.rooms.got).toBe(8);
  expect(s.rooms.matched).toBe(8);
  expect(s.rooms.typeOk).toBe(8);
  expect(s.rooms.detail.every((d) => d.areaErr !== null && Math.abs(d.areaErr) <= areaTol), JSON.stringify(s.rooms.detail)).toBe(true);
  for (const g of ["door", "window", "slider"] as const) expect(s.openings[g].got, g).toBe(s.openings[g].want);
  expect(s.walls.recall).toBeGreaterThan(0.95);
  expect(s.walls.precision).toBeGreaterThan(0.95);
  return s;
}

describe("vision post-processing", () => {
  it("rebuilds Yarkon from a clean reading", () => {
    const { twin, scale } = buildTwin(fakeExtraction(YARKON_TWIN, 80), { sourceKind: "image" });
    expect(scale.source).toBe("dimensions");
    expect(Math.abs(scale.mPerPx * 80 - 1)).toBeLessThan(0.005);
    expectYarkon(twin, 0.01);
    const report = validateTwin(twin);
    expect(report.issues.filter((i) => i.level === "error")).toEqual([]);
  });

  it("straightens a skewed, noisy reading", () => {
    const { twin, notes, confidence } = buildTwin(fakeExtraction(YARKON_TWIN, 60, 2, 3, 7), { sourceKind: "pdf" });
    expect(notes.find((n) => /rotated/.test(n))).toMatch(/rotated (1.9|2.0|2.1)°/);
    expectYarkon(twin);
    // every wall is axis-aligned again
    for (const w of twin.walls) expect(Math.min(Math.abs(w.a[0] - w.b[0]), Math.abs(w.a[1] - w.b[1]))).toBeLessThan(1e-9);
    expect(validateTwin(twin).ok).toBe(true);
    expect(confidence.find((c) => c.ref === "scale")!.score).toBeGreaterThan(0.8);
    expect(confidence.filter((c) => c.kind === "room")).toHaveLength(8);
  });

  it("places openings on their walls without overlaps", () => {
    const { twin } = buildTwin(fakeExtraction(YARKON_TWIN, 50, 0, 2, 3), { sourceKind: "image" });
    const report = validateTwin(twin);
    expect(report.issues.filter((i) => i.code.startsWith("opening"))).toEqual([]);
    expect(twin.openings.filter((o) => o.kind === "entry")).toHaveLength(1);
  });
});

describe("scale estimate", () => {
  const base = fakeExtraction(YARKON_TWIN, 40);

  it("ignores a misread dimension", () => {
    const x = structuredClone(base);
    x.scale.dimensions.push({ ...x.scale.dimensions[0], text: "150", meters: 1.5 });
    const s = estimateScale(x);
    expect(Math.abs(s.mPerPx * 40 - 1)).toBeLessThan(0.005);
    expect(s.notes.some((n) => /disagree/.test(n))).toBe(true);
  });

  it("falls back to written room areas, then the stated area, then doors", () => {
    const x = structuredClone(base);
    x.scale.dimensions = []; x.scale.scaleBar = null;
    expect(estimateScale(x).source).toBe("room-areas");
    expect(estimateScale(x).mPerPx).toBeCloseTo(1 / 40, 3);
    for (const r of x.rooms) r.writtenAreaM2 = null;
    const stated = estimateScale(x, { areaM2: 127.5 });
    expect(stated.source).toBe("stated-area");
    expect(stated.mPerPx).toBeCloseTo(1 / 40, 3);
    x.declared.apartmentAreaM2 = null;
    const doors = estimateScale(x);
    expect(doors.source).toBe("door-widths");
    expect(doors.confidence).toBeLessThan(0.5);
  });

  it("reports conflicting sources", () => {
    const x = structuredClone(base);
    x.scale.scaleBar!.meters = 6; // 20% off
    const s = estimateScale(x);
    expect(s.source).toBe("dimensions");
    expect(s.notes.some((n) => /scale-bar differs/.test(n))).toBe(true);
    expect(s.confidence).toBeLessThan(0.95);
  });

  it("returns zero confidence with nothing to go on", () => {
    const x = structuredClone(base);
    x.scale.dimensions = []; x.scale.scaleBar = null; x.openings = []; x.declared.apartmentAreaM2 = null;
    for (const r of x.rooms) r.writtenAreaM2 = null;
    expect(estimateScale(x)).toMatchObject({ source: "none", confidence: 0 });
  });
});

describe("rasterize and views", () => {
  const svg = planSvg(YARKON_TWIN, { ppm: 40 });

  it("sends small images as one overview", async () => {
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    const [page] = await rasterize(png, "plan.png");
    const v = await makeViews(page);
    expect(v.tiles).toHaveLength(0);
    expect(v.downscale).toBe(1);
    const content = buildContent(v, { areaM2: 127 });
    expect(content.filter((c) => c.type === "image")).toHaveLength(1);
  });

  it("rasterizes a PDF sheet and tiles it when it is large", async () => {
    const png = await sharp(Buffer.from(planSvg(YARKON_TWIN, { ppm: 200 }))).png().toBuffer();
    const pdf = await PDFDocument.create();
    const img = await pdf.embedPng(png);
    const page = pdf.addPage([1191, 842]); // A3 landscape, points
    page.drawImage(img, { x: 60, y: 60, width: 1071, height: (1071 * img.height) / img.width });
    const bytes = Buffer.from(await pdf.save());
    const pages = await rasterize(bytes, "plan.pdf", { pdfEdge: 5000 });
    expect(pages).toHaveLength(1);
    expect(Math.max(pages[0].width, pages[0].height)).toBeGreaterThan(4500);
    const v = await makeViews(pages[0]);
    expect(Math.max(v.overview.width, v.overview.height)).toBeLessThanOrEqual(2576);
    expect(v.overview.width * v.overview.height).toBeLessThanOrEqual(3_500_000);
    expect(v.tiles.length).toBeGreaterThan(1);
    expect(v.tiles.length).toBeLessThanOrEqual(4);
    for (const t of v.tiles) expect(Math.max(t.width, t.height)).toBeLessThanOrEqual(2576);
    const text = buildContent(v).filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("\n");
    expect(text).toMatch(/zoom tile/);
  }, 60_000);
});

describe("parsePlanImage", () => {
  it("runs end to end with a fake caller", async () => {
    const png = await sharp(Buffer.from(planSvg(YARKON_TWIN, { ppm: 60 }))).png().toBuffer();
    let images = 0;
    const caller: VisionCaller = async ({ content }) => {
      images = content.filter((c) => c.type === "image").length;
      return {
        extraction: fakeExtraction(YARKON_TWIN, 60, 0, 1),
        usage: { model: "claude-opus-5-5", inputTokens: 5000, outputTokens: 8000, cacheReadTokens: 0, costUsd: 0.18, stopReason: "end_turn" },
      };
    };
    const res = await parsePlanImage(png, { file: "yarkon.png", caller });
    expect(images).toBe(1);
    expect(res.twin.source).toMatchObject({ kind: "image", file: "yarkon.png" });
    expect(res.report.ok).toBe(true);
    expect(res.usage.costUsd).toBe(0.18);
    expectYarkon(res.twin);
  });
});

describe("scoreTwin", () => {
  it("scores the ground truth as perfect", () => {
    const s = scoreTwin(YARKON_TWIN, YARKON_TWIN);
    expect(s.rooms).toMatchObject({ matched: 8, typeOk: 8, areaWithin5: 8 });
    expect(s.walls).toEqual({ recall: 1, precision: 1 });
  });
});
