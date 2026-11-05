/**
 * Unit tests for the Zij matching engine.
 *
 * Variables recap:
 *   eil  = seller's minimum listing score
 *   ail  = seller's acceptance/asking score
 *   ēj   = buyer's expected score  (expectedScore)
 *   āj   = buyer's minimum acceptance score  (minAcceptanceScore)
 *   pfij = optimal matched price = min(ēj, ail)   [when feasible]
 *   Zij  = 2·pfij - eil - ēj
 */

import { describe, it, expect } from "vitest";
import { computeZij, matchBuyerToAoms, checkHardFilters, BuyerProfile, AomCandidate, HardFilterCriteria } from "../matching";

describe("1 · Standard feasible match", () => {
  // eil=60, ail=80, ēj=90, āj=50
  // lowerBound = max(60, 50) = 60
  // upperBound = min(90, 80) = 80
  // pfij* = 80
  // Zij   = 2*80 - 60 - 90 = 160 - 150 = 10
  const buyer: BuyerProfile = { expectedScore: 90, minAcceptanceScore: 50 };
  const aom: AomCandidate   = { id: "a1", title: "AOM-1", eil: 60, ail: 80 };
  const result = computeZij(buyer, aom);

  it("valid", () => { expect(result.valid).toBe(true); });
  it("pfij = 80", () => { expect(result.pfij).toBe(80); });
  it("zij = 10", () => { expect(result.zij).toBe(10); });
  it("lowerBound = 60", () => { expect(result.lowerBound).toBe(60); });
  it("upperBound = 80", () => { expect(result.upperBound).toBe(80); });
});

describe("2 · Buyer expected score is binding (ēj < ail)", () => {
  // eil=50, ail=95, ēj=70, āj=40
  // upperBound = min(70, 95) = 70  ← ēj is the tighter cap
  // pfij* = 70
  // Zij = 2*70 - 50 - 70 = 140 - 120 = 20
  const buyer: BuyerProfile = { expectedScore: 70, minAcceptanceScore: 40 };
  const aom: AomCandidate   = { id: "a2", title: "AOM-2", eil: 50, ail: 95 };
  const result = computeZij(buyer, aom);

  it("valid", () => { expect(result.valid).toBe(true); });
  it("pfij = 70 (ēj caps it)", () => { expect(result.pfij).toBe(70); });
  it("zij = 20", () => { expect(result.zij).toBe(20); });
});

describe("3 · Infeasible — seller floor > buyer ceiling", () => {
  // eil=100, ail=120, ēj=80, āj=50
  // lowerBound = max(100, 50) = 100
  // upperBound = min(80, 120) = 80
  // 100 > 80  →  no feasible pfij
  const buyer: BuyerProfile = { expectedScore: 80, minAcceptanceScore: 50 };
  const aom: AomCandidate   = { id: "a3", title: "AOM-3", eil: 100, ail: 120 };
  const result = computeZij(buyer, aom);

  it("valid = false", () => { expect(result.valid).toBe(false); });
  it("zij = -Infinity", () => { expect(result.zij).toBe(-Infinity); });
  it("pfij is NaN", () => { expect(Number.isNaN(result.pfij)).toBe(true); });
});

describe("4 · Infeasible — buyer minimum > seller asking (āj > ail)", () => {
  // eil=40, ail=60, ēj=90, āj=70
  // lowerBound = max(40, 70) = 70
  // upperBound = min(90, 60) = 60
  // 70 > 60  →  infeasible
  const buyer: BuyerProfile = { expectedScore: 90, minAcceptanceScore: 70 };
  const aom: AomCandidate   = { id: "a4", title: "AOM-4", eil: 40, ail: 60 };
  const result = computeZij(buyer, aom);

  it("valid = false (āj > ail)", () => { expect(result.valid).toBe(false); });
});

describe("5 · Exact-boundary match (pfij lands on lower bound)", () => {
  // eil=75, ail=75, ēj=100, āj=50
  // upperBound = min(100, 75) = 75
  // lowerBound = max(75,  50) = 75
  // pfij* = 75
  // Zij = 2*75 - 75 - 100 = 150 - 175 = -25   (still valid, just low quality)
  const buyer: BuyerProfile = { expectedScore: 100, minAcceptanceScore: 50 };
  const aom: AomCandidate   = { id: "a5", title: "AOM-5", eil: 75, ail: 75 };
  const result = computeZij(buyer, aom);

  it("valid (exact boundary)", () => { expect(result.valid).toBe(true); });
  it("pfij = 75", () => { expect(result.pfij).toBe(75); });
  it("zij = -25", () => { expect(result.zij).toBe(-25); });
});

describe("6 · Ranking — three AOMs should sort by Zij desc", () => {
  const buyer: BuyerProfile = { expectedScore: 100, minAcceptanceScore: 40 };
  const aoms: AomCandidate[] = [
    { id: "b1", title: "Low",    eil: 40, ail: 60  },  // pfij=60, zij=2*60-40-100=-20
    { id: "b2", title: "High",   eil: 50, ail: 90  },  // pfij=90, zij=2*90-50-100=30
    { id: "b3", title: "Medium", eil: 30, ail: 70  },  // pfij=70, zij=2*70-30-100=10
    { id: "b4", title: "Inval",  eil: 110, ail: 130 }, // infeasible
  ];

  const ranked = matchBuyerToAoms(buyer, aoms);

  it("1st place = High (zij=30)",   () => { expect(ranked[0].aomId).toBe("b2"); });
  it("2nd place = Medium (zij=10)", () => { expect(ranked[1].aomId).toBe("b3"); });
  it("3rd place = Low (zij=-20)",   () => { expect(ranked[2].aomId).toBe("b1"); });
  it("4th place = Inval (invalid)", () => { expect(ranked[3].aomId).toBe("b4"); });
  it("Inval.valid = false",         () => { expect(ranked[3].valid).toBe(false); });
});

describe("7 · Floating-point scores", () => {
  // eil=0.5, ail=0.85, ēj=0.9, āj=0.3
  // pfij* = min(0.9, 0.85) = 0.85
  // Zij  = 2*0.85 - 0.5 - 0.9 = 1.7 - 1.4 = 0.3
  const buyer: BuyerProfile = { expectedScore: 0.9, minAcceptanceScore: 0.3 };
  const aom: AomCandidate   = { id: "c1", title: "Float-AOM", eil: 0.5, ail: 0.85 };
  const result = computeZij(buyer, aom);

  it("valid", () => { expect(result.valid).toBe(true); });
  it("pfij ≈ 0.85", () => { expect(result.pfij).toBeCloseTo(0.85, 10); });
  it("zij ≈ 0.30",  () => { expect(result.zij).toBeCloseTo(0.30, 10); });
});

describe("8 · computeZij initialises hard filter fields", () => {
  const buyer: BuyerProfile = { expectedScore: 80, minAcceptanceScore: 60 };
  const aom: AomCandidate   = { id: "d1", title: "D1", eil: 55, ail: 75 };
  const result = computeZij(buyer, aom);

  it("passesHardFilters defaults to true", () => {
    expect(result.passesHardFilters).toBe(true);
  });
  it("hardFilterFailReasons defaults to empty array", () => {
    expect(result.hardFilterFailReasons).toEqual([]);
  });
});

// ── checkHardFilters ──────────────────────────────────────────────────────────

describe("9 · checkHardFilters — rooms", () => {
  const makeCand = (rooms: number): AomCandidate => ({
    id: "e1", title: "T", eil: 50, ail: 70, attributes: { rooms },
  });

  it("passes when property has exactly the required rooms", () => {
    expect(checkHardFilters(makeCand(4), { minRooms: 4 }).passes).toBe(true);
  });

  it("passes when property has more rooms than required", () => {
    expect(checkHardFilters(makeCand(5), { minRooms: 4 }).passes).toBe(true);
  });

  it("fails when property has fewer rooms than required", () => {
    const { passes, reasons } = checkHardFilters(makeCand(3), { minRooms: 4 });
    expect(passes).toBe(false);
    expect(reasons).toHaveLength(1);
    if (reasons[0].kind === "rooms") {
      expect(reasons[0].actual).toBe(3);
      expect(reasons[0].required).toBe(4);
    }
  });

  it("skips rooms check when minRooms is null", () => {
    expect(checkHardFilters(makeCand(2), { minRooms: null }).passes).toBe(true);
  });

  it("skips rooms check when attribute is missing (lenient on missing data)", () => {
    const cand: AomCandidate = { id: "e", title: "T", eil: 50, ail: 70, attributes: {} };
    expect(checkHardFilters(cand, { minRooms: 4 }).passes).toBe(true);
  });

  it("checks 'bedrooms' key as fallback when 'rooms' is absent", () => {
    const cand: AomCandidate = {
      id: "e", title: "T", eil: 50, ail: 70,
      attributes: { bedrooms: 3 },
    };
    const { passes, reasons } = checkHardFilters(cand, { minRooms: 4 });
    expect(passes).toBe(false);
    expect(reasons[0].kind).toBe("rooms");
  });
});

describe("10 · checkHardFilters — budget", () => {
  const makeCand = (price: number): AomCandidate => ({
    id: "f1", title: "T", eil: 50, ail: 70, price,
  });

  it("passes when price is within budget", () => {
    expect(checkHardFilters(makeCand(2_000_000), { maxBudget: 2_500_000 }).passes).toBe(true);
  });

  it("passes when price equals budget exactly", () => {
    expect(checkHardFilters(makeCand(2_500_000), { maxBudget: 2_500_000 }).passes).toBe(true);
  });

  it("fails when price exceeds budget", () => {
    const { passes, reasons } = checkHardFilters(makeCand(3_000_000), { maxBudget: 2_500_000 });
    expect(passes).toBe(false);
    expect(reasons[0].kind).toBe("budget");
  });

  it("skips budget check when maxBudget is null", () => {
    expect(checkHardFilters(makeCand(5_000_000), { maxBudget: null }).passes).toBe(true);
  });

  it("skips budget check when price is missing", () => {
    const cand: AomCandidate = { id: "f", title: "T", eil: 50, ail: 70 };
    expect(checkHardFilters(cand, { maxBudget: 1_000_000 }).passes).toBe(true);
  });
});

describe("11 · checkHardFilters — location", () => {
  const makeCand = (location: string): AomCandidate => ({
    id: "g1", title: "T", eil: 50, ail: 70, location,
  });

  it("passes when locations match exactly", () => {
    expect(checkHardFilters(makeCand("Tel Aviv"), { location: "Tel Aviv" }).passes).toBe(true);
  });

  it("passes for Tel Aviv vs Tel Aviv-Yafo (substring overlap)", () => {
    expect(checkHardFilters(makeCand("Tel Aviv-Yafo"), { location: "Tel Aviv" }).passes).toBe(true);
  });

  it("fails when locations share no significant word", () => {
    const { passes, reasons } = checkHardFilters(makeCand("Ramat Gan"), { location: "Tel Aviv" });
    expect(passes).toBe(false);
    expect(reasons[0].kind).toBe("location");
  });

  it("skips location check when buyer location is null", () => {
    expect(checkHardFilters(makeCand("Haifa"), { location: null }).passes).toBe(true);
  });

  it("skips location check when property location is missing", () => {
    const cand: AomCandidate = { id: "g", title: "T", eil: 50, ail: 70 };
    expect(checkHardFilters(cand, { location: "Tel Aviv" }).passes).toBe(true);
  });
});

describe("12 · checkHardFilters — multiple criteria", () => {
  it("collects all fail reasons when multiple criteria fail", () => {
    const cand: AomCandidate = {
      id: "h1", title: "T", eil: 50, ail: 70,
      price: 4_000_000,
      location: "Haifa",
      attributes: { rooms: 2 },
    };
    const criteria: HardFilterCriteria = {
      minRooms: 4,
      maxBudget: 3_000_000,
      location: "Tel Aviv",
    };
    const { passes, reasons } = checkHardFilters(cand, criteria);
    expect(passes).toBe(false);
    expect(reasons).toHaveLength(3);
    expect(reasons.map((r) => r.kind).sort()).toEqual(["budget", "location", "rooms"]);
  });

  it("passes when all criteria are met", () => {
    const cand: AomCandidate = {
      id: "h2", title: "T", eil: 50, ail: 70,
      price: 2_000_000,
      location: "Tel Aviv",
      attributes: { rooms: 4 },
    };
    expect(
      checkHardFilters(cand, { minRooms: 4, maxBudget: 3_000_000, location: "Tel Aviv" }).passes
    ).toBe(true);
  });
});
