/**
 * Unit tests for the Elasticity Engine.
 *
 * Run with:  npx tsx lib/__tests__/elasticity.test.ts
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

import { computeElasticity, ElasticityResult } from "../elasticity";

// ─── tiny test harness ───────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function expect(label: string, actual: unknown, expected: unknown, tolerance = 0): void {
  const ok =
    typeof expected === "number" && tolerance > 0
      ? Math.abs((actual as number) - expected) <= tolerance
      : actual === expected;

  if (ok) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}`);
    console.error(`       expected: ${JSON.stringify(expected)}`);
    console.error(`       received: ${JSON.stringify(actual)}`);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n── ${title} ──`);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

section("1 · Infeasible match — returns null");
{
  // lowerBound > upperBound
  const result = computeElasticity(
    { ej: 70, aj: 50 },
    { eil: 80, ail: 100 },
    { lowerBound: 80, upperBound: 70 }   // infeasible
  );

  expect("returns null", result, null);
}

section("2 · Buyer more flexible than seller → weighted toward seller's target");
{
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

  expect("not null", result !== null, true);
  expect("direction = toward_seller", result.direction, "toward_seller");
  expect("suggestedScore = 68", result.suggestedScore, 68);
  expect("buyerFlex = 40", result.buyerFlex, 40);
  expect("sellerFlex = 10", result.sellerFlex, 10);
  expect("suggestedScore ≥ lowerBound", result.suggestedScore >= 60, true);
  expect("suggestedScore ≤ upperBound", result.suggestedScore <= 70, true);
}

section("3 · Seller more flexible than buyer → weighted toward buyer's range");
{
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

  expect("not null", result !== null, true);
  expect("direction = toward_buyer", result.direction, "toward_buyer");
  expect("suggestedScore = 62", result.suggestedScore, 62);
  expect("buyerFlex = 10", result.buyerFlex, 10);
  expect("sellerFlex = 40", result.sellerFlex, 40);
  expect("suggestedScore ≥ lowerBound", result.suggestedScore >= 60, true);
  expect("suggestedScore ≤ upperBound", result.suggestedScore <= 70, true);
}

section("4 · Equal flexibility → balanced midpoint");
{
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

  expect("not null", result !== null, true);
  expect("direction = balanced", result.direction, "balanced");
  expect("suggestedScore = 70 (midpoint)", result.suggestedScore, 70);
  expect("suggestedScore ≥ lowerBound", result.suggestedScore >= 60, true);
  expect("suggestedScore ≤ upperBound", result.suggestedScore <= 80, true);
}

section("5 · Single-point overlap → returns that exact point");
{
  // lowerBound = upperBound = 75
  const result = computeElasticity(
    { ej: 100, aj: 50 },
    { eil: 75, ail: 75 },
    { lowerBound: 75, upperBound: 75 }
  ) as ElasticityResult;

  expect("not null", result !== null, true);
  expect("suggestedScore = 75", result.suggestedScore, 75);
  expect("direction = balanced", result.direction, "balanced");
}

section("6 · Suggested score always stays within feasible overlap");
{
  // Stress test: extreme imbalance — seller range is 1, buyer range is 80
  // sellerWeight = 1/1 = 1, buyerWeight = 1/80 ≈ 0.0125
  // raw heavily weighted toward upperBound — should still be clamped within bounds
  const result = computeElasticity(
    { ej: 100, aj: 20 },
    { eil: 60, ail: 61 },           // sellerFlex = 1
    { lowerBound: 60, upperBound: 61 }
  ) as ElasticityResult;

  expect("not null", result !== null, true);
  expect("suggestedScore ≥ lowerBound (60)", result.suggestedScore >= 60, true);
  expect("suggestedScore ≤ upperBound (61)", result.suggestedScore <= 61, true);
  expect("direction = toward_seller", result.direction, "toward_seller");
}

section("7 · Label content matches direction");
{
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

  expect("toward_seller label mentions seller target", towardSeller.label.includes("seller"), true);
  expect("toward_buyer label mentions your range",     towardBuyer.label.includes("your range"), true);
  expect("balanced label mentions balanced",           balanced.label.toLowerCase().includes("balanced"), true);
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("SOME TESTS FAILED");
  process.exit(1);
} else {
  console.log("All tests passed ✓");
}
