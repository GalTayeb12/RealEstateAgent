import { describe, expect, it } from "vitest";
import { YARKON_TWIN } from "../twin/fixtures/yarkon";
import { baselineFromTwin, baselineRef } from "../studio/baseline/fromTwin";
import { emptyDocument, type DesignDocument } from "../studio/schema/document";
import { ItemNode } from "../studio/schema/nodes";
import { advisoriesOf, errorsOf, validateDocument } from "../studio/validation/placement";
import { CATALOG, CHAIR, RUG, SHELF, SOFA, TABLE, WARDROBE, ref } from "./studio-fixtures";

const baseline = baselineFromTwin(YARKON_TWIN);
const docWith = (...nodes: ReturnType<typeof item>[]): DesignDocument => ({
  ...emptyDocument(baselineRef("yarkon", 1, baseline)),
  nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
});
const item = (id: string, m: { id: string; version: number }, x: number, y: number, rot = 0, over: Record<string, unknown> = {}) =>
  ItemNode.parse({ id, kind: "item", catalog: ref(m), transform: { x, y, rot }, ...over });
const check = (...nodes: ReturnType<typeof item>[]) => validateDocument(docWith(...nodes), baseline, CATALOG);
const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

// Living room (L-shape) spans y 0..4.6, x 0..8.2 (x ..7.0 below y = 3.4).
// A sofa facing the facade stands with its back to the y = 4.6 wall: rot = PI, origin at y = 4.5.
const SOFA_3_2 = ["arm-l", "seat-100", "seat-100", "seat-100", "arm-r"]; // 3.4 m: 0.4 + 3.0
const sofaAt = (x: number, over: Record<string, unknown> = {}) => item("sofa", SOFA, x, 4.5, Math.PI, { modules: SOFA_3_2, ...over });

describe("placement validation: hard errors", () => {
  it("a well placed sofa and table produce no errors", () => {
    const issues = check(sofaAt(5), item("table", TABLE, 5, 2.6));
    expect(errorsOf(issues)).toEqual([]);
  });

  it("flags items outside every room", () => {
    const issues = check(item("t", TABLE, 30, 30));
    expect(codes(errorsOf(issues))).toContain("out-of-room");
  });

  it("flags a sofa sticking out of the L-shaped room into the corner notch", () => {
    // 4 m sofa centred at x = 5.2 reaches x = 7.2, beyond the x = 7.0 edge of the lower part
    const four = ["arm-l", "seat-120", "seat-120", "seat-120", "arm-r"];
    const issues = check(sofaAt(5.2, { modules: four }));
    expect(codes(errorsOf(issues))).toContain("out-of-room");
  });

  it("flags items overlapping each other, but only when their heights overlap", () => {
    const overlap = check(item("a", TABLE, 3, 2), item("b", TABLE, 3.4, 2.2));
    expect(codes(errorsOf(overlap))).toContain("overlap");
    const raised = check(item("a", TABLE, 3, 2), ItemNode.parse({ id: "b", kind: "item", catalog: ref(TABLE), transform: { x: 3.4, y: 2.2, z: 1.5, rot: 0 } }));
    expect(codes(errorsOf(raised))).not.toContain("overlap");
  });

  it("allows items that merely touch", () => {
    const issues = check(item("a", TABLE, 3, 2), item("b", TABLE, 4.2, 2)); // 1.2 m wide tables side by side
    expect(codes(errorsOf(issues))).not.toContain("overlap");
  });

  it("a rug under a table is fine", () => {
    const issues = check(item("rug", RUG, 4, 0.6), item("table", TABLE, 4, 1.4));
    expect(codes(errorsOf(issues))).not.toContain("overlap");
  });

  it("flags furniture buried in a wall", () => {
    const issues = check(item("t", TABLE, 3.2, 4.6)); // on top of the bed3-front interior wall
    expect(codes(errorsOf(issues))).toContain("wall-collision");
  });

  it("flags furniture standing in a doorway", () => {
    // bed3-front door spans x 2.25..3.1 on y = 4.6
    const issues = check(item("t", TABLE, 2.7, 4.65, Math.PI));
    expect(codes(errorsOf(issues))).toContain("blocks-opening");
  });

  it("wall-mounted items may touch walls and skip collision", () => {
    const issues = check(item("shelf", SHELF, 5, 4.56, Math.PI));
    expect(errorsOf(issues)).toEqual([]);
  });

  it("flags unknown catalog references", () => {
    const issues = check(item("ghost", { id: "ghost", version: 1 }, 3, 2));
    expect(codes(errorsOf(issues))).toEqual(["unknown-asset"]);
  });

  it("flags illegal sizes already stored in a document", () => {
    const issues = check(item("s", SOFA, 5, 4.5, Math.PI, { modules: ["seat-100", "arm-r"] }));
    expect(codes(errorsOf(issues))).toContain("bad-size");
  });

  it("returns the same errors on repeated runs (pure)", () => {
    const d = docWith(item("a", TABLE, 3, 2), item("b", TABLE, 3.4, 2.2));
    expect(validateDocument(d, baseline, CATALOG)).toEqual(validateDocument(d, baseline, CATALOG));
  });
});

describe("placement validation: advisories", () => {
  it("warns when an item sits in a door swing zone", () => {
    // 3.4 m sofa at x = 4.2 spans x 2.5..5.9, over the bed3 door (x 2.25..3.1)
    const issues = check(sofaAt(4.2));
    expect(codes(advisoriesOf(issues))).toContain("door-swing");
    expect(errorsOf(issues)).toEqual([]);
  });

  it("warns when the clearance in front of a sofa is blocked", () => {
    const issues = check(sofaAt(5), item("table", TABLE, 5, 3.0, Math.PI)); // table 0.6 m in front of the sofa front (y 3.55)
    expect(codes(advisoriesOf(issues))).toContain("clearance");
  });

  it("warns about narrow passages between floor items", () => {
    const issues = check(item("a", TABLE, 3, 2), item("b", TABLE, 4.5, 2)); // 0.3 m gap
    const adv = advisoriesOf(issues);
    expect(codes(adv)).toContain("narrow-passage");
    expect(codes(errorsOf(issues))).not.toContain("overlap");
  });

  it("does not warn when the gap is generous", () => {
    const issues = check(item("a", TABLE, 3, 2), item("b", TABLE, 5, 2));
    expect(codes(advisoriesOf(issues))).not.toContain("narrow-passage");
  });

  it("warns when a wall-hugging asset stands in the middle of the room", () => {
    const issues = check(item("w", WARDROBE, 3, 2, 0, { params: { width: 2.0 } }));
    expect(codes(advisoriesOf(issues))).toContain("not-against-wall");
  });

  it("does not warn for a wardrobe against the wall with free space in front", () => {
    // back against the facade-side wall is glazing at y = 0; use the y = 4.6 wall facing the facade
    const issues = check(item("w", WARDROBE, 1.5, 4.5, Math.PI, { params: { width: 2.0 } }));
    expect(codes(advisoriesOf(issues))).not.toContain("not-against-wall");
  });

  it("variant assets validate with their chosen size", () => {
    const issues = check(item("c", CHAIR, 3, 2, 0, { variantId: "bar" }));
    expect(errorsOf(issues)).toEqual([]);
  });
});

describe("placement options", () => {
  it("honours a custom passage recommendation", () => {
    const d = docWith(item("a", TABLE, 3, 2), item("b", TABLE, 5, 2)); // 0.8 m gap
    expect(codes(advisoriesOf(validateDocument(d, baseline, CATALOG, { passageMin: 0.9 })))).toContain("narrow-passage");
    expect(codes(advisoriesOf(validateDocument(d, baseline, CATALOG, { passageMin: 0.5 })))).not.toContain("narrow-passage");
  });
});
