/**
 * Mortgage regulatory parameters — Bank of Israel rules.
 *
 * IMPORTANT: Validate these values against the Bank of Israel supervisor
 * directives before any production use. Last reviewed: 2026-11-05.
 *
 * All regulatory numbers must live here and ONLY here.
 * Never hardcode LTV limits, min-equity percentages, or stress-test rates
 * anywhere else in the codebase.
 */

export type BuyerType = "first" | "moveUp" | "investor";

/** Maximum LTV ratio by buyer type (Bank of Israel, Directive 329). */
export const MAX_LTV: Record<BuyerType, number> = {
  first:    0.75, // 75% — first home buyer
  moveUp:   0.70, // 70% — move-up buyer (selling existing home)
  investor: 0.50, // 50% — investor / second home
};

/**
 * Recommended debt-to-income (DTI) thresholds.
 * Monthly mortgage payment as a share of gross monthly household income.
 */
export const DTI_THRESHOLDS = {
  green:  0.33, // ≤33% — comfortable
  yellow: 0.40, // ≤40% — manageable but stretched
  // >40% → red
} as const;

/**
 * Maximum mortgage term allowed in years (Bank of Israel).
 * We enforce this in validation; show a warning if the user exceeds 25y.
 */
export const MAX_TERM_YEARS = 30;
export const WARN_TERM_YEARS = 25;

/**
 * Legal disclaimer — must appear on every mortgage calculator surface.
 * He: "החישוב להמחשה בלבד ואינו מהווה ייעוץ משכנתאות."
 * En: "This calculation is for illustrative purposes only and does not constitute mortgage advice."
 */
export const DISCLAIMER_HE = "החישוב להמחשה בלבד ואינו מהווה ייעוץ משכנתאות.";
export const DISCLAIMER_EN = "This calculation is for illustrative purposes only and does not constitute mortgage advice.";
