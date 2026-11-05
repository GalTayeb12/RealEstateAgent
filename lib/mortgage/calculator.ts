/**
 * Mortgage calculation functions.
 *
 * Implements:
 *   - Spitzer (French amortization) monthly payment
 *   - LTV check with Bank of Israel limits
 *   - Income ratio (DTI) evaluation
 *   - Reverse mode: equity + desired monthly payment → max affordable price
 */

import type { BuyerType } from "./config";
import { MAX_LTV, DTI_THRESHOLDS } from "./config";

// ── Spitzer (French amortization) ────────────────────────────────────────────

export interface SpitzerInput {
  /** Property price in ILS */
  price: number;
  /** Buyer's equity (down-payment) in ILS */
  equity: number;
  /** Annual interest rate as a percentage, e.g. 4.5 for 4.5% */
  annualRatePercent: number;
  /** Mortgage term in years */
  termYears: number;
}

export interface SpitzerResult {
  /** Net loan amount = price − equity (ILS) */
  loanAmount: number;
  /** Monthly payment (ILS) */
  monthlyPayment: number;
  /** Total amount paid over the full term (ILS) */
  totalPayments: number;
  /** Total interest paid (ILS) */
  totalInterest: number;
  /** LTV ratio (0–1), e.g. 0.72 */
  ltv: number;
}

/**
 * Compute Spitzer (French amortization) monthly payment and summary.
 * Formula: P = L · r(1+r)^n / ((1+r)^n − 1)
 *   where r = annualRatePercent/100/12  and  n = termYears × 12
 */
export function computeSpitzer(input: SpitzerInput): SpitzerResult {
  const { price, equity, annualRatePercent, termYears } = input;
  const loanAmount = Math.max(0, price - equity);
  const r = annualRatePercent / 100 / 12;
  const n = termYears * 12;

  let monthlyPayment: number;
  if (r === 0) {
    // Interest-free edge case
    monthlyPayment = n > 0 ? loanAmount / n : 0;
  } else {
    const factor = Math.pow(1 + r, n);
    monthlyPayment = loanAmount * (r * factor) / (factor - 1);
  }

  const totalPayments = monthlyPayment * n;
  const totalInterest = totalPayments - loanAmount;
  const ltv = price > 0 ? loanAmount / price : 0;

  return {
    loanAmount,
    monthlyPayment,
    totalPayments,
    totalInterest,
    ltv,
  };
}

// ── LTV check ─────────────────────────────────────────────────────────────────

export type LtvStatus = "ok" | "insufficient_equity";

export interface LtvCheckResult {
  status: LtvStatus;
  /** Maximum allowed LTV for this buyer type (0–1) */
  maxLtv: number;
  /** Actual LTV (0–1) */
  actualLtv: number;
  /** Shortfall in ILS (0 if no shortfall) */
  shortfall: number;
  /** Minimum equity required (ILS) */
  requiredEquity: number;
}

/**
 * Check whether the buyer's equity satisfies Bank of Israel LTV limits.
 */
export function checkLtv(price: number, equity: number, buyerType: BuyerType): LtvCheckResult {
  const maxLtv = MAX_LTV[buyerType];
  const requiredEquity = Math.ceil(price * (1 - maxLtv));
  const actualLtv = price > 0 ? (price - equity) / price : 0;
  const shortfall = Math.max(0, requiredEquity - equity);

  return {
    status: shortfall > 0 ? "insufficient_equity" : "ok",
    maxLtv,
    actualLtv,
    shortfall,
    requiredEquity,
  };
}

// ── Income ratio (DTI) ───────────────────────────────────────────────────────

export type DtiColor = "green" | "yellow" | "red";

export interface DtiResult {
  /** Monthly payment / monthly income (0–1) */
  ratio: number;
  /** Traffic-light colour */
  color: DtiColor;
}

/**
 * Evaluate debt-to-income ratio for the computed monthly payment.
 * Returns null if monthlyIncome is not provided or is zero.
 */
export function evaluateDti(monthlyPayment: number, monthlyIncome: number | null | undefined): DtiResult | null {
  if (!monthlyIncome || monthlyIncome <= 0) return null;
  const ratio = monthlyPayment / monthlyIncome;
  let color: DtiColor;
  if (ratio <= DTI_THRESHOLDS.green) {
    color = "green";
  } else if (ratio <= DTI_THRESHOLDS.yellow) {
    color = "yellow";
  } else {
    color = "red";
  }
  return { ratio, color };
}

// ── Reverse mode ──────────────────────────────────────────────────────────────

export interface ReverseInput {
  /** Buyer's available equity in ILS */
  equity: number;
  /** Desired maximum monthly payment in ILS */
  desiredMonthlyPayment: number;
  /** Annual interest rate as a percentage */
  annualRatePercent: number;
  /** Mortgage term in years */
  termYears: number;
  /** Buyer type — used to cap price by LTV */
  buyerType: BuyerType;
}

export interface ReverseResult {
  /** Maximum loan the buyer can service given the desired payment */
  maxLoan: number;
  /** Maximum property price = maxLoan + equity, optionally capped by LTV */
  maxPrice: number;
  /** True if the LTV cap was binding (i.e. equity was the constraint, not payment) */
  ltvConstrained: boolean;
}

/**
 * Reverse mortgage: given equity and desired monthly payment, compute the
 * maximum affordable property price.
 *
 * Formula (inverse Spitzer): L = PMT · ((1+r)^n − 1) / (r · (1+r)^n)
 */
export function computeReverse(input: ReverseInput): ReverseResult {
  const { equity, desiredMonthlyPayment, annualRatePercent, termYears, buyerType } = input;
  const r = annualRatePercent / 100 / 12;
  const n = termYears * 12;

  let maxLoan: number;
  if (r === 0) {
    maxLoan = desiredMonthlyPayment * n;
  } else {
    const factor = Math.pow(1 + r, n);
    maxLoan = desiredMonthlyPayment * (factor - 1) / (r * factor);
  }

  const maxPriceFromPayment = maxLoan + equity;

  // LTV cap: price × (1 − maxLTV) ≤ equity  →  price ≤ equity / (1 − maxLTV)
  const maxLtv = MAX_LTV[buyerType];
  const maxPriceFromLtv = equity / (1 - maxLtv);

  const maxPrice = Math.min(maxPriceFromPayment, maxPriceFromLtv);
  const ltvConstrained = maxPriceFromLtv < maxPriceFromPayment;

  return {
    maxLoan: Math.max(0, maxPrice - equity),
    maxPrice: Math.max(0, maxPrice),
    ltvConstrained,
  };
}
