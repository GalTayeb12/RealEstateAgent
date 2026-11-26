import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { YARKON_TWIN } from "../twin/fixtures/yarkon";
import { baselineFromTwin, baselineRef } from "../studio/baseline/fromTwin";
import { apply } from "../studio/commands/apply";
import { dryRunPropose } from "../studio/ai/dryRun";
import { buildContext } from "../studio/ai/anthropic";
import { MAX_AI_ADDS, sanitizeAiCommands } from "../studio/ai/validate";
import { catalogFrom, MaterialManifest, ModelManifest } from "../studio/schema/catalog";
import { emptyDocument } from "../studio/schema/document";
import { errorsOf, validateDocument } from "../studio/validation/placement";

const baseline = baselineFromTwin(YARKON_TWIN);
const idx = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../public/studio/catalog/index.json"), "utf8"));
const models = idx.models.map((m: unknown) => ModelManifest.parse(m)) as ModelManifest[];
const catalog = catalogFrom(models, idx.materials.map((m: unknown) => MaterialManifest.parse(m)));
const doc0 = () => emptyDocument(baselineRef("yarkon", 1, baseline));
const item = (id: string, cat: string, x: number, y: number, extra: object = {}) => ({ type: "add", node: { id, kind: "item", locked: false, catalog: { id: cat, version: 1 }, slots: {}, transform: { x, y, z: 0, rot: 0 }, ...extra } });

describe("sanitizeAiCommands: nothing invalid reaches the client", () => {
  it("accepts a legal placement and gives the node a real id", () => {
    const o = sanitizeAiCommands([item("mine", "coffee-drum-01", 4, 2)], doc0(), baseline, catalog);
    expect(o.accepted).toBe(1);
    expect(o.batch?.type).toBe("batch");
    const added = Object.keys(o.doc.nodes);
    expect(added).toHaveLength(1);
    expect(added[0]).not.toBe("mine");
  });

  it("rewrites later references to an invented id", () => {
    const o = sanitizeAiCommands([item("a", "coffee-drum-01", 4, 2), { type: "rotate", id: "a", rot: 1 }], doc0(), baseline, catalog);
    expect(o.accepted).toBe(2);
    expect(Object.values(o.doc.nodes)[0]).toMatchObject({ transform: { rot: 1 } });
  });

  it("drops unknown assets, illegal sizes, bad params and malformed commands with a reason", () => {
    const o = sanitizeAiCommands([
      item("a", "not-in-catalog", 4, 2),
      item("b", "wardrobe-hinged-01", 4, 2, { params: { width: 99 } }),
      { type: "move", id: "ghost", x: 1, y: 1 },
      { type: "teleport" },
      "nonsense",
    ], doc0(), baseline, catalog);
    expect(o.accepted).toBe(0);
    expect(o.batch).toBeNull();
    expect(o.rejected).toHaveLength(5);
  });

  it("refuses placements that fail validation (outside the apartment, through a wall, on another item)", () => {
    const o = sanitizeAiCommands([
      item("a", "coffee-drum-01", 40, 40),
      item("b", "sofa-modular-01", 4, 4.6), // straddles the wall between living room and bedroom
      item("c", "coffee-drum-01", 4, 2),
      item("d", "coffee-drum-01", 4, 2), // same spot as c
    ], doc0(), baseline, catalog);
    expect(o.accepted).toBe(1);
    expect(o.rejected.map((r) => r.index).sort()).toEqual([0, 1, 3]);
    expect(errorsOf(validateDocument(o.doc, baseline, catalog))).toEqual([]);
  });

  it("never lets a model wipe the design or nest batches", () => {
    const o = sanitizeAiCommands([{ type: "restoreBaseline" }, { type: "batch", commands: [item("a", "coffee-drum-01", 4, 2)] }], doc0(), baseline, catalog);
    expect(o.accepted).toBe(0);
    expect(o.rejected.map((r) => r.reason).join()).toContain("not allowed");
  });

  it("does not touch protected structure: no openings in exterior walls", () => {
    const o = sanitizeAiCommands([{ type: "add", node: { id: "o", kind: "openingProposal", locked: false, wallId: "wall:back", at: 6, width: 0.9 } }], doc0(), baseline, catalog);
    expect(o.accepted).toBe(0);
  });

  it("caps the number of new items and rejects non-lists", () => {
    const many = Array.from({ length: 60 }, (_, i) => item(`n${i}`, "coffee-drum-01", 0.5 + (i % 15) * 0.5, 0.5 + Math.floor(i / 15) * 0.5));
    const o = sanitizeAiCommands(many, doc0(), baseline, catalog);
    expect(o.accepted).toBeLessThanOrEqual(MAX_AI_ADDS);
    expect(sanitizeAiCommands({ commands: [] }, doc0(), baseline, catalog).rejected[0].index).toBe(-1);
  });

  it("the accepted batch applies to the REAL document and undoes in one step", () => {
    const o = sanitizeAiCommands([item("a", "coffee-drum-01", 4, 2), item("b", "side-drum-01", 5, 2)], doc0(), baseline, catalog);
    const r = apply(doc0(), o.batch!, { baseline, catalog });
    expect(Object.keys(r.doc.nodes)).toHaveLength(2);
    expect(apply(r.doc, r.inverse, { baseline, catalog }).doc.nodes).toEqual({});
  });
});

describe("free dry-run planner", () => {
  const run = (prompt: string) => {
    const p = dryRunPropose(prompt, doc0(), baseline, catalog);
    return { p, out: sanitizeAiCommands(p.commands, doc0(), baseline, catalog) };
  };

  it("furnishes the living room from an English or Hebrew prompt", () => {
    for (const prompt of ["furnish the living room", "תרהט את הסלון"]) {
      const { out } = run(prompt);
      expect(out.accepted, prompt).toBeGreaterThanOrEqual(3);
      expect(out.rejected, prompt).toEqual([]);
      expect(errorsOf(validateDocument(out.doc, baseline, catalog))).toEqual([]);
    }
  });

  it("builds a bedroom and a kitchen that pass validation", () => {
    for (const prompt of ["bedroom", "מטבח"]) {
      const { out } = run(prompt);
      expect(out.accepted, prompt).toBeGreaterThanOrEqual(2);
      expect(errorsOf(validateDocument(out.doc, baseline, catalog)), prompt).toEqual([]);
    }
  });

  it("says so when it does not understand, and proposes nothing", () => {
    const { p, out } = run("make it purple");
    expect(p.commands).toEqual([]);
    expect(out.batch).toBeNull();
    expect(p.summary).toMatch(/could not/i);
  });
});

describe("model context", () => {
  it("lists rooms, openings and a compact catalog, never document secrets", () => {
    const c = buildContext(doc0(), baseline, models);
    expect(c.rooms.length).toBe(Object.keys(baseline.rooms).length);
    expect(c.catalog.length).toBe(models.length);
    expect(c.catalog.find((m) => m.id === "wardrobe-hinged-01")?.params?.length).toBe(2);
    expect(JSON.stringify(c)).not.toMatch(/ownerId|token|password/i);
  });
});
