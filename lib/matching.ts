/**
 * Zij Matching Engine
 *
 * Implements the optimization function from the patent spec (Figures 1–4):
 *   max Zij = (pfij - eil) - (ēj - pfij)
 *           = 2·pfij - eil - ēj
 *
 * Variables:
 *   pfij  — proposed fair/final price (the matched score we solve for)
 *   eil   — seller's minimum listing score (lower bound for seller)
 *   ail   — seller's acceptance/asking score (upper bound for seller's range)
 *   ēj    — buyer's expected score (upper bound for buyer)
 *   āj    — buyer's minimum acceptance score (lower bound for buyer's range)
 *
 * Feasibility constraints:
 *   1. ēj  ≥ pfij ≥ eil   (price must be between seller minimum and buyer maximum)
 *   2. āj  ≤ pfij ≤ ail   (price must be within both acceptance ranges)
 *
 * Since Zij is linear in pfij and increasing, the optimal pfij is the *largest*
 * value satisfying all constraints:
 *   pfij* = min(ēj, ail)
 *
 * The match is valid only when a feasible pfij exists, i.e.:
 *   max(eil, āj) ≤ min(ēj, ail)
 */

export interface BuyerProfile {
  /** ēj — buyer's expected / target score */
  expectedScore: number;
  /** āj — buyer's minimum acceptable score */
  minAcceptanceScore: number;
}

export interface AomCandidate {
  id: string;
  title: string;
  /** eil — seller's minimum listing score */
  eil: number;
  /** ail — seller's acceptance / asking score */
  ail: number;
  [key: string]: unknown;
}

export interface MatchOutcome {
  aomId: string;
  title: string;
  /** Optimal proposed fair/final price */
  pfij: number;
  /** Zij match quality score (higher is better) */
  zij: number;
  /** Whether the constraints are satisfied (feasible match) */
  valid: boolean;
  /** Lower bound of the feasible pfij range */
  lowerBound: number;
  /** Upper bound of the feasible pfij range */
  upperBound: number;
}

/**
 * Compute the Zij score for a single (buyer, AOM) pair.
 *
 * Returns the outcome including whether the match is feasible, the optimal
 * pfij, and the resulting Zij.  Infeasible matches have `valid: false` and
 * a Zij of -Infinity so they sort to the bottom of any ranking.
 */
export function computeZij(
  buyer: BuyerProfile,
  aom: AomCandidate
): MatchOutcome {
  const { expectedScore: ej, minAcceptanceScore: aj } = buyer;
  const { eil, ail } = aom;

  // Feasibility bounds
  const lowerBound = Math.max(eil, aj);
  const upperBound = Math.min(ej, ail);

  if (lowerBound > upperBound) {
    // No pfij satisfies all constraints — infeasible
    return {
      aomId: aom.id,
      title: aom.title,
      pfij: NaN,
      zij: -Infinity,
      valid: false,
      lowerBound,
      upperBound,
    };
  }

  // Optimal pfij: maximise 2·pfij - eil - ēj  →  take the largest feasible value
  const pfij = upperBound;
  const zij = 2 * pfij - eil - ej;

  return {
    aomId: aom.id,
    title: aom.title,
    pfij,
    zij,
    valid: true,
    lowerBound,
    upperBound,
  };
}

/**
 * Match a buyer profile against a list of AOM candidates.
 * Returns results sorted by Zij descending (best match first).
 * Invalid (infeasible) matches are included at the bottom.
 */
export function matchBuyerToAoms(
  buyer: BuyerProfile,
  candidates: AomCandidate[]
): MatchOutcome[] {
  return candidates
    .map((aom) => computeZij(buyer, aom))
    .sort((a, b) => {
      // Both invalid — preserve order
      if (!a.valid && !b.valid) return 0;
      // Push invalid to the bottom
      if (!a.valid) return 1;
      if (!b.valid) return -1;
      // Sort by Zij descending
      return b.zij - a.zij;
    });
}
