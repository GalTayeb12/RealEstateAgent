import { roomsOf } from "./attributes";
import { locationMatches } from "./location";

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
  /** Listed price (ILS) — used for budget hard filter */
  price?: number;
  /** Project location string — used for area hard filter */
  location?: string;
  /** Parsed attributes JSON — used for rooms hard filter */
  attributes?: Record<string, unknown>;
  /** Unit label ("4 חדרים") — rooms fallback when attributes lack them */
  unitLabel?: string;
  [key: string]: unknown;
}

export interface MatchOutcome {
  aomId: string;
  title: string;
  /** Optimal proposed fair/final price */
  pfij: number;
  /** Zij match quality score (higher is better) */
  zij: number;
  /** Whether the Zij constraints are satisfied (feasible price range overlap) */
  valid: boolean;
  /** Lower bound of the feasible pfij range */
  lowerBound: number;
  /** Upper bound of the feasible pfij range */
  upperBound: number;
  /** Whether the property passes all hard requirement filters (rooms, budget, area) */
  passesHardFilters: boolean;
  /** Specific reasons a hard filter failed — empty when passesHardFilters is true */
  hardFilterFailReasons: HardFilterReason[];
}

// ── Hard filter types ──────────────────────────────────────────────────────────

export type HardFilterReason =
  /** actual null = the listing has no room count, so it cannot be shown as a match */
  | { kind: "rooms"; actual: number | null; required: number }
  | { kind: "budget"; actual: number; max: number }
  | { kind: "location"; actual: string; required: string };

export interface HardFilterCriteria {
  /** Minimum rooms (Israeli count) the buyer requires — see buyerMinRooms() */
  minRooms?: number | null;
  /** Maximum budget in ILS (from buyer_preferences.budget_max) */
  maxBudget?: number | null;
  /** Desired location/area (from buyer_preferences.location) */
  location?: string | null;
}

/**
 * Check whether an AOM candidate satisfies the buyer's hard requirement filters.
 * Returns `passes: true` only when all specified criteria are met.
 * Budget and location are lenient on missing data (skipped, not failed);
 * rooms are strict, since a listing with no room count cannot match a rooms requirement.
 */
export function checkHardFilters(
  candidate: AomCandidate,
  criteria: HardFilterCriteria
): { passes: boolean; reasons: HardFilterReason[] } {
  const reasons: HardFilterReason[] = [];
  const attrs = candidate.attributes ?? {};

  // ── Rooms check ──────────────────────────────────────────────────────────
  // Strict: a listing whose room count is unknown does not pass a rooms requirement.
  if (criteria.minRooms != null && criteria.minRooms > 0) {
    const rooms = roomsOf(attrs, candidate.unitLabel);
    if (rooms === null || rooms < criteria.minRooms) {
      reasons.push({ kind: "rooms", actual: rooms, required: criteria.minRooms });
    }
  }

  // ── Budget check ─────────────────────────────────────────────────────────
  if (
    criteria.maxBudget != null &&
    criteria.maxBudget > 0 &&
    candidate.price != null &&
    candidate.price > criteria.maxBudget
  ) {
    reasons.push({ kind: "budget", actual: candidate.price, max: criteria.maxBudget });
  }

  // ── Location check (city names in Hebrew or English, then word overlap) ──
  if (criteria.location && candidate.location) {
    if (!locationMatches(criteria.location, candidate.location)) {
      reasons.push({
        kind: "location",
        actual: candidate.location,
        required: criteria.location,
      });
    }
  }

  return { passes: reasons.length === 0, reasons };
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
      passesHardFilters: true,  // hard filters applied separately in route
      hardFilterFailReasons: [],
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
    passesHardFilters: true,  // hard filters applied separately in route
    hardFilterFailReasons: [],
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
