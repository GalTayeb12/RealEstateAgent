/**
 * Fit score: how well a listing fits what the buyer asked for, on a 0-100 scale buyers can read.
 *
 * This is a DISPLAY/RANKING layer on top of the Zij matching engine; it does not change Zij.
 * Zij measures the negotiation surplus (and is capped by the buyer's own expected score), so on its own
 * it reads as "12/100" even for a listing that meets every requirement. The fit score combines what the
 * buyer actually stated with the data the listing actually has:
 *
 *   location 25 · budget 25 · rooms 20 · must-haves 15 · room to agree 15
 *
 * A component with no usable data (buyer did not state it, or the listing does not list it) is left out
 * and the remaining weights are renormalised, so missing data never counts as a miss.
 */
import { roomsOf, buyerMinRooms } from "./attributes";
import type { HardFilterReason } from "./matching";

export type FitId = "location" | "budget" | "rooms" | "musts" | "agree";
export type FitNote = "ok" | "partial" | "miss";

export interface FitComponent {
  id: FitId;
  /** 0-100 */
  score: number;
  weight: number;
  note: FitNote;
  /** Must-haves only: which recognised must-haves were met / unmet / not listed by the seller */
  musts?: { met: string[]; unmet: string[]; unknown: string[] };
}

export interface FitResult {
  /** 0-100, rounded */
  score: number;
  components: FitComponent[];
}

export interface FitInput {
  prefs: {
    location?: string | null;
    bedrooms?: number | null;
    budget_max?: number | null;
    must_haves?: string[] | null;
    dealbreakers?: string[] | null;
  };
  /** Zij outcome fields */
  outcome: { valid: boolean; lowerBound: number; upperBound: number; hardFilterFailReasons?: HardFilterReason[] };
  /** The buyer's expected (ēj) and minimum (āj) scores */
  ej: number;
  aj: number;
  price?: number | null;
  attributes?: Record<string, unknown> | null;
  unitLabel?: string | null;
}

const WEIGHTS: Record<FitId, number> = { location: 25, budget: 25, rooms: 20, musts: 15, agree: 15 };
const clamp = (n: number) => Math.max(0, Math.min(100, n));
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Must-haves we can verify from structured listing attributes. Others (quiet, light...) are not scorable. */
const MUSTS: { match: RegExp; key: string; test: (a: Record<string, unknown>) => boolean | null }[] = [
  { match: /מרפסת|balcon/i, key: "balcony", test: (a) => { const v = num(a.balconySqm) ?? num(a.balcony); return v === null ? null : v > 0; } },
  { match: /חניה|חנייה|parking/i, key: "parking", test: (a) => { const v = num(a.parking); return v === null ? null : v > 0; } },
  { match: /קומה גבוהה|high floor/i, key: "highFloor", test: (a) => { const v = num(a.floor); return v === null ? null : v >= 5; } },
];

export function computeFit(input: FitInput): FitResult {
  const { prefs, outcome, ej, aj } = input;
  const attrs = input.attributes ?? {};
  const comps: FitComponent[] = [];
  const add = (id: FitId, score: number, note: FitNote, extra?: Partial<FitComponent>) =>
    comps.push({ id, score: Math.round(clamp(score)), weight: WEIGHTS[id], note, ...extra });

  // Location: pass/fail from the hard filter that already ran against the project's address.
  if (prefs.location && prefs.location.trim()) {
    const miss = (outcome.hardFilterFailReasons ?? []).some((r) => r.kind === "location");
    add("location", miss ? 0 : 100, miss ? "miss" : "ok");
  }

  // Budget: within budget is full marks; over budget decays and reaches 0 at +33%.
  const budget = num(prefs.budget_max), price = num(input.price);
  if (budget && budget > 0 && price && price > 0) {
    if (price <= budget) add("budget", 100, "ok");
    else { const s = 100 - (price / budget - 1) * 300; add("budget", s, s > 50 ? "partial" : "miss"); }
  }

  // Rooms: meets the buyer's minimum (Israeli room count) is full marks; each room short costs 40.
  const minRooms = buyerMinRooms(prefs as Record<string, unknown>);
  const rooms = roomsOf(attrs, input.unitLabel);
  if (minRooms && minRooms > 0 && rooms !== null) {
    if (rooms >= minRooms) add("rooms", 100, "ok");
    else { const s = 100 - (minRooms - rooms) * 40; add("rooms", s, s > 50 ? "partial" : "miss"); }
  }

  // Must-haves we can verify. Not listed by the seller counts half, a clear miss counts zero.
  const wanted = (prefs.must_haves ?? []).map((w) => MUSTS.find((m) => m.match.test(w))).filter((m): m is (typeof MUSTS)[number] => !!m);
  const uniq = Array.from(new Set(wanted));
  if (uniq.length > 0) {
    const met: string[] = [], unmet: string[] = [], unknown: string[] = [];
    for (const m of uniq) { const r = m.test(attrs); (r === true ? met : r === false ? unmet : unknown).push(m.key); }
    const s = ((met.length + unknown.length * 0.5) / uniq.length) * 100;
    add("musts", s, unmet.length === 0 ? (unknown.length === 0 ? "ok" : "partial") : met.length ? "partial" : "miss", { musts: { met, unmet, unknown } });
  }

  // Room to agree: how much of the buyer's own acceptance range overlaps the seller's (min 20 when feasible).
  const span = Math.max(1, ej - aj);
  add("agree", outcome.valid ? Math.max(20, ((outcome.upperBound - outcome.lowerBound) / span) * 100) : 0, outcome.valid ? "ok" : "miss");

  const totalW = comps.reduce((a, c) => a + c.weight, 0) || 1;
  let score = comps.reduce((a, c) => a + c.score * c.weight, 0) / totalW;

  // A stated dealbreaker the listing is known to violate halves the score.
  const ground = (prefs.dealbreakers ?? []).some((d) => /קומת קרקע|ground floor/i.test(d));
  const floor = num(attrs.floor);
  if (ground && floor !== null && floor <= 0) score *= 0.5;

  return { score: Math.round(clamp(score)), components: comps };
}
