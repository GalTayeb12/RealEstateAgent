/**
 * Unit tests for the Zij matching engine.
 *
 * Run with:  npx ts-node lib/__tests__/matching.test.ts
 *
 * Variables recap:
 *   eil  = seller's minimum listing score
 *   ail  = seller's acceptance/asking score
 *   ēj   = buyer's expected score  (expectedScore)
 *   āj   = buyer's minimum acceptance score  (minAcceptanceScore)
 *   pfij = optimal matched price = min(ēj, ail)   [when feasible]
 *   Zij  = 2·pfij - eil - ēj
 */

import { computeZij, matchBuyerToAoms, BuyerProfile, AomCandidate } from "../matching";

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

section("1 · Standard feasible match");
{
  // eil=60, ail=80, ēj=90, āj=50
  // lowerBound = max(60, 50) = 60
  // upperBound = min(90, 80) = 80
  // pfij* = 80
  // Zij   = 2*80 - 60 - 90 = 160 - 150 = 10
  const buyer: BuyerProfile = { expectedScore: 90, minAcceptanceScore: 50 };
  const aom: AomCandidate   = { id: "a1", title: "AOM-1", eil: 60, ail: 80 };
  const result = computeZij(buyer, aom);

  expect("valid", result.valid, true);
  expect("pfij = 80", result.pfij, 80);
  expect("zij = 10", result.zij, 10);
  expect("lowerBound = 60", result.lowerBound, 60);
  expect("upperBound = 80", result.upperBound, 80);
}

section("2 · Buyer expected score is binding (ēj < ail)");
{
  // eil=50, ail=95, ēj=70, āj=40
  // upperBound = min(70, 95) = 70  ← ēj is the tighter cap
  // pfij* = 70
  // Zij = 2*70 - 50 - 70 = 140 - 120 = 20
  const buyer: BuyerProfile = { expectedScore: 70, minAcceptanceScore: 40 };
  const aom: AomCandidate   = { id: "a2", title: "AOM-2", eil: 50, ail: 95 };
  const result = computeZij(buyer, aom);

  expect("valid", result.valid, true);
  expect("pfij = 70 (ēj caps it)", result.pfij, 70);
  expect("zij = 20", result.zij, 20);
}

section("3 · Infeasible — seller floor > buyer ceiling");
{
  // eil=100, ail=120, ēj=80, āj=50
  // lowerBound = max(100, 50) = 100
  // upperBound = min(80, 120) = 80
  // 100 > 80  →  no feasible pfij
  const buyer: BuyerProfile = { expectedScore: 80, minAcceptanceScore: 50 };
  const aom: AomCandidate   = { id: "a3", title: "AOM-3", eil: 100, ail: 120 };
  const result = computeZij(buyer, aom);

  expect("valid = false", result.valid, false);
  expect("zij = -Infinity", result.zij, -Infinity);
  expect("pfij is NaN", Number.isNaN(result.pfij), true);
}

section("4 · Infeasible — buyer minimum > seller asking (āj > ail)");
{
  // eil=40, ail=60, ēj=90, āj=70
  // lowerBound = max(40, 70) = 70
  // upperBound = min(90, 60) = 60
  // 70 > 60  →  infeasible
  const buyer: BuyerProfile = { expectedScore: 90, minAcceptanceScore: 70 };
  const aom: AomCandidate   = { id: "a4", title: "AOM-4", eil: 40, ail: 60 };
  const result = computeZij(buyer, aom);

  expect("valid = false (āj > ail)", result.valid, false);
}

section("5 · Exact-boundary match (pfij lands on lower bound)");
{
  // eil=75, ail=75, ēj=100, āj=50
  // upperBound = min(100, 75) = 75
  // lowerBound = max(75,  50) = 75
  // pfij* = 75
  // Zij = 2*75 - 75 - 100 = 150 - 175 = -25   (still valid, just low quality)
  const buyer: BuyerProfile = { expectedScore: 100, minAcceptanceScore: 50 };
  const aom: AomCandidate   = { id: "a5", title: "AOM-5", eil: 75, ail: 75 };
  const result = computeZij(buyer, aom);

  expect("valid (exact boundary)", result.valid, true);
  expect("pfij = 75", result.pfij, 75);
  expect("zij = -25", result.zij, -25);
}

section("6 · Ranking — three AOMs should sort by Zij desc");
{
  const buyer: BuyerProfile = { expectedScore: 100, minAcceptanceScore: 40 };
  const aoms: AomCandidate[] = [
    { id: "b1", title: "Low",    eil: 40, ail: 60  },  // pfij=60, zij=2*60-40-100=-20
    { id: "b2", title: "High",   eil: 50, ail: 90  },  // pfij=90, zij=2*90-50-100=30
    { id: "b3", title: "Medium", eil: 30, ail: 70  },  // pfij=70, zij=2*70-30-100=10
    { id: "b4", title: "Inval",  eil: 110, ail: 130 }, // infeasible
  ];

  const ranked = matchBuyerToAoms(buyer, aoms);

  expect("1st place = High (zij=30)",   ranked[0].aomId, "b2");
  expect("2nd place = Medium (zij=10)", ranked[1].aomId, "b3");
  expect("3rd place = Low (zij=-20)",   ranked[2].aomId, "b1");
  expect("4th place = Inval (invalid)", ranked[3].aomId, "b4");
  expect("Inval.valid = false", ranked[3].valid, false);
}

section("7 · Floating-point scores");
{
  // eil=0.5, ail=0.85, ēj=0.9, āj=0.3
  // pfij* = min(0.9, 0.85) = 0.85
  // Zij  = 2*0.85 - 0.5 - 0.9 = 1.7 - 1.4 = 0.3
  const buyer: BuyerProfile = { expectedScore: 0.9, minAcceptanceScore: 0.3 };
  const aom: AomCandidate   = { id: "c1", title: "Float-AOM", eil: 0.5, ail: 0.85 };
  const result = computeZij(buyer, aom);

  expect("valid", result.valid, true);
  expect("pfij ≈ 0.85", result.pfij, 0.85, 1e-10);
  expect("zij ≈ 0.30",  result.zij,  0.30, 1e-10);
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
