import { describe, expect, it } from "vitest";
import { cellsBetween, planPlacement, unitNumberFor, type PlacedUnit } from "../placement";

const u = (id: string, floor: number, positionIndex: number, unitTypeId: string, status = "available"): PlacedUnit => ({ id, floor, positionIndex, unitTypeId, status });

describe("placement", () => {
  it("numbers apartments by floor and position", () => {
    expect(unitNumberFor(5, 1)).toBe("502");
    expect(unitNumberFor(14, 2)).toBe("1403");
    expect(unitNumberFor(1, 0)).not.toBe(unitNumberFor(10, 0));
  });

  it("creates in empty cells, retypes available apartments and removes on clear", () => {
    const existing = [u("a", 2, 0, "T5"), u("b", 2, 1, "T5")];
    const plan = planPlacement(existing, [
      { floor: 1, positionIndex: 0, unitTypeId: "T6" },
      { floor: 2, positionIndex: 0, unitTypeId: "T6" },
      { floor: 2, positionIndex: 1, unitTypeId: null },
      { floor: 3, positionIndex: 0, unitTypeId: null },
    ]);
    expect(plan.create).toEqual([{ floor: 1, positionIndex: 0, unitTypeId: "T6", unitNumber: "101" }]);
    expect(plan.retype).toEqual([{ id: "a", unitTypeId: "T6" }]);
    expect(plan.remove).toEqual(["b"]);
    expect(plan.blocked).toEqual([]);
  });

  it("never changes or removes a reserved or sold apartment", () => {
    const existing = [u("a", 1, 0, "T5", "reserved"), u("b", 1, 1, "T5", "sold")];
    const plan = planPlacement(existing, [
      { floor: 1, positionIndex: 0, unitTypeId: "T6" },
      { floor: 1, positionIndex: 1, unitTypeId: null },
    ]);
    expect(plan.retype).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(plan.blocked.map((b) => b.status)).toEqual(["reserved", "sold"]);
  });

  it("ignores no-op edits and repeated cells", () => {
    const plan = planPlacement([u("a", 1, 0, "T5")], [
      { floor: 1, positionIndex: 0, unitTypeId: "T5" },
      { floor: 2, positionIndex: 0, unitTypeId: "T5" },
      { floor: 2, positionIndex: 0, unitTypeId: "T6" },
    ]);
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0].unitTypeId).toBe("T5");
    expect(plan.retype).toEqual([]);
  });

  it("selects the rectangle between two cells in any direction", () => {
    expect(cellsBetween({ floor: 3, positionIndex: 1 }, { floor: 1, positionIndex: 0 })).toHaveLength(6);
  });
});
