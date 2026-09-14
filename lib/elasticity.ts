/**
 * Elasticity Engine — MVP dynamic pricing suggestion
 *
 * Given the variables already computed by the Zij matching engine, suggests an
 * optimal negotiation price point within the feasible overlap range.  Rather
 * than splitting the difference, the suggestion is weighted toward the *less*
 * flexible party's preferred end: the party with less room to move should have
 * their preference weighted more heavily.
 *
 * Formula
 * ───────
 *   buyerFlex  = ēj  − āj          (width of buyer's acceptable range)
 *   sellerFlex = ail − eil         (width of seller's acceptable range)
 *
 *   sellerWeight = 1 / max(sellerFlex, 1)   ← less flexible → higher weight
 *   buyerWeight  = 1 / max(buyerFlex,  1)
 *
 *   Within the feasible overlap [lowerBound, upperBound]:
 *     - Seller's preferred end = upperBound  (higher score is better for seller)
 *     - Buyer's preferred end  = lowerBound  (lower commitment is better for buyer)
 *
 *   suggestedRaw = (sellerWeight × upperBound + buyerWeight × lowerBound)
 *                  ─────────────────────────────────────────────────────
 *                               sellerWeight + buyerWeight
 *
 *   suggestedScore = clamp(round(suggestedRaw), lowerBound, upperBound)
 *
 * Returns null for infeasible matches (lowerBound > upperBound).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ElasticityResult {
  /** Suggested negotiation score (0–100, same scale as all Zij scores) */
  suggestedScore: number;
  /** Buyer's range width: ēj − āj */
  buyerFlex: number;
  /** Seller's range width: ail − eil */
  sellerFlex: number;
  /** Which direction the suggestion leans relative to the midpoint */
  direction: "toward_buyer" | "toward_seller" | "balanced";
  /** Human-readable one-liner for display next to the marker */
  label: string;
}

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * Compute the elasticity-weighted suggested price point for a feasible match.
 *
 * @param buyer   - { ej: buyer's expected score, aj: buyer's min acceptance }
 * @param seller  - { eil: seller's min listing score, ail: seller's target }
 * @param overlap - { lowerBound, upperBound } as returned by computeZij
 * @returns ElasticityResult, or null if the match is infeasible
 */
export function computeElasticity(
  buyer: { ej: number; aj: number },
  seller: { eil: number; ail: number },
  overlap: { lowerBound: number; upperBound: number }
): ElasticityResult | null {
  const { lowerBound, upperBound } = overlap;

  // Only meaningful for feasible matches
  if (lowerBound > upperBound) return null;

  const { ej, aj } = buyer;
  const { eil, ail } = seller;

  const buyerFlex  = ej  - aj;   // ēj − āj
  const sellerFlex = ail - eil;  // ail − eil

  // Edge case: single-point overlap — only one possible value
  if (lowerBound === upperBound) {
    return {
      suggestedScore: lowerBound,
      buyerFlex,
      sellerFlex,
      direction: "balanced",
      label: "Only one feasible score — no flexibility to weight",
    };
  }

  // Inverse-flexibility weights: smaller range → higher weight on own preferred end
  //   MIN_FLEX = 1 avoids division by zero (a range of zero is treated as width 1)
  const MIN_FLEX = 1;
  const sellerWeight = 1 / Math.max(sellerFlex, MIN_FLEX);
  const buyerWeight  = 1 / Math.max(buyerFlex,  MIN_FLEX);
  const totalWeight  = sellerWeight + buyerWeight;

  const raw = (sellerWeight * upperBound + buyerWeight * lowerBound) / totalWeight;
  const suggestedScore = Math.round(
    Math.max(lowerBound, Math.min(upperBound, raw))
  );

  // Classify direction: "directional" when one side is <75% as flexible as the other
  const THRESHOLD = 0.75;
  let direction: ElasticityResult["direction"];
  if (sellerFlex < buyerFlex * THRESHOLD) {
    direction = "toward_seller";
  } else if (buyerFlex < sellerFlex * THRESHOLD) {
    direction = "toward_buyer";
  } else {
    direction = "balanced";
  }

  const label =
    direction === "toward_seller"
      ? "Weighted toward the seller\u2019s target \u2014 your range is wider"
      : direction === "toward_buyer"
      ? "Weighted toward your range \u2014 the seller has more room to move"
      : "Balanced \u2014 both sides have similar flexibility";

  return { suggestedScore, buyerFlex, sellerFlex, direction, label };
}
