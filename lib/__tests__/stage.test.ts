import { describe, expect, it } from "vitest";
import { cleanMeta, defaultMeta, evenBands, evenSlots, sameProportions, sniffImage, stageImageUrl, validateStage, type StageBuilding } from "../stage";
import { readPhotoMeta } from "../experience/types";

const two: StageBuilding[] = [
  { id: "a", name: "A", floorCount: 8, unitsPerFloor: 4 },
  { id: "b", name: "B", floorCount: 10, unitsPerFloor: 3 },
];

describe("stage", () => {
  it("lays out bands from roof to ground", () => {
    const b = evenBands({ y: 0.2, h: 0.6 }, 4);
    expect(b).toEqual([0.2, 0.35, 0.5, 0.65, 0.8]);
    expect(evenSlots(4)).toEqual([0.125, 0.375, 0.625, 0.875]);
  });

  it("makes a valid default for several buildings, readable by the buyer viewer", () => {
    const m = defaultMeta(1.7, two);
    expect(validateStage(m, two)).toEqual([]);
    expect(m.buildings[0].x + m.buildings[0].w).toBeLessThan(m.buildings[1].x);
    expect(readPhotoMeta(m, 1.5)?.buildings).toHaveLength(2);
  });

  it("flags wrong counts, boxes off the image and bad floor lines", () => {
    const m = defaultMeta(1.7, two);
    expect(validateStage({ ...m, buildings: [m.buildings[0]] }, two)).toHaveLength(1);
    const off = { ...m, buildings: [{ ...m.buildings[0], x: 0.9, w: 0.3 }, m.buildings[1]] };
    expect(validateStage(off, two).some((i) => i.en.includes("outside"))).toBe(true);
    const bad = { ...m, buildings: [{ ...m.buildings[0], bands: [0.1, 0.2] }, m.buildings[1]] };
    expect(validateStage(bad, two).some((i) => i.en.includes("floor lines"))).toBe(true);
  });

  it("recognises images by content", () => {
    expect(sniffImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0]))?.ext).toBe("png");
    expect(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe("jpg");
    expect(sniffImage(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))?.ext).toBe("webp");
    expect(sniffImage(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
  });

  it("keeps the lights-off image through cleaning and compares proportions", () => {
    const m = { ...defaultMeta(1.7, two), offImage: stageImageUrl("p1", "png", "off") };
    expect(cleanMeta(m).offImage).toBe("/api/stage/p1/off.png");
    expect(cleanMeta(defaultMeta(1.7, two)).offImage).toBeUndefined();
    expect(sameProportions(1.7777, 1.78)).toBe(true);
    expect(sameProportions(1.78, 1.5)).toBe(false);
  });
});

describe("reconcileMeta", () => {
  it("re-spaces floor lines and apartment dots when a building was resized, keeps the frame", async () => {
    const { reconcileMeta } = await import("../stage");
    const old: StageBuilding[] = [{ id: "a", name: "A", floorCount: 14, unitsPerFloor: 4 }];
    const meta = defaultMeta(1.7777, old);
    const now: StageBuilding[] = [{ id: "a", name: "A", floorCount: 6, unitsPerFloor: 3 }];
    const r = reconcileMeta(meta, now);
    expect(r.changed).toBe(true);
    expect(r.meta.buildings[0].bands).toHaveLength(7);
    expect(r.meta.buildings[0].slots).toHaveLength(3);
    expect(r.meta.buildings[0].x).toBe(meta.buildings[0].x);
    expect(validateStage(r.meta, now)).toEqual([]);
    expect(reconcileMeta(r.meta, now).changed).toBe(false);
  });
});
