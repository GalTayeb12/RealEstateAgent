/**
 * Shared characterization logic used by both:
 *   app/api/characterize/route.ts  (live avatar interview path)
 *   app/api/demo/parse-pdf/route.ts (PDF upload demo path)
 *
 * Keeping the prompt, types, and validator here means a single edit
 * propagates to both routes — the gap that caused psychometric scores
 * to be missing from the PDF path won't recur.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BuyerPreferences {
  property_type: string;
  location: string;
  bedrooms: number | null;
  bathrooms: number | null;
  must_haves: string[];
  dealbreakers: string[];
  timeline: string;
  additional_notes: string;
}

export interface PsychometricScores {
  /** Clarity and precision when expressing requirements (0–100) */
  verbal_reasoning: number;
  /** Comfort discussing prices, areas, and numeric comparisons (0–100) */
  numerical_reasoning: number;
  /** Ability to conceptualise floor plans, orientations, and spatial trade-offs (0–100) */
  spatial_reasoning: number;
  /** Pattern recognition in priorities and trade-offs across the conversation (0–100) */
  abstract_reasoning: number;
  /** Spontaneous recall of prior viewings or requirements stated earlier (0–100) */
  memory: number;
  /** Focus and depth when describing must-haves; low distraction (0–100) */
  attention: number;
  /** Decisiveness in answering with minimal hedging or topic drift (0–100) */
  processing_speed: number;
  /** Goal-setting, planning, and decision-sequencing signals (0–100) */
  executive_function: number;
}

export interface CharacterizationResult {
  buyer_preferences: BuyerPreferences;
  /** ēj — buyer's ideal/aspirational match score (0–100) */
  expected_score_ej: number;
  /** āj — buyer's walk-away minimum (0–100) */
  min_acceptance_score_aj: number;
  behavioral_insights: string;
  intent_signals: string;
  psychometric_scores: PsychometricScores;
}

// ── Shared system prompt ──────────────────────────────────────────────────────

export const CHARACTERIZATION_SYSTEM_PROMPT = `You are an expert real-estate analyst. Your job is to read a buyer's input (interview transcript or written requirements document) and extract a precise, structured buyer profile.

SCORING RUBRIC (0–100 scale — represents how well a property satisfies this buyer's requirements):
  90–100  Perfect match: exceeds all requirements, aspirational property
  75–89   Strong match: meets all core requirements plus meaningful extras
  65–74   Good match: meets all must-haves, modest extras, acceptable value
  55–64   Adequate: meets minimum requirements, limited extras, buyer would consider
  40–54   Weak: missing desirables, buyer would likely pass
  0–39    Poor: missing must-haves or dealbreakers present

SCORE DEFINITIONS:
  expected_score_ej   — The score a property must reach for the buyer to feel genuinely satisfied. This is their aspirational but realistic target. Do NOT inflate this; a practical family buyer who wants value over luxury should score 65–78, not 90.
  min_acceptance_score_aj — The absolute floor. Below this the buyer walks away regardless. Should be 10–20 points below ej.

INFERENCE RULES:
  - "Not looking for luxury / value matters": ej in the 65–75 range
  - "Specific must-haves that are non-negotiable": raises aj
  - "Dealbreakers stated explicitly": keeps aj high, narrows feasible range
  - "Flexible on some things": lowers aj slightly
  - "Timeline urgency": note in intent_signals but does not affect scores
  - If the buyer is vague, default to ej=85, aj=55 but note confidence is low

PSYCHOMETRIC SCORING RUBRIC (0–100 per dimension, based strictly on observable signals in the input):
  verbal_reasoning     — How clearly and precisely the buyer expressed requirements. High: specific, unambiguous language. Low: vague, contradictory, or repetitive.
  numerical_reasoning  — Comfort with numbers: prices, square footage, ratios, percentages. High: cites exact figures, compares values. Low: avoids numbers or seems uncertain.
  spatial_reasoning    — Ability to conceptualise layouts and orientations. High: references floor plans, sun direction, room adjacency. Low: only mentions rooms by name without spatial context.
  abstract_reasoning   — Identifies non-obvious trade-offs or patterns in their own priorities. High: "I'd sacrifice X if it means Y." Low: lists requirements without connecting them.
  memory               — Spontaneous recall of earlier conversation or prior experience. High: references what they said earlier or mentions a specific past viewing. Low: repetitive or contradictory.
  attention            — Depth and focus on each topic before moving on. High: answers completely, follows up. Low: skips questions or gives one-word answers.
  processing_speed     — Decisiveness in responding; low hedging or excessive qualification. High: answers promptly and commits. Low: excessive "maybe", "I'm not sure", "it depends".
  executive_function   — Evidence of planning, goal-setting, and sequencing. High: mentions timelines, steps they've already taken, or contingency plans. Low: no planning signals.

  Calibration: 50 is average for a typical property buyer. Scores above 75 require clear evidence. Below 30 only if the buyer explicitly struggles on that dimension.

Return ONLY valid JSON — no markdown, no explanation, no code fences — matching this exact structure:
{
  "buyer_preferences": {
    "property_type": "string",
    "location": "string",
    "bedrooms": number_or_null,
    "bathrooms": number_or_null,
    "must_haves": ["string"],
    "dealbreakers": ["string"],
    "timeline": "string",
    "additional_notes": "string"
  },
  "expected_score_ej": number,
  "min_acceptance_score_aj": number,
  "behavioral_insights": "string",
  "intent_signals": "string",
  "psychometric_scores": {
    "verbal_reasoning": number,
    "numerical_reasoning": number,
    "spatial_reasoning": number,
    "abstract_reasoning": number,
    "memory": number,
    "attention": number,
    "processing_speed": number,
    "executive_function": number
  }
}`;

// ── JSON extraction ───────────────────────────────────────────────────────────

/**
 * Robustly extract JSON from a Claude response that may contain preamble text,
 * postamble text, or markdown code fences around the object.
 *
 * Strategy:
 *   1. Strip leading/trailing ``` fences (```json or plain ```)
 *   2. Find the first `{` and last `}` — slices out any preamble/postamble
 *
 * Throws if no JSON object boundary is found so the caller can treat it as a
 * parse failure and retry.
 */
export function extractJSON(raw: string): string {
  // Strip markdown code fences (handles ```json\n...\n``` and ```\n...\n```)
  let s = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  // Extract the outermost JSON object even if Claude prefixed it with text
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return s.slice(start, end + 1);
  }

  // Return as-is and let JSON.parse throw a meaningful error
  return s;
}

// ── Validator ─────────────────────────────────────────────────────────────────

export const PSYCHOMETRIC_KEYS = [
  "verbal_reasoning",
  "numerical_reasoning",
  "spatial_reasoning",
  "abstract_reasoning",
  "memory",
  "attention",
  "processing_speed",
  "executive_function",
] as const;

export function validateCharacterizationResult(obj: unknown): obj is CharacterizationResult {
  if (!obj || typeof obj !== "object") return false;
  const r = obj as Record<string, unknown>;
  if (typeof r.expected_score_ej !== "number") return false;
  if (typeof r.min_acceptance_score_aj !== "number") return false;
  if (typeof r.behavioral_insights !== "string") return false;
  if (typeof r.intent_signals !== "string") return false;
  if (!r.buyer_preferences || typeof r.buyer_preferences !== "object") return false;
  const ej = r.expected_score_ej as number;
  const aj = r.min_acceptance_score_aj as number;
  if (ej < 0 || ej > 100 || aj < 0 || aj > 100) return false;
  if (aj >= ej) return false;
  if (!r.psychometric_scores || typeof r.psychometric_scores !== "object") return false;
  const ps = r.psychometric_scores as Record<string, unknown>;
  for (const key of PSYCHOMETRIC_KEYS) {
    if (typeof ps[key] !== "number" || (ps[key] as number) < 0 || (ps[key] as number) > 100) return false;
  }
  return true;
}

// ── Upsert helper ─────────────────────────────────────────────────────────────

/** Maps a CharacterizationResult's psychometric_scores to BuyerProfile column names. */
export function psychometricUpsertData(ps: PsychometricScores) {
  return {
    verbalReasoning:    ps.verbal_reasoning,
    numericalReasoning: ps.numerical_reasoning,
    spatialReasoning:   ps.spatial_reasoning,
    abstractReasoning:  ps.abstract_reasoning,
    memory:             ps.memory,
    attention:          ps.attention,
    processingSpeed:    ps.processing_speed,
    executiveFunction:  ps.executive_function,
  };
}
