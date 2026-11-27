import { describe, expect, it } from "vitest";
import { YARKON_TWIN } from "../twin/fixtures/yarkon";
import { baselineFromTwin, baselineRef } from "../studio/baseline/fromTwin";
import { emptyDocument, type DesignDocument } from "../studio/schema/document";
import { snapAngle, snapTo, rotateBy, normaliseAngle, twistRotation } from "../studio/design/snap";
import { previewNode, withTransform } from "../studio/design/preview";
import { findFreeSpot, makeItem } from "../studio/design/spot";
import { insertableModules, withInserted, withoutModule, categoriesOf, filterModels, materialsForSlot, materialsForSurface, modularPresets, nextModules } from "../studio/design/options";
import { validateConfig } from "../studio/catalog/modular";
import { CATALOG, CHAIR, PAINT, PARQUET, RUG, SOFA, TABLE, BOUCLE, BRASS } from "./studio-fixtures";
import type { ModelManifest } from "../studio/schema/catalog";

const baseline = baselineFromTwin(YARKON_TWIN);
const doc0 = (): DesignDocument => emptyDocument(baselineRef("yarkon", 1, baseline));
const sofaSizing = SOFA.sizing as Extract<ModelManifest["sizing"], { mode: "modular" }>;

describe("snap", () => {
  it("two-finger twist: clockwise on screen turns clockwise from above, snapped to 15 degrees, across the +-PI seam", () => {
    expect(twistRotation(0, 0, 0.27)).toBeCloseTo(-Math.PI / 12, 9);
    expect(twistRotation(0, 0.5, 0.5 - Math.PI / 2)).toBeCloseTo(Math.PI / 2, 9);
    expect(twistRotation(Math.PI / 2, 0, 0.04)).toBeCloseTo(Math.PI / 2, 9); // under half a step: no change
    expect(twistRotation(0, 3.1, -3.1)).toBeCloseTo(0, 9); // fingers crossing the atan2 seam is a tiny turn, not a full one
    expect(twistRotation(Math.PI, 0, -0.27)).toBeCloseTo(-Math.PI + Math.PI / 12, 9);
  });
  it("snaps to the 5 cm grid and 15 degree steps", () => {
    expect(snapTo(1.234)).toBeCloseTo(1.25, 9);
    expect(snapTo(-0.021)).toBeCloseTo(-0.0, 9);
    expect(snapAngle(0.27)).toBeCloseTo(Math.PI / 12, 9);
    expect(snapAngle(0.01)).toBe(0);
  });
  it("normalises and rotates by steps", () => {
    expect(normaliseAngle(Math.PI * 2 + 0.5)).toBeCloseTo(0.5, 9);
    expect(normaliseAngle(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2, 9);
    expect(rotateBy(0, 6)).toBeCloseTo(Math.PI / 2, 9);
    expect(rotateBy(Math.PI, 1)).toBeCloseTo(-Math.PI + Math.PI / 12, 9);
  });
});

describe("preview", () => {
  it("accepts a legal placement and rejects one outside the apartment", () => {
    const ok = previewNode(doc0(), makeItem(TABLE, 3, 2, 0, "t"), baseline, CATALOG);
    expect(ok.ok).toBe(true);
    const bad = previewNode(doc0(), withTransform(makeItem(TABLE, 3, 2, 0, "t"), { x: 40, y: 40 }), baseline, CATALOG);
    expect(bad.ok).toBe(false);
    expect(bad.errors[0].code).toBe("out-of-room");
  });
  it("only reports issues that involve the previewed node", () => {
    const a = makeItem(TABLE, 3, 2, 0, "a");
    const b = makeItem(TABLE, 3.2, 2.1, 0, "b"); // overlaps a
    const doc = { ...doc0(), nodes: { a, b } };
    const far = previewNode(doc, makeItem(TABLE, 6, 1, 0, "c"), baseline, CATALOG);
    expect(far.errors).toEqual([]);
    const near = previewNode(doc, withTransform(a, { x: 3.1 }), baseline, CATALOG);
    expect(near.errors.some((e) => e.code === "overlap")).toBe(true);
  });
});

describe("makeItem", () => {
  it("uses the default module configuration, variant and no scale", () => {
    const s = makeItem(SOFA, 1, 1, 0, "s");
    expect(s.modules).toEqual(["arm-l", "seat-100", "seat-100", "arm-r"]);
    expect(Object.keys(s.transform).sort()).toEqual(["rot", "x", "y", "z"]);
    expect(makeItem(CHAIR, 1, 1, 0, "c").variantId).toBe("standard");
    expect(makeItem(TABLE, 1, 1).id).toHaveLength(26);
  });
});

describe("findFreeSpot", () => {
  it("returns the requested spot when it is free", () => {
    const spot = findFreeSpot({ doc: doc0(), baseline, catalog: CATALOG, manifest: TABLE, near: [3, 2] });
    expect(spot).toEqual({ x: 3, y: 2 });
  });
  it("moves away from an occupied spot to the nearest legal one", () => {
    const doc = { ...doc0(), nodes: { a: makeItem(TABLE, 3, 2, 0, "a") } };
    const spot = findFreeSpot({ doc, baseline, catalog: CATALOG, manifest: TABLE, near: [3, 2] })!;
    expect(spot).not.toBeNull();
    expect(previewNode(doc, makeItem(TABLE, spot.x, spot.y, 0, "n"), baseline, CATALOG).ok).toBe(true);
    expect(Math.hypot(spot.x - 3, spot.y - 2)).toBeLessThan(1.6);
  });
  it("gives up when the start point is far outside every room", () => {
    expect(findFreeSpot({ doc: doc0(), baseline, catalog: CATALOG, manifest: TABLE, near: [60, 60], radius: 1 })).toBeNull();
  });
  it("places a rug where furniture already stands (floor coverings do not collide)", () => {
    const doc = { ...doc0(), nodes: { a: makeItem(TABLE, 3, 2, 0, "a") } };
    expect(findFreeSpot({ doc, baseline, catalog: CATALOG, manifest: RUG, near: [3, 0.8] })).toEqual({ x: 3, y: 0.8 });
  });
});

describe("options", () => {
  it("offers only materials a slot or surface accepts", () => {
    const mats = [PAINT, PARQUET, BOUCLE, BRASS];
    expect(materialsForSlot(mats, SOFA.slots[0]).map((m) => m.id)).toEqual(["boucle-cream"]);
    expect(materialsForSlot(mats, SOFA.slots[1]).map((m) => m.id)).toEqual(["brass-brushed"]);
    expect(materialsForSurface(mats, "floor").map((m) => m.id)).toEqual(["parquet-oak"]);
    expect(materialsForSurface(mats, "wall").map((m) => m.id)).toEqual(["paint-limewash"]);
  });
  it("filters by text in both languages, style, category and room", () => {
    const models = [SOFA, TABLE, CHAIR, RUG];
    expect(filterModels(models, { query: "sofa" }, "en").map((m) => m.id)).toEqual(["sofa-modular"]);
    expect(filterModels(models, { style: "scandinavian" }, "en").map((m) => m.id)).toEqual(["dining-chair"]);
    expect(filterModels(models, { category: "rug" }, "he").map((m) => m.id)).toEqual(["rug-woven"]);
    expect(filterModels(models, { room: "bedroom" }, "en").map((m) => m.id)).toEqual(["rug-woven"]);
    expect(filterModels(models, {}, "en")).toHaveLength(4);
    expect(categoriesOf(models)).toEqual(["armchair", "chair", "coffee-table", "rug", "sofa"].filter((c) => models.some((m) => m.category === c)));
  });
  it("modular presets are legal and sorted by width", () => {
    const p = modularPresets(sofaSizing);
    expect(p.length).toBeGreaterThan(3);
    for (const x of p) expect(validateConfig(sofaSizing, x.modules)).toEqual([]);
    expect(p.map((x) => x.width)).toEqual([...p.map((x) => x.width)].sort((a, b) => a - b));
    expect(p.some((x) => x.width === 4)).toBe(true);
  });
  it("only offers modules that connect to the end of the run", () => {
    expect(nextModules(sofaSizing, [])).toEqual(["arm-l"]);
    expect(nextModules(sofaSizing, ["arm-l"]).sort()).toEqual(["chaise", "seat-100", "seat-120", "seat-80", "arm-r"].sort());
    expect(nextModules(sofaSizing, ["arm-l", "seat-100", "arm-r"])).toEqual([]);
  });
});

import { STRINGS, makeT } from "../studio/i18n";
import { ASSET_CATEGORIES, STYLES } from "../studio/schema/catalog";

describe("studio i18n", () => {
  it("Hebrew and English define exactly the same keys", () => {
    expect(Object.keys(STRINGS.he).sort()).toEqual(Object.keys(STRINGS.en).sort());
  });
  it("every style, asset category and validation code has a label", () => {
    const t = makeT("en");
    for (const s of STYLES) expect(t(`style.${s}`)).not.toBe(`style.${s}`);
    for (const c of ASSET_CATEGORIES) expect(t(`cat.${c}`)).not.toBe(`cat.${c}`);
    for (const c of ["unknown-asset", "bad-size", "out-of-room", "overlap", "wall-collision", "blocks-opening"]) expect(t(`err.${c}`)).not.toBe(`err.${c}`);
    for (const c of ["door-swing", "clearance", "narrow-passage", "not-against-wall"]) expect(makeT("he")(`adv.${c}`)).not.toBe(`adv.${c}`);
  });
  it("no empty strings", () => {
    for (const l of ["he", "en"] as const) for (const v of Object.values(STRINGS[l])) expect(v.trim().length).toBeGreaterThan(0);
  });
});

describe("module editing keeps runs legal", () => {
  it("inserts and removes interior seats", () => {
    const base = ["arm-l", "seat-100", "seat-100", "arm-r"];
    expect(insertableModules(sofaSizing).sort()).toEqual(["seat-100", "seat-120", "seat-80"]);
    const more = withInserted(sofaSizing, base, "seat-120")!;
    expect(more).toEqual(["arm-l", "seat-100", "seat-100", "seat-120", "arm-r"]);
    expect(validateConfig(sofaSizing, more)).toEqual([]);
    expect(withoutModule(sofaSizing, more, 2)).toEqual(["arm-l", "seat-100", "seat-120", "arm-r"]);
  });
  it("refuses edits that would break the run", () => {
    expect(withInserted(sofaSizing, ["arm-l", "seat-100", "arm-r"], "chaise")).toBeNull();
    expect(withInserted(sofaSizing, ["arm-l", "seat-100", "arm-r"], "arm-r")).toBeNull();
    expect(withoutModule(sofaSizing, ["arm-l", "seat-100", "arm-r"], 1)).toBeNull(); // would leave no seat
    expect(withoutModule(sofaSizing, ["arm-l", "seat-100", "seat-100", "arm-r"], 0)).toBeNull(); // ends stay
    expect(withoutModule(sofaSizing, ["arm-l", "seat-100", "seat-100", "arm-r"], 3)).toBeNull();
  });
});

describe("module labels", () => {
  it("names seats and known modules in both languages", async () => {
    const { moduleLabel } = await import("../studio/i18n");
    expect(moduleLabel(makeT("en"), "seat-120")).toBe("Seat 120");
    expect(moduleLabel(makeT("he"), "arm-l")).toBe("ידית שמאל");
    expect(moduleLabel(makeT("en"), "chaise")).toBe("Chaise");
    expect(moduleLabel(makeT("en"), "mystery")).toBe("mystery");
  });
});
