"use client";
/**
 * Match flow shared by /processing and /results.
 *
 * The server already stores everything a match needs (BuyerProfile: expected/min-acceptance scores and preferences),
 * so results are never lost with the browser: `loadMatchResults` returns the sessionStorage cache when present and
 * otherwise rebuilds the same payload from the saved profile (GET /api/buyer/profile → POST /api/match → GET /api/aom).
 */
import { parseAttributes } from "@/lib/attributes";
import { migrateLegacyToken } from "@/lib/clientSession";

export type AomDetail = {
  address?: string;
  title: string;
  description: string;
  eil: number;
  ail: number;
  price: number;
  priceFrom?: boolean;
  developerId: string;
  ownerType: string;
  attributes: Record<string, unknown>;
};

export type CharacterizationResult = {
  buyer_preferences: {
    property_type: string;
    location: string;
    bedrooms: number | null;
    bathrooms: number | null;
    must_haves: string[];
    dealbreakers: string[];
    timeline: string;
    additional_notes: string;
  };
  expected_score_ej: number;
  min_acceptance_score_aj: number;
  behavioral_insights: string;
  intent_signals: string;
  psychometric_scores?: Record<string, number>;
};

export type MatchPayload = {
  ranked: unknown[];
  characterization: CharacterizationResult;
  aomDetails: Record<string, AomDetail>;
};

const CACHE_KEY = "matchResults";

/** POST /api/match + GET /api/aom for a characterization, then cache the combined payload. */
export async function runMatch(characterization: CharacterizationResult): Promise<MatchPayload> {
  const [matchRes, aomRes] = await Promise.all([
    fetch("/api/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyerProfile: {
          expectedScore: characterization.expected_score_ej,
          minAcceptanceScore: characterization.min_acceptance_score_aj,
        },
      }),
    }),
    fetch("/api/aom"),
  ]);

  if (!matchRes.ok) {
    const { error } = await matchRes.json().catch(() => ({ error: matchRes.statusText }));
    throw new Error(`Matching failed: ${error}`);
  }
  const { ranked } = await matchRes.json();

  const aomDetails: Record<string, AomDetail> = {};
  if (aomRes.ok) {
    const { listings } = await aomRes.json();
    for (const l of listings) {
      const title = l.project?.name && l.unitLabel
        ? `${l.project.name} — ${l.unitLabel}`
        : (l.unitLabel ?? l.title ?? "");
      aomDetails[l.id] = {
        title,
        address: l.project?.location ?? "",
        description: l.description ?? "",
        eil: l.eil,
        ail: l.ail,
        price: l.price ?? 0,
        priceFrom: Boolean(l.priceFrom),
        developerId: l.seller?.id ?? "",
        ownerType: (l.ownerType as string) ?? "developer",
        attributes: parseAttributes(l.attributes),
      };
    }
  }

  const payload: MatchPayload = { ranked, characterization, aomDetails };
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload)); } catch { /* storage blocked: still return it */ }
  return payload;
}

/** Cached results, or null. */
export function cachedMatchResults(): MatchPayload | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as MatchPayload) : null;
  } catch {
    return null;
  }
}

/** Cache first; otherwise rebuild from the server-side buyer profile. Null when there is no saved profile. */
export async function loadMatchResults(): Promise<MatchPayload | null> {
  const cached = cachedMatchResults();
  if (cached) return cached;
  await migrateLegacyToken(); // a pre-cookie browser must hand over its token before the first authenticated call
  const res = await fetch("/api/buyer/profile");
  if (!res.ok) return null;
  const profile = (await res.json()) as CharacterizationResult | null;
  if (!profile || typeof profile.expected_score_ej !== "number") return null;
  return runMatch(profile);
}
