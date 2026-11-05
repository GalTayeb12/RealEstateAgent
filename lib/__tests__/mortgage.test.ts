import { describe, it, expect } from "vitest";
import { computeSpitzer, checkLtv, evaluateDti, computeReverse } from "../mortgage/calculator";

// ── Spitzer ───────────────────────────────────────────────────────────────────

describe("computeSpitzer", () => {
  it("computes a standard mortgage correctly", () => {
    // 2,000,000 price, 500,000 equity → 1,500,000 loan, 4% annual, 25y
    const result = computeSpitzer({ price: 2_000_000, equity: 500_000, annualRatePercent: 4, termYears: 25 });
    expect(result.loanAmount).toBe(1_500_000);
    // Known Spitzer result: ~7,900 ₪/month (approximate)
    expect(result.monthlyPayment).toBeGreaterThan(7_000);
    expect(result.monthlyPayment).toBeLessThan(9_000);
    expect(result.totalPayments).toBeCloseTo(result.monthlyPayment * 300, 0);
    expect(result.totalInterest).toBeCloseTo(result.totalPayments - 1_500_000, 0);
    expect(result.ltv).toBeCloseTo(0.75, 4);
  });

  it("handles zero interest rate", () => {
    const result = computeSpitzer({ price: 1_200_000, equity: 200_000, annualRatePercent: 0, termYears: 20 });
    expect(result.loanAmount).toBe(1_000_000);
    expect(result.monthlyPayment).toBeCloseTo(1_000_000 / 240, 2);
    expect(result.totalInterest).toBeCloseTo(0, 1);
  });

  it("equity >= price gives zero loan and zero payment", () => {
    const result = computeSpitzer({ price: 1_000_000, equity: 1_500_000, annualRatePercent: 5, termYears: 20 });
    expect(result.loanAmount).toBe(0);
    expect(result.monthlyPayment).toBe(0);
  });

  it("computes LTV correctly", () => {
    const result = computeSpitzer({ price: 1_000_000, equity: 250_000, annualRatePercent: 3.5, termYears: 20 });
    expect(result.ltv).toBeCloseTo(0.75, 4);
  });

  it("total interest is non-negative for positive rate", () => {
    const result = computeSpitzer({ price: 2_500_000, equity: 625_000, annualRatePercent: 5.5, termYears: 30 });
    expect(result.totalInterest).toBeGreaterThan(0);
  });
});

// ── LTV check ─────────────────────────────────────────────────────────────────

describe("checkLtv", () => {
  it("first home buyer: 75% LTV allowed — passes with exactly 25% equity", () => {
    const result = checkLtv(2_000_000, 500_000, "first");
    expect(result.status).toBe("ok");
    expect(result.shortfall).toBe(0);
    expect(result.maxLtv).toBe(0.75);
  });

  it("first home buyer: 74% equity (less than 25%) → shortfall", () => {
    // Need 500k equity for 2M price at 75%, provide 480k → 20k shortfall
    const result = checkLtv(2_000_000, 480_000, "first");
    expect(result.status).toBe("insufficient_equity");
    expect(result.shortfall).toBeGreaterThan(0);
  });

  it("investor: 50% LTV — requires 50% equity", () => {
    const result = checkLtv(1_000_000, 500_000, "investor");
    expect(result.status).toBe("ok");
    expect(result.requiredEquity).toBe(500_000);
  });

  it("investor: insufficient equity", () => {
    const result = checkLtv(1_000_000, 400_000, "investor");
    expect(result.status).toBe("insufficient_equity");
    expect(result.shortfall).toBe(100_000);
  });

  it("move-up buyer: 70% LTV limit", () => {
    // 320k equity on 1M price → LTV = 68% < 70% limit → ok
    const result = checkLtv(1_000_000, 320_000, "moveUp");
    expect(result.status).toBe("ok");
    expect(result.maxLtv).toBe(0.70);
  });

  it("returns actual LTV correctly", () => {
    const result = checkLtv(2_000_000, 600_000, "first");
    expect(result.actualLtv).toBeCloseTo(0.70, 4);
  });
});

// ── DTI evaluation ────────────────────────────────────────────────────────────

describe("evaluateDti", () => {
  it("returns null for missing income", () => {
    expect(evaluateDti(5000, null)).toBeNull();
    expect(evaluateDti(5000, 0)).toBeNull();
    expect(evaluateDti(5000, undefined)).toBeNull();
  });

  it("green: payment ≤ 33% of income", () => {
    // 5000 / 20000 = 25% → green
    const result = evaluateDti(5000, 20_000);
    expect(result?.color).toBe("green");
    expect(result?.ratio).toBeCloseTo(0.25, 4);
  });

  it("yellow: 33% < payment ≤ 40% of income", () => {
    // 7000 / 20000 = 35% → yellow
    const result = evaluateDti(7000, 20_000);
    expect(result?.color).toBe("yellow");
  });

  it("red: payment > 40% of income", () => {
    // 9000 / 20000 = 45% → red
    const result = evaluateDti(9000, 20_000);
    expect(result?.color).toBe("red");
  });

  it("exactly at green threshold (33%) → green", () => {
    const result = evaluateDti(6600, 20_000); // 33%
    expect(result?.color).toBe("green");
  });
});

// ── Reverse mode ──────────────────────────────────────────────────────────────

describe("computeReverse", () => {
  it("returns max price from payment when LTV not binding", () => {
    // High equity means LTV cap is not the constraint
    const result = computeReverse({
      equity: 1_000_000,
      desiredMonthlyPayment: 8_000,
      annualRatePercent: 4,
      termYears: 25,
      buyerType: "first",
    });
    expect(result.maxPrice).toBeGreaterThan(0);
    expect(result.ltvConstrained).toBe(false);
  });

  it("LTV cap is binding when equity is small relative to desired payment capacity", () => {
    // 50k equity, investor (50% LTV) → max price capped at 100k by LTV
    // Meanwhile a 5000/month payment at 4%/25y can service much more
    const result = computeReverse({
      equity: 50_000,
      desiredMonthlyPayment: 10_000,
      annualRatePercent: 4,
      termYears: 25,
      buyerType: "investor",
    });
    expect(result.ltvConstrained).toBe(true);
    expect(result.maxPrice).toBeCloseTo(100_000, -3); // ≈ equity / (1-0.5)
  });

  it("zero interest reverse gives expected result", () => {
    // 240 payments of 5000 = 1,200,000 max loan; + 300,000 equity = 1,500,000
    // LTV: first buyer 75% → max price by LTV = 300k / 0.25 = 1,200,000
    // So LTV is binding here: 1,200,000 < 1,500,000
    const result = computeReverse({
      equity: 300_000,
      desiredMonthlyPayment: 5_000,
      annualRatePercent: 0,
      termYears: 20,
      buyerType: "first",
    });
    expect(result.maxPrice).toBeCloseTo(1_200_000, -3);
    expect(result.ltvConstrained).toBe(true);
  });

  it("maxLoan = maxPrice - equity", () => {
    const result = computeReverse({
      equity: 500_000,
      desiredMonthlyPayment: 7_000,
      annualRatePercent: 3.5,
      termYears: 20,
      buyerType: "first",
    });
    expect(result.maxLoan).toBeCloseTo(result.maxPrice - 500_000, 0);
  });
});
