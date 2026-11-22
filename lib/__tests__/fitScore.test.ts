import { describe, it, expect } from "vitest";
import { computeFit } from "../fitScore";

const ok = { valid: true, lowerBound: 57, upperBound: 74, hardFilterFailReasons: [] };
const base = {
  prefs: { location: "תל אביב", bedrooms: 4, budget_max: 3500000, must_haves: ["מרפסת שמש", "חניה", "שקט"], dealbreakers: [] as string[] },
  outcome: ok, ej: 74, aj: 57,
};

describe("computeFit", () => {
  it("a listing meeting every stated requirement scores high even when Zij would be low", () => {
    const r = computeFit({ ...base, price: 3200000, attributes: { rooms: 5, balconySqm: 12, parking: 1 } });
    expect(r.score).toBeGreaterThanOrEqual(90);
  });

  it("unknown data is left out, not counted as a miss", () => {
    const r = computeFit({ ...base, price: 3200000, attributes: { rooms: 5 } });
    const musts = r.components.find((c) => c.id === "musts")!;
    expect(musts.musts!.unknown).toEqual(["balcony", "parking"]);
    expect(r.score).toBeGreaterThan(80);
  });

  it("over budget lowers the score and reaches zero around +33%", () => {
    const within = computeFit({ ...base, price: 3500000, attributes: { rooms: 5 } });
    const over = computeFit({ ...base, price: 4000000, attributes: { rooms: 5 } });
    const way = computeFit({ ...base, price: 5000000, attributes: { rooms: 5 } });
    expect(over.score).toBeLessThan(within.score);
    expect(way.components.find((c) => c.id === "budget")!.score).toBe(0);
  });

  it("a location miss and a short room count both reduce the score", () => {
    const loc = computeFit({ ...base, outcome: { ...ok, hardFilterFailReasons: [{ kind: "location", actual: "x", required: "y" }] }, price: 3000000, attributes: { rooms: 5 } });
    expect(loc.components.find((c) => c.id === "location")!.score).toBe(0);
    const few = computeFit({ ...base, price: 3000000, attributes: { rooms: 3 } });
    expect(few.components.find((c) => c.id === "rooms")!.score).toBeLessThan(100);
  });

  it("infeasible Zij gives the agreement component zero", () => {
    const r = computeFit({ ...base, outcome: { valid: false, lowerBound: 80, upperBound: 70 }, price: 3000000, attributes: { rooms: 5 } });
    expect(r.components.find((c) => c.id === "agree")!.score).toBe(0);
  });

  it("returns 0-100 and never NaN with no data at all", () => {
    const r = computeFit({ prefs: {}, outcome: ok, ej: 74, aj: 57 });
    expect(Number.isFinite(r.score)).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});
