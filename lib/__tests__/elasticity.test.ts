/**
 * Unit tests for the Elasticity Engine.
 *
 * Formula recap:
 *   buyerFlex    = ēj  − āj
 *   sellerFlex   = ail − eil
 *   sellerWeight = 1 / max(sellerFlex, 1)
 *   buyerWeight  = 1 / max(buyerFlex, 1)
 *   suggested    = clamp(round((sellerWeight·upperBound + buyerWeight·lowerBound)
 *                              / (sellerWeight + buyerWeight)),
 *                         lowerBound, upperBound)
 *
 * Direction threshold: one side must be < 75% as flexible as the other.
 */

import { describe, it, expect } from "vitest";
import { computeElasticity, ElasticityResult } from "../elasticity";

describe("1 · Infeasible match — returns null", () => {
  // lowerBound > upperBound
  const result = computeElasticity(
    { ej: 70, aj: 50 },
    { eil: 80, ail: 100 },
    { lowerBound: 80, upperBound: 70 }   // infeasible
  );

  it("returns null", () => { expect(result).toBeNull(); });
});

describe("2 · Buyer more flexible than seller → weighted toward seller's target", () => {
  // buyerFlex  = 90 − 50 = 40
  // sellerFlex = 70 − 60 = 10
  // sellerFlex(10) < buyerFlex(40) * 0.75 = 30  → direction: toward_seller
  //
  // lowerBound = max(60, 50) = 60
  // upperBound = min(90, 70) = 70
  //
  // sellerWeight = 1/10 = 0.1
  // buyerWeight  = 1/40 = 0.025
  // raw = (0.1*70 + 0.025*60) / 0.125 = (7 + 1.5) / 0.125 = 8.5 / 0.125 = 68
  // suggestedScore = 68  (closer to upperBound=70, i.e. seller's preferred end)
  const result = computeElasticity(
    { ej: 90, aj: 50 },
    { eil: 60, ail: 70 },
    { lowerBound: 60, upperBound: 70 }
  ) as ElasticityResult;

  it("not null", () => { expect(result !== null).toBe(true); });
  it("direction = toward_seller", () => { expect(result.direction).toBe("toward_seller"); });
  it("suggestedScore = 68", () => { expect(result.suggestedScore).toBe(68); });
  it("buyerFlex = 40", () => { expect(result.buyerFlex).toBe(40); });
  it("sellerFlex = 10", () => { expect(result.sellerFlex).toBe(10); });
  it("suggestedScore ≥ lowerBound", () => { expect(result.suggestedScore >= 60).toBe(true); });
  it("suggestedScore ≤ upperBound", () => { expect(result.suggestedScore <= 70).toBe(true); });
});

describe("3 · Seller more flexible than buyer → weighted toward buyer's range", () => {
  // buyerFlex  = 70 − 60 = 10
  // sellerFlex = 80 − 40 = 40
  // buyerFlex(10) < sellerFlex(40) * 0.75 = 30  → direction: toward_buyer
  //
  // lowerBound = max(40, 60) = 60
  // upperBound = min(70, 80) = 70
  //
  // sellerWeight = 1/40 = 0.025
  // buyerWeight  = 1/10 = 0.1
  // raw = (0.025*70 + 0.1*60) / 0.125 = (1.75 + 6) / 0.125 = 7.75 / 0.125 = 62
  // suggestedScore = 62  (closer to lowerBound=60, i.e. buyer's preferred end)
  const result = computeElasticity(
    { ej: 70, aj: 60 },
    { eil: 40, ail: 80 },
    { lowerBound: 60, upperBound: 70 }
  ) as ElasticityResult;

  it("not null", () => { expect(result !== null).toBe(true); });
  it("direction = toward_buyer", () => { expect(result.direction).toBe("toward_buyer"); });
  it("suggestedScore = 62", () => { expect(result.suggestedScore).toBe(62); });
  it("buyerFlex = 10", () => { expect(result.buyerFlex).toBe(10); });
  it("sellerFlex = 40", () => { expect(result.sellerFlex).toBe(40); });
  it("suggestedScore ≥ lowerBound", () => { expect(result.suggestedScore >= 60).toBe(true); });
  it("suggestedScore ≤ upperBound", () => { expect(result.suggestedScore <= 70).toBe(true); });
});

describe("4 · Equal flexibility → balanced midpoint", () => {
  // buyerFlex  = 90 − 60 = 30
  // sellerFlex = 80 − 50 = 30
  // neither threshold met → direction: balanced
  //
  // lowerBound = max(50, 60) = 60
  // upperBound = min(90, 80) = 80
  //
  // sellerWeight = buyerWeight = 1/30
  // raw = (1/30*80 + 1/30*60) / (2/30) = (80 + 60) / 2 = 70  (exact midpoint)
  // suggestedScore = 70
  const result = computeElasticity(
    { ej: 90, aj: 60 },
    { eil: 50, ail: 80 },
    { lowerBound: 60, upperBound: 80 }
  ) as ElasticityResult;

  it("not null", () => { expect(result !== null).toBe(true); });
  it("direction = balanced", () => { expect(result.direction).toBe("balanced"); });
  it("suggestedScore = 70 (midpoint)", () => { expect(result.suggestedScore).toBe(70); });
  it("suggestedScore ≥ lowerBound", () => { expect(result.suggestedScore >= 60).toBe(true); });
  it("suggestedScore ≤ upperBound", () => { expect(result.suggestedScore <= 80).toBe(true); });
});

describe("5 · Single-point overlap → returns that exact point", () => {
  // lowerBound = upperBound = 75
  const result = computeElasticity(
    { ej: 100, aj: 50 },
    { eil: 75, ail: 75 },
    { lowerBound: 75, upperBound: 75 }
  ) as ElasticityResult;

  it("not null", () => { expect(result !== null).toBe(true); });
  it("suggestedScore = 75", () => { expect(result.suggestedScore).toBe(75); });
  it("direction = balanced", () => { expect(result.direction).toBe("balanced"); });
});

describe("6 · Suggested score always stays within feasible overlap", () => {
  // Stress test: extreme imbalance — seller range is 1, buyer range is 80
  // sellerWeight = 1/1 = 1, buyerWeight = 1/80 ≈ 0.0125
  // raw heavily weighted toward upperBound — should still be clamped within bounds
  const result = computeElasticity(
    { ej: 100, aj: 20 },
    { eil: 60, ail: 61 },           // sellerFlex = 1
    { lowerBound: 60, upperBound: 61 }
  ) as ElasticityResult;

  it("not null", () => { expect(result !== null).toBe(true); });
  it("suggestedScore ≥ lowerBound (60)", () => { expect(result.suggestedScore >= 60).toBe(true); });
  it("suggestedScore ≤ upperBound (61)", () => { expect(result.suggestedScore <= 61).toBe(true); });
  it("direction = toward_seller", () => { expect(result.direction).toBe("toward_seller"); });
});

describe("7 · Label content matches direction", () => {
  const towardSeller = computeElasticity(
    { ej: 90, aj: 50 },
    { eil: 60, ail: 70 },
    { lowerBound: 60, upperBound: 70 }
  ) as ElasticityResult;

  const towardBuyer = computeElasticity(
    { ej: 70, aj: 60 },
    { eil: 40, ail: 80 },
    { lowerBound: 60, upperBound: 70 }
  ) as ElasticityResult;

  const balanced = computeElasticity(
    { ej: 90, aj: 60 },
    { eil: 50, ail: 80 },
    { lowerBound: 60, upperBound: 80 }
  ) as ElasticityResult;

  it("toward_seller label mentions seller target", () => { expect(towardSeller.label.includes("seller")).toBe(true); });
  it("toward_buyer label mentions your range",     () => { expect(towardBuyer.label.includes("your range")).toBe(true); });
  it("balanced label mentions balanced",           () => { expect(balanced.label.toLowerCase().includes("balanced")).toBe(true); });
});
