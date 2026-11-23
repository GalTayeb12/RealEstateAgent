"use client";
/**
 * /results — Step 2c
 *
 * Reads matchResults from sessionStorage (written by /processing) and renders
 * the ranked AOM matches with the full design system.
 *
 * Additions:
 *   - Toast notification after offer submission (auto-dismiss 5s)
 *   - Leverage Group modal directly on each feasible card
 *   - "My offers" nav link with unread-update badge
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { EstimatedPriceNote, Money } from "@/components/Money";
import { useI18n } from "@/components/LocaleProvider";
import { useAudioUnlock } from "@/components/AudioUnlockProvider";
import Link from "next/link";
import { computeElasticity, ElasticityResult } from "@/lib/elasticity";
import { AlertCard } from "@/components/AlertCard";
import type { MortgageSavedData } from "@/components/MortgageCalculator";
import { groupByProject } from "@/lib/projectGroups";
import ResultsHero, { type HeroItem } from "@/components/results/ResultsHero";
import { computeFit } from "@/lib/fitScore";
import { loadMatchResults } from "@/lib/matchFlow";
import "@/components/results/results-sections.css";

// ── Types ──────────────────────────────────────────────────────────────────────

type HardFilterReason =
  | { kind: "rooms"; actual: number | null; required: number }
  | { kind: "budget"; actual: number; max: number }
  | { kind: "location"; actual: string; required: string };

interface MatchOutcome {
  aomId: string;
  title: string;
  pfij: number;
  zij: number;
  valid: boolean;
  lowerBound: number;
  upperBound: number;
  /** Whether the property passes all hard requirement filters (rooms, budget, area) */
  passesHardFilters?: boolean;
  /** Specific reasons a hard filter failed */
  hardFilterFailReasons?: HardFilterReason[];
  /** Project this apartment type belongs to (results group by it) */
  projectId?: string;
  projectName?: string;
  unitLabel?: string;
}

interface AomDetail {
  title: string;
  /** Project street address (project.location); absent in results stored before this field existed */
  address?: string;
  description: string;
  eil: number;
  ail: number;
  price: number;
  priceFrom?: boolean;
  developerId: string;
  ownerType: string;
  attributes: Record<string, unknown>;
}

interface PsychometricScores {
  verbal_reasoning: number;
  numerical_reasoning: number;
  spatial_reasoning: number;
  abstract_reasoning: number;
  memory: number;
  attention: number;
  processing_speed: number;
  executive_function: number;
}

interface Characterization {
  buyer_preferences: {
    property_type: string;
    location: string;
    bedrooms: number | null;
    bathrooms: number | null;
    budget_max: number | null;
    must_haves: string[];
    dealbreakers: string[];
    timeline: string;
    additional_notes: string;
  };
  expected_score_ej: number;
  min_acceptance_score_aj: number;
  behavioral_insights: string;
  intent_signals: string;
  psychometric_scores?: PsychometricScores;
}

interface StoredResults {
  ranked: MatchOutcome[];
  characterization: Characterization;
  aomDetails: Record<string, AomDetail>;
}

interface Recommendation {
  id: string;
  label: string;
  icon: string;
  blurb: string;
}

interface LeverageGroup {
  id: string;
  memberCount: number;
  requestedDiscountPercent: number;
  requestedTerms: string;
  status: string;
  createdAt: string;
  unitType: { unitLabel: string; price: number; project: { name: string } };
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const { m } = useI18n();
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div style={{
      position: "fixed", bottom: "1.5rem", left: "50%", transform: "translateX(-50%)",
      zIndex: 9999, display: "flex", alignItems: "center", gap: "0.75rem",
      background: "var(--c-card,#FFFFFF)", color: "var(--c-ink,#123F40)", borderRadius: 16,
      border: "1px solid var(--c-line,#D4DED8)",
      padding: "0.875rem 1.25rem", boxShadow: "0 10px 28px rgba(18,63,64,0.12)",
      fontSize: "0.9375rem", fontWeight: 500, maxWidth: "90vw",
      animation: "slideUp 0.25s ease-out",
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--c-ok,#246046)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span>{message}</span>
      <Link href="/buyer/offers" style={{ color: "var(--c-gold,#756039)", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap", marginLeft: "0.25rem" }}>
        {m.results.trackIt}
      </Link>
      <button onClick={onDismiss} style={{ background: "none", border: "none", color: "var(--c-muted,#526563)", cursor: "pointer", fontSize: "1rem", padding: "0 0.125rem", marginLeft: "0.25rem" }}>✕</button>
    </div>
  );
}

// ── Leverage Group Modal ──────────────────────────────────────────────────────
//
// Design intent: no price/discount negotiation in the UI.
// The user simply signals interest (join or start a group).
// The admin sees member counts and handles negotiations manually off-platform.
//
// requestedDiscountPercent is stored as 0 in the DB when the user starts a
// group — the field is kept in the schema so the existing API and developer
// dashboard remain intact, but it is never exposed to the buyer.

function LeverageModal({
  outcome,
  token,
  onClose,
}: {
  outcome: MatchOutcome;
  token: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [existingGroups, setExistingGroups] = useState<LeverageGroup[]>([]);
  const [myGroupIds, setMyGroupIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const { m } = useI18n();
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [openRes, myRes] = await Promise.all([
        fetch("/api/buyer/leverage-groups?available=true", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/buyer/leverage-groups", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const openData = await openRes.json();
      const myData = await myRes.json();
      // Filter to this AOM by matching title (unitTypeId not exposed in unitType sub-object)
      const relevant = (openData.groups ?? []).filter((g: LeverageGroup) =>
        `${g.unitType.project.name} — ${g.unitType.unitLabel}` === outcome.title
      );
      const myRelevant: string[] = (myData.groups ?? [])
        .filter((g: LeverageGroup) => `${g.unitType.project.name} — ${g.unitType.unitLabel}` === outcome.title)
        .map((g: LeverageGroup) => g.id);
      setExistingGroups(relevant);
      setMyGroupIds(new Set(myRelevant));
    } catch { /* leave empty */ }
    setLoading(false);
  }, [token, outcome.title]);

  useEffect(() => { load(); }, [load]);

  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);

  // Join an existing group
  async function join(groupId: string) {
    setError("");
    try {
      const res = await fetch(`/api/buyer/leverage-groups/${groupId}/join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      setSuccess("join");
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // Start a new group — sends requestedDiscountPercent: 0 (sentinel = "no specific
  // discount requested; admin will negotiate manually"). The field is required by
  // the existing API and stored in the DB, but never shown to the user.
  async function create() {
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/buyer/leverage-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          unitTypeId: outcome.aomId,
          requestedDiscountPercent: 0, // sentinel — admin negotiates off-platform
          requestedTerms: "",
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      setSuccess("create");
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const successMsg = success === "join"
    ? m.results.joinedBody
    : m.results.requestBody;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(20,19,15,0.55)", zIndex: 1000, backdropFilter: "blur(3px)" }}
      />
      {/* Panel */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 1001, width: "min(92vw, 30rem)",
        background: "var(--c-card,#FFFFFF)", borderRadius: 24,
        border: "1px solid rgba(18,63,64,0.1)",
        boxShadow: "0 24px 64px -20px rgba(0,0,0,0.4)",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid rgba(18,63,64,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--c-ink,#123F40)", marginBottom: "0.2rem" }}>
              {m.results.groupBuyingInterest}
            </div>
            <div style={{ fontFamily: "var(--font-heebo, sans-serif)", fontSize: "1rem", fontWeight: 600, color: "var(--c-ink,#123F40)" }}>
              {outcome.title}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--c-muted,#526563)", fontSize: "1.25rem", lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>

          {/* Loading */}
          {loading && (
            <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
              <div style={{ width: "1.5rem", height: "1.5rem", borderRadius: "50%", border: "2px solid rgba(18,63,64,0.08)", borderTopColor: "var(--c-ink,#123F40)", animation: "spin 0.9s linear infinite", margin: "0 auto" }} />
            </div>
          )}

          {/* Success confirmation */}
          {success && (
            <div style={{ background: "var(--c-soft,#E9EEEA)", borderRadius: 10, padding: "1rem 1.125rem", display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--c-ink,#123F40)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <div>
                <div style={{ fontWeight: 600, color: "var(--c-ink,#123F40)", fontSize: "0.9375rem", marginBottom: "0.3rem" }}>
                  {success === "join" ? m.results.youreIn : m.results.groupRegisteredTitle}
                </div>
                <div style={{ fontSize: "0.875rem", color: "var(--c-muted,#3A6B6A)", lineHeight: 1.55 }}>{successMsg}</div>
              </div>
            </div>
          )}

          {/* Groups list + actions */}
          {!loading && !success && (
            <>
              {existingGroups.length > 0 ? (
                <div>
                  {/* How it works blurb */}
                  <div style={{ background: "var(--c-soft,#F5F3EE)", borderRadius: 10, padding: "0.75rem 1rem", fontSize: "0.8125rem", color: "var(--c-muted,#526563)", lineHeight: 1.55, marginBottom: "0.875rem" }}>
                    {m.results.poolBlurb}
                  </div>

                  <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--c-muted,#526563)", marginBottom: "0.625rem" }}>
                    {m.results.openGroup}
                  </div>

                  {existingGroups.map(g => {
                    const inGroup = myGroupIds.has(g.id);
                    return (
                      <div key={g.id} style={{ background: "var(--c-card,#fff)", border: "1px solid var(--c-line,#E0DDD7)", borderRadius: 12, padding: "0.875rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.625rem" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-ink,#123F40)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                            </svg>
                            <span style={{ fontFamily: "var(--font-heebo, sans-serif)", fontWeight: 600, fontSize: "0.9375rem", color: "var(--c-ink,#123F40)", fontVariantNumeric: "tabular-nums" }}>
                              {g.memberCount} {g.memberCount === 1 ? m.results.buyerInterested : m.results.buyersInterested}
                            </span>
                          </div>
                          <div style={{ fontSize: "0.8125rem", color: "var(--c-muted,#526563)", marginTop: "0.25rem" }}>
                            {m.results.started} {new Date(g.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                          </div>
                        </div>
                        {inGroup ? (
                          <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--c-ink,#123F40)", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                            {m.results.joinedCheck}
                          </span>
                        ) : (
                          <button
                            onClick={() => join(g.id)}
                            style={{ padding: "0.5rem 1.125rem", borderRadius: 999, background: "linear-gradient(155deg, var(--c-btn-hover,#0C3031), var(--c-btn-hover,#123332))", color: "var(--c-on-btn,#fff)", border: "none", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 4px 12px -4px rgba(18,51,50,0.4)" }}
                          >
                            {m.results.joinGroup}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* No group yet — show "start one" */
                <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                  <div style={{ background: "var(--c-soft,#F5F3EE)", borderRadius: 10, padding: "0.875rem 1rem", fontSize: "0.875rem", color: "var(--c-muted,#526563)", lineHeight: 1.6 }}>
                    {m.results.noGroupYet}
                  </div>
                  {error && <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--c-err,#9E3434)" }}>{error}</p>}
                  <button
                    onClick={create}
                    disabled={submitting}
                    style={{ padding: "0.6875rem 1.5rem", borderRadius: 999, background: submitting ? "rgba(31,75,74,0.55)" : "linear-gradient(155deg, var(--c-btn-hover,#0C3031), var(--c-btn-hover,#123332))", color: "var(--c-on-btn,#fff)", border: "none", fontSize: "0.875rem", fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer", boxShadow: submitting ? "none" : "0 1px 0 rgba(255,255,255,0.15) inset, 0 8px 20px -8px rgba(18,51,50,0.5)", alignSelf: "flex-start" }}
                  >
                    {submitting ? m.results.registering : m.results.signalInterest}
                  </button>
                </div>
              )}

              {/* Shared error for join actions */}
              {error && existingGroups.length > 0 && (
                <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--c-err,#9E3434)" }}>{error}</p>
              )}
            </>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes slideUp { from { opacity: 0; transform: translateX(-50%) translateY(1rem); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }`}</style>
    </>
  );
}

// ── Alignment bar ─────────────────────────────────────────────────────────────

/** Seller range, buyer range and their overlap: three clearly different colours, shared by the bar and its legend. */
const BAR = {
  seller: { color: "#3C8C86", opacity: 0.55 },
  buyer: { color: "#C58B2E", opacity: 0.55 },
  overlap: { color: "#1F5C45", opacity: 0.95 },
} as const;

function AlignmentBar({
  outcome,
  ej,
  aj,
  aom,
  elasticity,
}: {
  outcome: MatchOutcome;
  ej: number;
  aj: number;
  aom: { eil: number; ail: number };
  elasticity: ElasticityResult | null;
}) {
  const { m } = useI18n();
  const pct = (v: number) => `${Math.max(0, Math.min(100, v))}%`;
  const { eil, ail } = aom;
  const { lowerBound, upperBound, pfij, valid } = outcome;
  const showElasticity = valid && elasticity !== null;

  return (
    <div dir="ltr" style={{ marginTop: "1.25rem", direction: "ltr" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "1.25rem", marginBottom: "0.625rem", fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--c-muted,#526563)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: BAR.seller.color, opacity: BAR.seller.opacity + 0.3, display: "inline-block" }} />{m.results.sellerRange}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: BAR.buyer.color, opacity: BAR.buyer.opacity + 0.3, display: "inline-block" }} />{m.results.yourRange}
        </span>
        {valid && (
          <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: BAR.overlap.color, display: "inline-block" }} />{m.results.overlap}
          </span>
        )}
        {showElasticity && (
          <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <span style={{ width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: "6px solid var(--c-ink,#123F40)", display: "inline-block" }} />{m.results.suggestedMarker}
          </span>
        )}
      </div>

      <div style={{ position: "relative" }}>
        <div style={{ position: "relative", height: "0.75rem", background: "var(--c-soft,#EFEDE6)", borderRadius: 99, overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, bottom: 0, left: pct(eil), width: `${ail - eil}%`, background: BAR.seller.color, opacity: BAR.seller.opacity }} />
          <div style={{ position: "absolute", top: 0, bottom: 0, left: pct(aj), width: `${ej - aj}%`, background: BAR.buyer.color, opacity: BAR.buyer.opacity }} />
          {valid && <div style={{ position: "absolute", top: 0, bottom: 0, left: pct(lowerBound), width: `${upperBound - lowerBound}%`, background: BAR.overlap.color, opacity: BAR.overlap.opacity }} />}
          {valid && <div style={{ position: "absolute", top: 0, bottom: 0, left: pct(pfij), width: 2, background: "var(--c-card,#fff)", transform: "translateX(-1px)" }} />}
        </div>
        {showElasticity && (
          <div
            title={`${m.results.suggestedMarker}: ${elasticity!.suggestedScore}`}
            style={{ position: "absolute", top: "0.75rem", left: pct(elasticity!.suggestedScore), transform: "translateX(-50%)", marginTop: 3, width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "7px solid var(--c-ink,#123F40)" }}
          />
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: showElasticity ? "0.8rem" : "0.3rem", fontSize: "0.625rem", color: "var(--c-muted,#526563)", fontFamily: "var(--font-heebo, sans-serif)" }}>
        <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
      </div>

      <div style={{ marginTop: "0.625rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", fontSize: "0.75rem", color: "var(--c-muted,#526563)", fontFamily: "var(--font-heebo, sans-serif)" }}>
        <span>{m.results.sellerMin}: {eil}</span><span>{m.results.sellerTarget}: {ail}</span>
        <span style={{ color: "var(--c-gold,#756039)" }}>{m.results.yourFloor}: {aj}</span>
        <span style={{ color: "var(--c-gold,#756039)" }}>{m.results.yourIdeal}: {ej}</span>
        {valid && <span style={{ color: "var(--c-ink,#123F40)", fontWeight: 600 }}>{m.results.matchScore}: {pfij}</span>}
        {showElasticity && <span style={{ color: "var(--c-ink,#123F40)", fontWeight: 600 }}>↓ {m.results.suggested}: {elasticity!.suggestedScore}</span>}
      </div>

      {showElasticity && (
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.75rem", color: "var(--c-muted,#526563)", fontStyle: "italic", lineHeight: 1.5 }}>
          {elasticity!.direction === "toward_seller"
            ? m.results.towardSeller
            : elasticity!.direction === "toward_buyer"
              ? m.results.towardBuyer
              : lowerBound === upperBound
                ? m.results.oneScore
                : m.results.balanced}
        </p>
      )}
    </div>
  );
}

// ── Send Offer panel ──────────────────────────────────────────────────────────

type OfferPhase = "idle" | "open" | "submitting" | "sent" | "error";

function SendOfferPanel({
  outcome,
  detail,
  token,
  onOfferSent,
  ownerType,
  compact = false,
}: {
  outcome: MatchOutcome;
  detail: AomDetail;
  token: string;
  onOfferSent: () => void;
  ownerType: string;
  /** Hero use: bare button inline with its siblings; the form/confirmation panels span the full row. */
  compact?: boolean;
}) {
  const router = useRouter();
  const { m } = useI18n();
  const isDeveloperUnit = ownerType === "developer";
  const [phase, setPhase] = useState<OfferPhase>("idle");
  const [offeredPrice, setOfferedPrice] = useState(detail.price > 0 ? String(detail.price) : "");
  const [terms, setTerms] = useState("");
  const [errMsg, setErrMsg] = useState("");

  async function submit() {
    setPhase("submitting");
    setErrMsg("");
    try {
      const body: Record<string, unknown> = { unitTypeId: outcome.aomId };
      if (isDeveloperUnit) {
        body.offeredPrice = detail.price;
        body.terms = "";
      } else {
        const priceNum = Number(offeredPrice);
        if (!offeredPrice || isNaN(priceNum) || priceNum <= 0) {
          setErrMsg(m.results.enterPrice);
          setPhase("open");
          return;
        }
        body.offeredPrice = priceNum;
        body.terms = terms;
      }

      const res = await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.instantAccepted === true) {
        // Developer unit — redirect to Deal Room immediately
        router.push(`/deal/${data.offer.id}`);
        return;
      }
      setPhase("sent");
      onOfferSent(); // trigger toast at page level
    } catch (err) {
      setErrMsg((err as Error).message);
      setPhase("error");
    }
  }

  if (phase === "sent") {
    return (
      <div style={{ marginTop: compact ? 0 : "1.25rem", flexBasis: compact ? "100%" : undefined, padding: "1rem 1.125rem", background: "linear-gradient(135deg, var(--c-soft,#EEF4F3), var(--c-soft,#E4EEEC))", borderRadius: 12, border: "1px solid var(--c-line,#B8D4D3)", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--c-ink,#123F40)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <div>
          <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-ink,#123F40)" }}>
            {m.results.offerSent} — <Money amount={Number(offeredPrice)} />
            <EstimatedPriceNote />
          </div>
          {terms && <div style={{ fontSize: "0.8125rem", color: "var(--c-muted,#3A6B6A)", marginTop: "0.125rem" }}>&ldquo;{terms}&rdquo;</div>}
        </div>
      </div>
    );
  }

  if (phase === "idle") {
    return (
      <div style={{ marginTop: compact ? 0 : "1.5rem" }}>
        <button
          onClick={() => setPhase("open")}
          style={{ padding: "0.625rem 1.5rem", borderRadius: 999, background: "linear-gradient(155deg, var(--c-btn-hover,#0C3031), var(--c-btn-hover,#123332))", color: "var(--c-on-btn,#fff)", border: "none", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", boxShadow: "0 1px 0 rgba(255,255,255,0.15) inset, 0 8px 20px -8px rgba(18,51,50,0.5)", letterSpacing: "0.01em" }}
        >
          {isDeveloperUnit ? m.results.reserve : m.results.sendOffer}
        </button>
      </div>
    );
  }

  // Developer unit: simplified confirmation panel — no price input or terms
  if (isDeveloperUnit) {
    return (
      <div style={{ marginTop: compact ? 0 : "1.25rem", flexBasis: compact ? "100%" : undefined, background: "var(--c-soft,#F5F3EE)", borderRadius: 14, border: "1px solid rgba(18,63,64,0.08)", overflow: "hidden" }}>
        <div style={{ padding: "0.875rem 1.25rem", borderBottom: "1px solid rgba(18,63,64,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--c-card,#fff)" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--c-ink,#123F40)" }}>{m.results.reserve}</span>
          <button onClick={() => { setPhase("idle"); setErrMsg(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--c-muted,#526563)", fontSize: "1rem", lineHeight: 1, padding: "0.125rem" }} aria-label={m.nav.closeMenu}>✕</button>
        </div>
        <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ background: "var(--c-card,#fff)", borderRadius: 10, border: "1px solid var(--c-line,#E0DDD7)", padding: "0.875rem 1rem" }}>
            <div style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--c-muted,#526563)", marginBottom: "0.25rem" }}>
              {m.results.reservingAt}
            </div>
            <div style={{ fontFamily: "var(--font-heebo, sans-serif)", fontSize: "1.25rem", fontWeight: 600, color: "var(--c-ink,#123F40)" }}>
              {detail.priceFrom ? `${m.results.from} ` : ""}
              <Money amount={detail.price} />
            </div>
            <EstimatedPriceNote />
            <div style={{ fontSize: "0.8125rem", color: "var(--c-muted,#526563)", marginTop: "0.25rem" }}>
              {m.results.fixed}
            </div>
          </div>
          {errMsg && <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--c-err,#9E3434)", fontWeight: 500 }}>{errMsg}</p>}
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <button
              onClick={submit} disabled={phase === "submitting"}
              style={{ padding: "0.625rem 1.5rem", borderRadius: 999, background: phase === "submitting" ? "rgba(31,75,74,0.55)" : "linear-gradient(155deg, var(--c-btn-hover,#0C3031), var(--c-btn-hover,#123332))", color: "var(--c-on-btn,#fff)", border: "none", fontSize: "0.875rem", fontWeight: 600, cursor: phase === "submitting" ? "not-allowed" : "pointer", boxShadow: phase === "submitting" ? "none" : "0 1px 0 rgba(255,255,255,0.15) inset, 0 8px 20px -8px rgba(18,51,50,0.5)" }}
            >
              {phase === "submitting" ? m.results.reserving : m.results.confirm}
            </button>
            <button onClick={() => { setPhase("idle"); setErrMsg(""); }} style={{ background: "none", border: "none", fontSize: "0.8125rem", color: "var(--c-muted,#526563)", cursor: "pointer", padding: "0.25rem", fontWeight: 500 }}>
              {m.results.cancel}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Seller unit: standard offer form
  return (
    <div style={{ marginTop: compact ? 0 : "1.25rem", flexBasis: compact ? "100%" : undefined, background: "var(--c-soft,#F5F3EE)", borderRadius: 14, border: "1px solid rgba(18,63,64,0.08)", overflow: "hidden" }}>
      <div style={{ padding: "0.875rem 1.25rem", borderBottom: "1px solid rgba(18,63,64,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--c-card,#fff)" }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--c-ink,#123F40)" }}>{m.results.makeOffer}</span>
        <button onClick={() => { setPhase("idle"); setErrMsg(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--c-muted,#526563)", fontSize: "1rem", lineHeight: 1, padding: "0.125rem" }} aria-label={m.nav.closeMenu}>✕</button>
      </div>

      <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          <label style={{ display: "block", fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--c-muted,#55534C)", marginBottom: "0.5rem" }}>
            {m.results.yourPrice}
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", insetInlineStart: "0.875rem", top: "50%", transform: "translateY(-50%)", fontSize: "1rem", fontWeight: 600, color: "var(--c-muted,#526563)", pointerEvents: "none" }}>₪</span>
              <input
                type="number" min={1} step={1000} value={offeredPrice}
                onChange={e => setOfferedPrice(e.target.value)}
                style={{ background: "var(--c-card,#fff)", border: "1.5px solid var(--c-line,#E0DDD7)", borderRadius: 10, padding: "0.625rem 0.875rem 0.625rem 2rem", fontSize: "1.125rem", fontWeight: 600, fontFamily: "var(--font-heebo, sans-serif)", outline: "none", width: "12rem", boxSizing: "border-box" }}
                onFocus={e => { e.target.style.borderColor = "#123F40"; e.target.style.boxShadow = "0 0 0 3px rgba(31,75,74,0.12)"; }}
                onBlur={e => { e.target.style.borderColor = "#E0DDD7"; e.target.style.boxShadow = "none"; }}
              />
            </div>
            {detail.price > 0 && <span style={{ fontSize: "0.8125rem", color: "var(--c-muted,#526563)" }}>{m.results.listedAt} <Money amount={detail.price} /></span>}
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--c-muted,#55534C)", marginBottom: "0.5rem" }}>
            {m.results.termsOptional}
          </label>
          <textarea
            rows={2} value={terms} onChange={e => setTerms(e.target.value)}
            placeholder={m.results.termsPh}
            style={{ width: "100%", background: "var(--c-card,#fff)", border: "1.5px solid var(--c-line,#E0DDD7)", borderRadius: 10, padding: "0.625rem 0.875rem", fontSize: "0.9375rem", outline: "none", resize: "none", fontFamily: "inherit", boxSizing: "border-box" }}
            onFocus={e => { e.target.style.borderColor = "#123F40"; e.target.style.boxShadow = "0 0 0 3px rgba(31,75,74,0.12)"; }}
            onBlur={e => { e.target.style.borderColor = "#E0DDD7"; e.target.style.boxShadow = "none"; }}
          />
        </div>

        {errMsg && <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--c-err,#9E3434)", fontWeight: 500 }}>{errMsg}</p>}

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <button
            onClick={submit} disabled={phase === "submitting"}
            style={{ padding: "0.625rem 1.5rem", borderRadius: 999, background: phase === "submitting" ? "rgba(31,75,74,0.55)" : "linear-gradient(155deg, var(--c-btn-hover,#0C3031), var(--c-btn-hover,#123332))", color: "var(--c-on-btn,#fff)", border: "none", fontSize: "0.875rem", fontWeight: 600, cursor: phase === "submitting" ? "not-allowed" : "pointer", boxShadow: phase === "submitting" ? "none" : "0 1px 0 rgba(255,255,255,0.15) inset, 0 8px 20px -8px rgba(18,51,50,0.5)" }}
          >
            {phase === "submitting" ? m.results.sending : m.results.submitOffer}
          </button>
          <button onClick={() => { setPhase("idle"); setErrMsg(""); }} style={{ background: "none", border: "none", fontSize: "0.8125rem", color: "var(--c-muted,#526563)", cursor: "pointer", padding: "0.25rem", fontWeight: 500 }}>
            {m.results.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Near-match card ───────────────────────────────────────────────────────────

function renderFailReason(reason: HardFilterReason, m: { filterFailRooms: string; filterFailRoomsUnknown: string; filterFailBudget: string; filterFailLocation: string }): string {
  switch (reason.kind) {
    case "rooms":
      if (reason.actual === null) return m.filterFailRoomsUnknown;
      return m.filterFailRooms
        .replace("{actual}", String(reason.actual))
        .replace("{required}", String(reason.required));
    case "budget":
      return m.filterFailBudget;
    case "location":
      return m.filterFailLocation;
  }
}

function NearMatchCard({
  outcome,
  detail,
}: {
  outcome: MatchOutcome;
  detail: AomDetail | undefined;
}) {
  const { m } = useI18n();
  const failReasons = outcome.hardFilterFailReasons ?? [];

  return (
    <div className="rs-card near">
      <div className="rs-in">
        <div className="rs-top">
          <div className="rs-id">
            <span className="rs-eyebrow">{m.results.nearMatchTitle}</span>
            <h2>{outcome.title}</h2>
            {detail?.description && <p className="rs-desc">{detail.description.replace(/^DESCRIPTION:\s*/i, "")}</p>}
            {detail && detail.price > 0 && <div className="rs-price"><b className="num"><Money amount={detail.price} /></b></div>}
          </div>
        </div>
        {failReasons.length > 0 && (
          <div className="rs-chips">
            {failReasons.map((reason, i) => <span key={i} className="rs-chip warn">{renderFailReason(reason, m.results)}</span>)}
          </div>
        )}
        <div className="rs-actions">
          <DetailsLink href={`/aom/${outcome.aomId}`} tone="var(--c-gold,#756039)">{m.results.viewDetails} →</DetailsLink>
        </div>
      </div>
    </div>
  );
}

/** "לפרטי הנכס": an outlined pill that fills on hover, instead of a bare text link. */
function DetailsLink({ href, tone = "var(--c-ink,#123F40)", children }: { href: string; tone?: string; children: React.ReactNode }) {
  const [on, setOn] = useState(false);
  return (
    <Link
      href={href}
      onMouseEnter={() => setOn(true)} onMouseLeave={() => setOn(false)} onFocus={() => setOn(true)} onBlur={() => setOn(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.45rem 1.1rem", borderRadius: 999,
        border: `1.5px solid ${tone}`, background: on ? tone : "transparent", color: on ? "var(--c-on-btn,#fff)" : tone,
        fontSize: "0.8125rem", fontWeight: 600, textDecoration: "none", transition: "background .18s, color .18s, transform .18s",
        transform: on ? "translateY(-1px)" : "none",
      }}
    >
      {children}
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface RateLimitInfo {
  attempts: number;
  remaining: number;
  nextAvailableAt: string | null;
}

const MAX_INTERVIEWS_PER_DAY = 2;

function formatWait(nextAvailableAt: string, soon: string): string {
  const diff = new Date(nextAvailableAt).getTime() - Date.now();
  if (diff <= 0) return soon;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.ceil((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function ResultsPage() {
  const router = useRouter();
  const { m } = useI18n();
  const { unlock } = useAudioUnlock();
  const [data, setData] = useState<StoredResults | null>(null);
  const [token, setToken] = useState("");
  const [missing, setMissing] = useState(false);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [toast, setToast] = useState(false);
  const [leverageTarget, setLeverageTarget] = useState<MatchOutcome | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);
  const [mortgageMaxPrice, setMortgageMaxPrice] = useState<number | null>(null);
  const [mortgageFilterActive, setMortgageFilterActive] = useState(false);
  const [mortgageSavedData, setMortgageSavedData] = useState<MortgageSavedData | null>(null);

  const dismissToast = useCallback(() => setToast(false), []);

  useEffect(() => {
    const t = localStorage.getItem("token") ?? "";
    setToken(t);
    // sessionStorage cache first; otherwise rebuild from the buyer profile saved on the server.
    loadMatchResults()
      .then((payload) => { if (payload) setData(payload as unknown as StoredResults); else setMissing(true); })
      .catch(() => setMissing(true));

    if (t) {
      // Fetch recommendations
      fetch("/api/recommendations", { headers: { Authorization: `Bearer ${t}` } })
        .then(r => r.json())
        .then(d => { if (d.recommendations) setRecommendations(d.recommendations); })
        .catch(() => {});

      // Fetch saved mortgage settings
      fetch("/api/buyer/mortgage-settings", { headers: { Authorization: `Bearer ${t}` } })
        .then(r => r.ok ? r.json() : null)
        .then((d: MortgageSavedData | null) => {
          if (d) {
            setMortgageSavedData(d);
            if (d.maxPrice) setMortgageMaxPrice(d.maxPrice);
          }
        })
        .catch(() => {});

      // Fetch interview rate-limit status for retake button
      fetch("/api/interview/rate-limit", { headers: { Authorization: `Bearer ${t}` } })
        .then(r => r.ok ? r.json() : null)
        .then((d: RateLimitInfo | null) => { if (d) setRateLimit(d); })
        .catch(() => {});
    }
  }, []);

  if (missing) {
    return (
      <main style={{ minHeight: "100vh", background: "var(--c-soft,#F4F5F0)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-inter, sans-serif)" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "var(--c-muted,#526563)", marginBottom: "1rem", fontSize: "0.9375rem" }}>{m.results.noSession}</p>
          <Link href="/processing" style={{ color: "var(--c-ink,#123F40)", fontWeight: 600, textDecoration: "none" }}>{m.results.runMatching} →</Link>
        </div>
      </main>
    );
  }

  if (!data) return null;

  const { ranked, characterization: char, aomDetails } = data;
  const { expected_score_ej: ej, min_acceptance_score_aj: aj } = char;
  const prefs = char.buyer_preferences;

  // Full matches: Zij feasible AND passes all hard filters
  // Near matches: Zij feasible BUT fails ≥1 hard filter
  // Infeasible (!valid): not shown at all
  const allFullMatches = ranked.filter(
    (r) => r.valid && (r.passesHardFilters ?? true)
  );
  // Mortgage in-range filter (only when active)
  const fullMatches = mortgageFilterActive && mortgageMaxPrice != null
    ? allFullMatches.filter((r) => {
        const detail = aomDetails[r.aomId];
        return !detail || detail.price <= 0 || detail.price <= mortgageMaxPrice;
      })
    : allFullMatches;
  const allNearMatches = ranked.filter(
    (r) => r.valid && r.passesHardFilters === false
  );
  // One card per project: best fitting type leads, other fitting types under it,
  // non-fitting types of that project hidden; projects with no fit stay "near".
  const { groups: projectCards, near: nearMatches } = groupByProject(fullMatches, allNearMatches);
  const projectCount = new Set(ranked.map((r) => r.projectId ?? r.aomId)).size;
  // Fit score (lib/fitScore.ts): readable 0-100 fit to what the buyer asked for; Zij stays as the negotiation score.
  const fitOf = (best: MatchOutcome) => {
    const d = aomDetails[best.aomId];
    return computeFit({ prefs, outcome: best, ej, aj, price: d?.price, attributes: d?.attributes, unitLabel: best.unitLabel });
  };
  const rankedCards = projectCards
    .map((c) => ({ ...c, fit: fitOf(c.best) }))
    .sort((a, b) => b.fit.score - a.fit.score || b.best.zij - a.best.zij);
  const heroItems: HeroItem[] = rankedCards.map(({ key, best, fit }) => {
    const d = aomDetails[best.aomId];
    return {
      key, aomId: best.aomId, name: best.projectName ?? best.title, address: d?.address, unitLabel: best.unitLabel,
      zij: best.zij, fit: fit.score, fitParts: fit.components,
      price: d?.price ?? 0, priceFrom: d?.priceFrom, attributes: d?.attributes,
      eil: d?.eil ?? best.lowerBound, ail: d?.ail ?? best.upperBound, lowerBound: best.lowerBound, upperBound: best.upperBound,
    };
  });
  const summaryText = m.results.summary.replace("{valid}", String(projectCards.length)).replace("{total}", String(projectCount));

  return (
    <div style={{ minHeight: "100vh", background: "var(--c-soft,#F4F5F0)", fontFamily: "var(--font-inter, ui-sans-serif, sans-serif)" }}>
      <style>{`
        @media (max-width: 640px) {
          .hn-results-2col { grid-template-columns: 1fr !important; gap: 0.75rem !important; }
          .hn-results-recs  { grid-template-columns: 1fr !important; }
        }
      `}</style>
      {/* Toast */}
      {toast && <Toast message={m.results.offerToast} onDismiss={dismissToast} />}

      {/* Leverage modal */}
      {leverageTarget && (
        <LeverageModal outcome={leverageTarget} token={token} onClose={() => setLeverageTarget(null)} />
      )}

      {heroItems.length > 0 && (
        <ResultsHero
          items={heroItems} ej={ej} aj={aj} summary={summaryText} kicker={m.results.kicker} title={m.results.title}
          renderOffer={(key) => {
            const c = projectCards.find((x) => x.key === key);
            const d = c ? aomDetails[c.best.aomId] : undefined;
            return c && d ? <SendOfferPanel compact outcome={c.best} detail={d} token={token} onOfferSent={() => setToast(true)} ownerType={d.ownerType ?? "developer"} /> : null;
          }}
          onGroup={(key) => { const c = projectCards.find((x) => x.key === key); if (c) setLeverageTarget(c.best); }}
          renderRange={(key) => {
            const c = projectCards.find((x) => x.key === key);
            if (!c) return null;
            const d = aomDetails[c.best.aomId];
            const eil = d?.eil ?? c.best.lowerBound, ail = d?.ail ?? c.best.upperBound;
            const el = computeElasticity({ ej, aj }, { eil, ail }, { lowerBound: c.best.lowerBound, upperBound: c.best.upperBound });
            return <AlignmentBar outcome={c.best} ej={ej} aj={aj} aom={{ eil, ail }} elasticity={el} />;
          }}
        />
      )}

      {/* Page intro (no matches to feature) */}
      {heroItems.length === 0 && <div style={{ position: "relative", zIndex: 1, maxWidth: "75rem", margin: "0 auto", padding: "3rem 1.5rem 0" }}>
        <div style={{ fontFamily: "var(--font-heebo, sans-serif)", fontSize: "0.75rem", fontWeight: 500, letterSpacing: "0.08em", color: "var(--c-ink,#123F40)", marginBottom: "0.625rem" }}>
          {m.results.kicker}
        </div>
        <h1 style={{ fontFamily: "var(--font-heebo, sans-serif)", fontSize: "2.25rem", fontWeight: 500, color: "var(--c-ink,#123F40)", margin: "0 0 0.5rem", lineHeight: 1.15, letterSpacing: "0" }}>
          {m.results.title}
        </h1>
        <p style={{ margin: 0, color: "var(--c-muted,#526563)", fontSize: "1rem", lineHeight: 1.5 }}>
          {m.results.summary.replace("{valid}", String(projectCards.length)).replace("{total}", String(projectCount))}
        </p>
      </div>}

      {/* Content */}
      <main className="rs-page">
        <div className="rs-trio">

        {/* Buyer profile card */}
        <div className="rs-panel">
          <div>
            <div style={{ fontFamily: "var(--font-heebo, sans-serif)", fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--c-muted,#526563)", marginBottom: "1.25rem" }}>{m.results.yourProfile}</div>
            <div className="hn-results-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem 2.5rem" }}>
              {[[m.results.type, prefs.property_type], [m.results.location, prefs.location], [m.results.bedrooms, prefs.bedrooms != null ? `${prefs.bedrooms}+` : "—"], [m.results.timeline, prefs.timeline]].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: "0.6875rem", color: "var(--c-muted,#526563)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>{label}</div>
                  <div style={{ fontSize: "0.9375rem", color: "var(--c-ink,#123F40)", fontWeight: 500 }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "1.25rem", paddingTop: "1.25rem", borderTop: "1px solid rgba(18,63,64,0.06)", display: "flex", gap: "2rem", fontFamily: "var(--font-heebo, sans-serif)", fontSize: "0.8125rem" }}>
              <div><span style={{ color: "var(--c-muted,#526563)" }}>{m.results.yourIdeal} </span><span style={{ color: "var(--c-ink,#123F40)", fontWeight: 600 }}>{ej}</span></div>
              <div><span style={{ color: "var(--c-muted,#526563)" }}>{m.results.yourFloor} </span><span style={{ color: "var(--c-gold,#756039)", fontWeight: 600 }}>{aj}</span></div>
            </div>
            {/* Retake interview section */}
            <div style={{ marginTop: "1.25rem", paddingTop: "1.25rem", borderTop: "1px solid rgba(18,63,64,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.875rem" }}>
              <div>
                <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--c-muted,#526563)", marginBottom: "0.25rem" }}>
                  {m.results.quota}
                </div>
                {rateLimit ? (
                  <div style={{ fontSize: "0.875rem", color: "var(--c-muted,#526563)" }}>
                    <span style={{ color: rateLimit.remaining === 0 ? "var(--c-err,#9E3434)" : "var(--c-ink,#123F40)", fontWeight: 600 }}>
                      {rateLimit.attempts} / {MAX_INTERVIEWS_PER_DAY}
                    </span>{" "}
                    {m.results.usedToday}
                    {rateLimit.remaining === 0 && rateLimit.nextAvailableAt && (
                      <span style={{ color: "var(--c-muted,#526563)" }}>
                        {" "}— {m.results.resetsIn}{" "}
                        <span style={{ color: "var(--c-gold,#756039)", fontWeight: 600 }}>
                          {formatWait(rateLimit.nextAvailableAt, m.results.soon)}
                        </span>
                      </span>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: "0.875rem", color: "var(--c-muted,#526563)" }}>{m.common.loading}</div>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.375rem" }}>
                <button
                  disabled={!rateLimit || rateLimit.remaining === 0}
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      sessionStorage.setItem("requestedRetake", "true");
                    }
                    void unlock();
                    router.push("/interview");
                  }}
                  style={{
                    padding: "0.5rem 1.125rem",
                    borderRadius: 999,
                    border: "1px solid",
                    borderColor: !rateLimit || rateLimit.remaining === 0 ? "var(--c-line,#E0DDD7)" : "var(--c-ink,#123F40)",
                    background: !rateLimit || rateLimit.remaining === 0 ? "transparent" : "linear-gradient(155deg, var(--c-btn-hover,#0C3031), var(--c-btn-hover,#123332))",
                    color: !rateLimit || rateLimit.remaining === 0 ? "#C0BAB2" : "var(--c-on-btn,#fff)",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    cursor: !rateLimit || rateLimit.remaining === 0 ? "not-allowed" : "pointer",
                    boxShadow: !rateLimit || rateLimit.remaining === 0 ? "none" : "0 4px 12px -4px rgba(18,51,50,0.4)",
                    whiteSpace: "nowrap",
                    transition: "all 0.15s",
                  }}
                >
                  {m.results.redo}
                </button>
                {rateLimit && rateLimit.remaining > 0 && (
                  <div style={{ fontSize: "0.6875rem", color: "var(--c-muted,#526563)", textAlign: "end" }}>
                    {rateLimit.remaining} {m.results.retakesLeft}
                  </div>
                )}
                {rateLimit && rateLimit.remaining === 0 && rateLimit.nextAvailableAt && (
                  <div style={{ fontSize: "0.6875rem", color: "var(--c-err,#9E3434)", textAlign: "end" }}>
                    {m.results.tryAgainIn} {formatWait(rateLimit.nextAvailableAt, m.results.soon)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Property alert opt-in card */}
        {token && <AlertCard token={token} />}

        {/* Mortgage budget row */}
        <div className="rs-panel row">
          {mortgageSavedData?.maxPrice ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.875rem", color: "var(--c-muted,#526563)" }}>{m.profile.mortgageBudgetRow}</span>
                <span style={{ fontFamily: "var(--font-heebo, sans-serif)", fontWeight: 700, color: "var(--c-ink,#123F40)", fontSize: "1rem", fontVariantNumeric: "tabular-nums" }}>
                  ₪{new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 }).format(mortgageSavedData.maxPrice)}
                </span>
                <Link href="/profile#mortgage" style={{ fontSize: "0.8125rem", color: "var(--c-gold,#756039)", fontWeight: 600, textDecoration: "none" }}>· {m.profile.mortgageUpdate}</Link>
              </div>
              <button
                onClick={() => {
                  const next = !mortgageFilterActive;
                  setMortgageFilterActive(next);
                }}
                style={{
                  padding: "0.4rem 1rem",
                  borderRadius: 999,
                  border: "1.5px solid",
                  borderColor: mortgageFilterActive ? "var(--c-gold,#756039)" : "var(--c-line,#E0DDD7)",
                  background: mortgageFilterActive ? "var(--c-warn-bg,#FFF8E6)" : "transparent",
                  color: mortgageFilterActive ? "var(--c-gold,#756039)" : "var(--c-muted,#526563)",
                  fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "all 0.15s",
                }}
              >
                {mortgageFilterActive ? m.profile.mortgageFilterOff : m.profile.mortgageFilterToggle}
              </button>
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.875rem", color: "var(--c-muted,#526563)" }}>{m.profile.mortgageNoCta}</span>
              <Link href="/profile#mortgage" style={{ fontSize: "0.875rem", color: "var(--c-gold,#756039)", fontWeight: 600, textDecoration: "none" }}>{m.profile.mortgageNoCtaLink} →</Link>
            </div>
          )}
        </div>

        </div>

        {/* No full matches message */}
        {projectCards.length === 0 && (
          <div className="rs-panel">
            <div style={{ fontFamily: "var(--font-heebo, sans-serif)", fontSize: "1rem", fontWeight: 600, color: "var(--c-ink,#123F40)", marginBottom: "0.4rem" }}>
              {m.results.noFullMatchesTitle}
            </div>
            {nearMatches.length > 0 && (
              <p style={{ margin: 0, fontSize: "0.9375rem", color: "var(--c-muted,#526563)", lineHeight: 1.5 }}>
                {m.results.noFullMatchesBody}
              </p>
            )}
          </div>
        )}

        {/* Near match cards */}
        {nearMatches.length > 0 && (
          <>
            <div className="rs-sechead">
              {m.results.nearMatchTitle}
            </div>
            <div className="rs-near">
              {nearMatches.map((outcome) => {
                const detail = aomDetails[outcome.aomId];
                return (
                  <NearMatchCard
                    key={outcome.aomId}
                    outcome={outcome}
                    detail={detail}
                  />
                );
              })}
            </div>
          </>
        )}


        {/* Recommendations */}
        {fullMatches.length > 0 && recommendations.length > 0 && (
          <div className="rs-panel rs-wide">
            <div style={{ fontFamily: "var(--font-heebo, sans-serif)", fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--c-muted,#526563)", marginBottom: "1.25rem" }}>
              {m.results.nextSteps}
            </div>
            <div className="hn-results-recs" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(19rem, 1fr))", gap: "0.875rem" }}>
              {recommendations.map(r => {
                const recText = (m.results.recs as Record<string, { label: string; blurb: string }>)[r.id];
                return (
                  <div key={r.id} style={{ background: "var(--c-soft,#F5F3EE)", borderRadius: 14, border: "1px solid rgba(18,63,64,0.07)", padding: "1.125rem 1.25rem", display: "flex", gap: "0.875rem", alignItems: "flex-start" }}>
                    <span style={{ fontSize: "1.375rem", lineHeight: 1, flexShrink: 0, marginTop: "0.1rem" }}>{r.icon}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--c-ink,#123F40)", marginBottom: "0.3rem" }}>{recText?.label ?? r.label}</div>
                      <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--c-muted,#526563)", lineHeight: 1.6 }}>{recText?.blurb ?? r.blurb}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Leverage groups CTA */}
        {fullMatches.length > 0 && (
          <div className="rs-panel rs-wide">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1.25rem", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 600, color: "var(--c-ink,#123F40)", fontSize: "1rem", marginBottom: "0.3rem", letterSpacing: "0" }}>{m.results.groupCtaTitle}</div>
                <p style={{ margin: 0, fontSize: "0.9375rem", color: "var(--c-muted,#526563)", lineHeight: 1.5 }}>
                  {m.results.groupCtaBody}
                </p>
              </div>
              <Link
                href="/buyer/leverage-groups"
                style={{ padding: "0.6875rem 1.375rem", borderRadius: 999, background: "linear-gradient(155deg, var(--c-btn-hover,#0C3031), var(--c-btn-hover,#123332))", color: "var(--c-on-btn,#fff)", fontSize: "0.875rem", fontWeight: 600, textDecoration: "none", flexShrink: 0, boxShadow: "0 1px 0 rgba(255,255,255,0.15) inset, 0 8px 20px -8px rgba(18,51,50,0.5)", whiteSpace: "nowrap" }}
              >
                {m.results.viewGroups} →
              </Link>
            </div>
          </div>
        )}
      </main>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(1rem); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
