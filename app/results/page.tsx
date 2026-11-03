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
import Link from "next/link";
import { computeElasticity, ElasticityResult } from "@/lib/elasticity";
import { formatAttributeValue, parseAttributes } from "@/lib/attributes";

// ── Types ──────────────────────────────────────────────────────────────────────

interface MatchOutcome {
  aomId: string;
  title: string;
  pfij: number;
  zij: number;
  valid: boolean;
  lowerBound: number;
  upperBound: number;
}

interface AomDetail {
  title: string;
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
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div style={{
      position: "fixed", bottom: "1.5rem", left: "50%", transform: "translateX(-50%)",
      zIndex: 9999, display: "flex", alignItems: "center", gap: "0.75rem",
      background: "var(--qp-surface)", color: "var(--qp-ink)", borderRadius: 16,
      border: "1px solid var(--qp-border)",
      padding: "0.875rem 1.25rem", boxShadow: "0 10px 28px rgba(18,63,64,0.12)",
      fontSize: "0.9375rem", fontWeight: 500, maxWidth: "90vw",
      animation: "slideUp 0.25s ease-out",
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--qp-ink)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span>{message}</span>
      <Link href="/buyer/offers" style={{ color: "var(--qp-accent-text)", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap", marginLeft: "0.25rem" }}>
        Track it →
      </Link>
      <button onClick={onDismiss} style={{ background: "none", border: "none", color: "var(--qp-muted)", cursor: "pointer", fontSize: "1rem", padding: "0 0.125rem", marginLeft: "0.25rem" }}>✕</button>
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
        background: "var(--qp-surface)", borderRadius: 24,
        border: "1px solid rgba(18,63,64,0.1)",
        boxShadow: "0 24px 64px -20px rgba(0,0,0,0.4)",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid rgba(18,63,64,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--qp-ink)", marginBottom: "0.2rem" }}>
              Group buying interest
            </div>
            <div style={{ fontFamily: "var(--font-heebo, serif)", fontSize: "1rem", fontWeight: 600, color: "var(--qp-ink)" }}>
              {outcome.title}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--qp-muted)", fontSize: "1.25rem", lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>

          {/* Loading */}
          {loading && (
            <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
              <div style={{ width: "1.5rem", height: "1.5rem", borderRadius: "50%", border: "2px solid rgba(18,63,64,0.08)", borderTopColor: "var(--qp-ink)", animation: "spin 0.9s linear infinite", margin: "0 auto" }} />
            </div>
          )}

          {/* Success confirmation */}
          {success && (
            <div style={{ background: "var(--qp-soft)", borderRadius: 10, padding: "1rem 1.125rem", display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--qp-ink)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <div>
                <div style={{ fontWeight: 600, color: "var(--qp-ink)", fontSize: "0.9375rem", marginBottom: "0.3rem" }}>
                  {success === "join" ? m.results.youreIn : m.results.groupRegisteredTitle}
                </div>
                <div style={{ fontSize: "0.875rem", color: "var(--qp-muted)", lineHeight: 1.55 }}>{successMsg}</div>
              </div>
            </div>
          )}

          {/* Groups list + actions */}
          {!loading && !success && (
            <>
              {existingGroups.length > 0 ? (
                <div>
                  {/* How it works blurb */}
                  <div style={{ background: "var(--qp-soft)", borderRadius: 10, padding: "0.75rem 1rem", fontSize: "0.8125rem", color: "var(--qp-muted)", lineHeight: 1.55, marginBottom: "0.875rem" }}>
                    Pool your interest with other buyers — we&rsquo;ll approach the developer once enough people are on board. No commitment required at this stage.
                  </div>

                  <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--qp-muted)", marginBottom: "0.625rem" }}>
                    Open group for this listing
                  </div>

                  {existingGroups.map(g => {
                    const inGroup = myGroupIds.has(g.id);
                    return (
                      <div key={g.id} style={{ background: "var(--qp-surface)", border: "1px solid var(--qp-border)", borderRadius: 12, padding: "0.875rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.625rem" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--qp-ink)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                            </svg>
                            <span style={{ fontFamily: "var(--font-heebo, monospace)", fontWeight: 600, fontSize: "0.9375rem", color: "var(--qp-ink)" }}>
                              {g.memberCount} {g.memberCount === 1 ? "buyer" : "buyers"} interested
                            </span>
                          </div>
                          <div style={{ fontSize: "0.8125rem", color: "var(--qp-muted)", marginTop: "0.25rem" }}>
                            Started {new Date(g.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                          </div>
                        </div>
                        {inGroup ? (
                          <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--qp-ink)", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                            Joined ✓
                          </span>
                        ) : (
                          <button
                            onClick={() => join(g.id)}
                            style={{ padding: "0.5rem 1.125rem", borderRadius: 999, background: "var(--qp-ink)", color: "var(--qp-on-primary)", border: "none", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 4px 12px -4px rgba(18,51,50,0.4)" }}
                          >
                            Join group
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* No group yet — show "start one" */
                <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                  <div style={{ background: "var(--qp-soft)", borderRadius: 10, padding: "0.875rem 1rem", fontSize: "0.875rem", color: "var(--qp-muted)", lineHeight: 1.6 }}>
                    No group exists yet for this listing. Be the first to signal interest — we&rsquo;ll reach out to the developer once enough buyers are on board.
                  </div>
                  {error && <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--qp-error)" }}>{error}</p>}
                  <button
                    onClick={create}
                    disabled={submitting}
                    style={{ padding: "0.6875rem 1.5rem", borderRadius: 999, background: submitting ? "rgba(31,75,74,0.55)" : "var(--qp-ink)", color: "var(--qp-on-primary)", border: "none", fontSize: "0.875rem", fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer", boxShadow: submitting ? "none" : "0 8px 20px -8px rgba(18,51,50,0.5)", alignSelf: "flex-start" }}
                  >
                    {submitting ? m.results.registering : m.results.signalInterest}
                  </button>
                </div>
              )}

              {/* Shared error for join actions */}
              {error && existingGroups.length > 0 && (
                <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--qp-error)" }}>{error}</p>
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
      <div style={{ display: "flex", flexWrap: "wrap", gap: "1.25rem", marginBottom: "0.625rem", fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--qp-muted)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--qp-ink)", display: "inline-block" }} />{m.results.sellerRange}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--qp-accent-text)", display: "inline-block" }} />{m.results.yourRange}
        </span>
        {valid && (
          <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--qp-ink)", display: "inline-block" }} />{m.results.overlap}
          </span>
        )}
        {showElasticity && (
          <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <span style={{ width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: "6px solid var(--qp-ink)", display: "inline-block" }} />{m.results.suggestedMarker}
          </span>
        )}
      </div>

      <div style={{ position: "relative" }}>
        <div style={{ position: "relative", height: "1.5rem", background: "var(--qp-soft)", borderRadius: 7, overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, bottom: 0, left: pct(eil), width: `${ail - eil}%`, background: "var(--qp-ink)", opacity: 0.35 }} />
          <div style={{ position: "absolute", top: 0, bottom: 0, left: pct(aj), width: `${ej - aj}%`, background: "var(--qp-accent-text)", opacity: 0.4 }} />
          {valid && <div style={{ position: "absolute", top: 0, bottom: 0, left: pct(lowerBound), width: `${upperBound - lowerBound}%`, background: "var(--qp-ink)", opacity: 0.75 }} />}
          {valid && <div style={{ position: "absolute", top: 0, bottom: 0, left: pct(pfij), width: 2, background: "var(--qp-on-primary)", transform: "translateX(-1px)" }} />}
        </div>
        {showElasticity && (
          <div
            title={`${m.results.suggestedMarker}: ${elasticity!.suggestedScore}`}
            style={{ position: "absolute", top: "1.5rem", left: pct(elasticity!.suggestedScore), transform: "translateX(-50%)", marginTop: 3, width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "7px solid var(--qp-ink)" }}
          />
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: showElasticity ? "0.8rem" : "0.3rem", fontSize: "0.625rem", color: "var(--qp-muted)", fontFamily: "var(--font-heebo, monospace)" }}>
        <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
      </div>

      <div style={{ marginTop: "0.625rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", fontSize: "0.75rem", color: "var(--qp-muted)", fontFamily: "var(--font-heebo, monospace)" }}>
        <span>{m.results.sellerMin}: {eil}</span><span>{m.results.sellerTarget}: {ail}</span>
        <span style={{ color: "var(--qp-accent-text)" }}>{m.results.yourFloor}: {aj}</span>
        <span style={{ color: "var(--qp-accent-text)" }}>{m.results.yourIdeal}: {ej}</span>
        {valid && <span style={{ color: "var(--qp-ink)", fontWeight: 600 }}>{m.results.matchScore}: {pfij}</span>}
        {showElasticity && <span style={{ color: "var(--qp-ink)", fontWeight: 600 }}>↓ {m.results.suggested}: {elasticity!.suggestedScore}</span>}
      </div>

      {showElasticity && (
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.75rem", color: "var(--qp-muted)", fontStyle: "italic", lineHeight: 1.5 }}>
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
}: {
  outcome: MatchOutcome;
  detail: AomDetail;
  token: string;
  onOfferSent: () => void;
  ownerType: string;
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
      <div style={{ marginTop: "1.25rem", padding: "1rem 1.125rem", background: "var(--qp-soft)", borderRadius: 12, border: "1px solid var(--qp-border)", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--qp-ink)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <div>
          <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--qp-ink)" }}>
            {m.results.offerSent} — <Money amount={Number(offeredPrice)} />
            <EstimatedPriceNote />
          </div>
          {terms && <div style={{ fontSize: "0.8125rem", color: "var(--qp-muted)", marginTop: "0.125rem" }}>&ldquo;{terms}&rdquo;</div>}
        </div>
      </div>
    );
  }

  if (phase === "idle") {
    return (
      <div style={{ marginTop: "1.5rem" }}>
        <button
          onClick={() => setPhase("open")}
          style={{ padding: "0.625rem 1.5rem", borderRadius: 999, background: "var(--qp-ink)", color: "var(--qp-on-primary)", border: "none", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", boxShadow: "0 8px 20px -8px rgba(18,51,50,0.5)", letterSpacing: "0.01em" }}
        >
          {isDeveloperUnit ? m.results.reserve : m.results.sendOffer}
        </button>
      </div>
    );
  }

  // Developer unit: simplified confirmation panel — no price input or terms
  if (isDeveloperUnit) {
    return (
      <div style={{ marginTop: "1.25rem", background: "var(--qp-soft)", borderRadius: 14, border: "1px solid rgba(18,63,64,0.08)", overflow: "hidden" }}>
        <div style={{ padding: "0.875rem 1.25rem", borderBottom: "1px solid rgba(18,63,64,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--qp-surface)" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--qp-ink)" }}>{m.results.reserve}</span>
          <button onClick={() => { setPhase("idle"); setErrMsg(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--qp-muted)", fontSize: "1rem", lineHeight: 1, padding: "0.125rem" }} aria-label={m.nav.closeMenu}>✕</button>
        </div>
        <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ background: "var(--qp-surface)", borderRadius: 10, border: "1px solid var(--qp-border)", padding: "0.875rem 1rem" }}>
            <div style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--qp-muted)", marginBottom: "0.25rem" }}>
              {m.results.reservingAt}
            </div>
            <div style={{ fontFamily: "var(--font-heebo, monospace)", fontSize: "1.25rem", fontWeight: 600, color: "var(--qp-ink)" }}>
              {detail.priceFrom ? `${m.results.from} ` : ""}
              <Money amount={detail.price} />
            </div>
            <EstimatedPriceNote />
            <div style={{ fontSize: "0.8125rem", color: "var(--qp-muted)", marginTop: "0.25rem" }}>
              {m.results.fixed}
            </div>
          </div>
          {errMsg && <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--qp-error)", fontWeight: 500 }}>{errMsg}</p>}
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <button
              onClick={submit} disabled={phase === "submitting"}
              style={{ padding: "0.625rem 1.5rem", borderRadius: 999, background: phase === "submitting" ? "rgba(31,75,74,0.55)" : "var(--qp-ink)", color: "var(--qp-on-primary)", border: "none", fontSize: "0.875rem", fontWeight: 600, cursor: phase === "submitting" ? "not-allowed" : "pointer", boxShadow: phase === "submitting" ? "none" : "0 8px 20px -8px rgba(18,51,50,0.5)" }}
            >
              {phase === "submitting" ? m.results.reserving : m.results.confirm}
            </button>
            <button onClick={() => { setPhase("idle"); setErrMsg(""); }} style={{ background: "none", border: "none", fontSize: "0.8125rem", color: "var(--qp-muted)", cursor: "pointer", padding: "0.25rem", fontWeight: 500 }}>
              {m.results.cancel}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Seller unit: standard offer form
  return (
    <div style={{ marginTop: "1.25rem", background: "var(--qp-soft)", borderRadius: 14, border: "1px solid rgba(18,63,64,0.08)", overflow: "hidden" }}>
      <div style={{ padding: "0.875rem 1.25rem", borderBottom: "1px solid rgba(18,63,64,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--qp-surface)" }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--qp-ink)" }}>{m.results.makeOffer}</span>
        <button onClick={() => { setPhase("idle"); setErrMsg(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--qp-muted)", fontSize: "1rem", lineHeight: 1, padding: "0.125rem" }} aria-label={m.nav.closeMenu}>✕</button>
      </div>

      <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          <label style={{ display: "block", fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--qp-muted)", marginBottom: "0.5rem" }}>
            {m.results.yourPrice}
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", insetInlineStart: "0.875rem", top: "50%", transform: "translateY(-50%)", fontSize: "1rem", fontWeight: 600, color: "var(--qp-muted)", pointerEvents: "none" }}>₪</span>
              <input
                type="number" min={1} step={1000} value={offeredPrice}
                onChange={e => setOfferedPrice(e.target.value)}
                style={{ background: "var(--qp-surface)", border: "1.5px solid var(--qp-border)", borderRadius: 10, padding: "0.625rem 0.875rem 0.625rem 2rem", fontSize: "1.125rem", fontWeight: 600, fontFamily: "var(--font-heebo, monospace)", outline: "none", width: "12rem", boxSizing: "border-box" }}
                onFocus={e => { e.target.style.borderColor = "var(--qp-ink)"; e.target.style.boxShadow = "0 0 0 3px rgba(31,75,74,0.12)"; }}
                onBlur={e => { e.target.style.borderColor = "var(--qp-border)"; e.target.style.boxShadow = "none"; }}
              />
            </div>
            {detail.price > 0 && <span style={{ fontSize: "0.8125rem", color: "var(--qp-muted)" }}>{m.results.listedAt} <Money amount={detail.price} /></span>}
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#55534C", marginBottom: "0.5rem" }}>
            Terms <span style={{ fontWeight: 400, color: "#526563" }}>(optional)</span>
          </label>
          <textarea
            rows={2} value={terms} onChange={e => setTerms(e.target.value)}
            placeholder="e.g. Cash purchase, 30-day settlement, no conditions"
            style={{ width: "100%", background: "#fff", border: "1.5px solid #E0DDD7", borderRadius: 10, padding: "0.625rem 0.875rem", fontSize: "0.9375rem", outline: "none", resize: "none", fontFamily: "inherit", boxSizing: "border-box" }}
            onFocus={e => { e.target.style.borderColor = "#123F40"; e.target.style.boxShadow = "0 0 0 3px rgba(31,75,74,0.12)"; }}
            onBlur={e => { e.target.style.borderColor = "#E0DDD7"; e.target.style.boxShadow = "none"; }}
          />
        </div>

        {errMsg && <p style={{ margin: 0, fontSize: "0.8125rem", color: "#9E3434", fontWeight: 500 }}>{errMsg}</p>}

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <button
            onClick={submit} disabled={phase === "submitting"}
            style={{ padding: "0.625rem 1.5rem", borderRadius: 999, background: phase === "submitting" ? "rgba(31,75,74,0.55)" : "linear-gradient(155deg, #0C3031, #123332)", color: "#fff", border: "none", fontSize: "0.875rem", fontWeight: 600, cursor: phase === "submitting" ? "not-allowed" : "pointer", boxShadow: phase === "submitting" ? "none" : "0 1px 0 rgba(255,255,255,0.15) inset, 0 8px 20px -8px rgba(18,51,50,0.5)" }}
          >
            {phase === "submitting" ? m.results.sending : m.results.submitOffer}
          </button>
          <button onClick={() => { setPhase("idle"); setErrMsg(""); }} style={{ background: "none", border: "none", fontSize: "0.8125rem", color: "#526563", cursor: "pointer", padding: "0.25rem", fontWeight: 500 }}>
            {m.results.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Match card ────────────────────────────────────────────────────────────────

function MatchCard({
  outcome,
  detail,
  rank,
  ej,
  aj,
  token,
  onOfferSent,
  onOpenLeverage,
}: {
  outcome: MatchOutcome;
  detail: AomDetail | undefined;
  rank: number;
  ej: number;
  aj: number;
  token: string;
  onOfferSent: () => void;
  onOpenLeverage: (o: MatchOutcome) => void;
}) {
  const { m } = useI18n();
  const attrs = parseAttributes(detail?.attributes);
  const eil = detail?.eil ?? outcome.lowerBound;
  const ail = detail?.ail ?? outcome.upperBound;
  const elasticity = computeElasticity(
    { ej, aj },
    { eil, ail },
    { lowerBound: outcome.lowerBound, upperBound: outcome.upperBound }
  );

  return (
    <div style={{ background: "#FFFFFF", borderRadius: 20, overflow: "hidden", border: "1px solid rgba(18,63,64,0.08)", boxShadow: outcome.valid ? "0 2px 4px rgba(18,63,64,0.04), 0 24px 48px -20px rgba(18,51,50,0.14)" : "0 1px 3px rgba(18,63,64,0.04)", opacity: outcome.valid ? 1 : 0.6 }}>
      <div style={{ height: 4, background: outcome.valid ? "linear-gradient(90deg, #0C3031, #123332)" : "#E0DDD7" }} />
      <div style={{ padding: "1.75rem" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
          <div>
            <div style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: outcome.valid ? "#123F40" : "#526563", marginBottom: "0.375rem" }}>
              {outcome.valid ? `${m.results.matchN} #${rank}` : m.results.notFeasible}
            </div>
            <h2 style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1.375rem", fontWeight: 500, color: "#123F40", margin: 0, lineHeight: 1.2, letterSpacing: "0" }}>
              {outcome.title}
            </h2>
            {detail?.description && <p style={{ margin: "0.375rem 0 0", fontSize: "0.9375rem", color: "#526563", lineHeight: 1.5 }}>{detail.description}</p>}
            {detail && detail.price > 0 && (
              <p style={{ margin: "0.5rem 0 0", fontFamily: "var(--font-jetbrains, monospace)", fontSize: "0.9375rem", fontWeight: 600, color: "#123F40" }}>
                {detail.priceFrom ? `${m.results.from} ` : ""}
                <Money amount={detail.price} />
              </p>
            )}
          </div>

          <div style={{ flexShrink: 0, textAlign: "right" }}>
            {outcome.valid ? (
              <div style={{ background: "linear-gradient(155deg, #EEF4F3, #E1EBE9)", borderRadius: 12, padding: "0.625rem 1rem", fontFamily: "var(--font-jetbrains, monospace)" }}>
                <div style={{ fontSize: "0.625rem", color: "#123F40", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>{m.results.surplus}</div>
                <div style={{ fontSize: "1.375rem", fontWeight: 600, color: "#123332", lineHeight: 1.1 }}>{outcome.zij.toFixed(1)}</div>
              </div>
            ) : (
              <div style={{ background: "#FBECEA", borderRadius: 12, padding: "0.625rem 1rem" }}>
                <div style={{ fontSize: "0.75rem", color: "#9E3434", fontWeight: 600 }}>{m.results.notFeasible}</div>
                <div style={{ fontSize: "0.6875rem", color: "#9E3434", marginTop: "0.125rem", opacity: 0.75 }}>{m.results.noOverlapRanges}</div>
              </div>
            )}
          </div>
        </div>

        {Object.keys(attrs).length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginTop: "1rem" }}>
            {Object.entries(attrs).map(([k, v]) => {
              const text = formatAttributeValue(v);
              if (!text) return null;
              return (
                <span key={k} style={{ fontSize: "0.75rem", background: "#E9EEEA", color: "#123F40", borderRadius: 8, padding: "0.2rem 0.625rem", border: "1px solid #D4DED8", fontWeight: 500 }}>
                  {k}: {text}
                </span>
              );
            })}
          </div>
        )}

        <AlignmentBar outcome={outcome} ej={ej} aj={aj} aom={{ eil, ail }} elasticity={elasticity} />

        <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <Link href={`/aom/${outcome.aomId}`} style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#123F40", textDecoration: "none" }}>
            {m.results.viewDetails} →
          </Link>
          {outcome.valid && (
            <button
              onClick={() => onOpenLeverage(outcome)}
              style={{ background: "none", border: "1px solid #756039", borderRadius: 999, padding: "0.3rem 0.875rem", fontSize: "0.8125rem", fontWeight: 600, color: "#756039", cursor: "pointer" }}
            >
              {m.results.groupDiscount}
            </button>
          )}
        </div>

        {outcome.valid && detail && (
          <SendOfferPanel outcome={outcome} detail={detail} token={token} onOfferSent={onOfferSent} ownerType={detail?.ownerType ?? "developer"} />
        )}
      </div>
    </div>
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
  const [data, setData] = useState<StoredResults | null>(null);
  const [token, setToken] = useState("");
  const [missing, setMissing] = useState(false);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [toast, setToast] = useState(false);
  const [leverageTarget, setLeverageTarget] = useState<MatchOutcome | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);

  const dismissToast = useCallback(() => setToast(false), []);

  useEffect(() => {
    const t = localStorage.getItem("token") ?? "";
    setToken(t);
    const raw = sessionStorage.getItem("matchResults");
    if (!raw) { setMissing(true); return; }
    try { setData(JSON.parse(raw)); } catch { setMissing(true); }

    if (t) {
      // Fetch recommendations
      fetch("/api/recommendations", { headers: { Authorization: `Bearer ${t}` } })
        .then(r => r.json())
        .then(d => { if (d.recommendations) setRecommendations(d.recommendations); })
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
      <main style={{ minHeight: "100vh", background: "#F4F5F0", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-inter, sans-serif)" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "#526563", marginBottom: "1rem", fontSize: "0.9375rem" }}>{m.results.noSession}</p>
          <Link href="/processing" style={{ color: "#123F40", fontWeight: 600, textDecoration: "none" }}>{m.results.runMatching} →</Link>
        </div>
      </main>
    );
  }

  if (!data) return null;

  const { ranked, characterization: char, aomDetails } = data;
  const { expected_score_ej: ej, min_acceptance_score_aj: aj } = char;
  const prefs = char.buyer_preferences;
  const validMatches = ranked.filter((r) => r.valid);
  let validRank = 0;

  return (
    <div style={{ minHeight: "100vh", background: "#F4F5F0", fontFamily: "var(--font-inter, ui-sans-serif, sans-serif)" }}>
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

      {/* Page intro */}
      <div style={{ position: "relative", zIndex: 1, maxWidth: "75rem", margin: "0 auto", padding: "3rem 1.5rem 0" }}>
        <div style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "0.75rem", fontWeight: 500, letterSpacing: "0.08em", color: "#123F40", marginBottom: "0.625rem" }}>
          {m.results.kicker}
        </div>
        <h1 style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "2.25rem", fontWeight: 500, color: "#123F40", margin: "0 0 0.5rem", lineHeight: 1.15, letterSpacing: "0" }}>
          {m.results.title}
        </h1>
        <p style={{ margin: 0, color: "#526563", fontSize: "1rem", lineHeight: 1.5 }}>
          {m.results.summary.replace("{valid}", String(validMatches.length)).replace("{total}", String(ranked.length))}
        </p>
      </div>

      {/* Content */}
      <main style={{ position: "relative", zIndex: 1, maxWidth: "75rem", margin: "0 auto", padding: "1.75rem 1.5rem 5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>

        {/* Buyer profile card */}
        <div style={{ background: "#fff", borderRadius: 20, border: "1px solid rgba(18,63,64,0.08)", boxShadow: "0 2px 4px rgba(18,63,64,0.03), 0 16px 36px -16px rgba(18,51,50,0.10)", overflow: "hidden" }}>
          <div style={{ height: 4, background: "linear-gradient(90deg, #756039, #756039)" }} />
          <div style={{ padding: "1.75rem" }}>
            <div style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#526563", marginBottom: "1.25rem" }}>{m.results.yourProfile}</div>
            <div className="hn-results-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem 2.5rem" }}>
              {[[m.results.type, prefs.property_type], [m.results.location, prefs.location], [m.results.bedrooms, prefs.bedrooms != null ? `${prefs.bedrooms}+` : "—"], [m.results.timeline, prefs.timeline]].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: "0.6875rem", color: "#526563", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>{label}</div>
                  <div style={{ fontSize: "0.9375rem", color: "#123F40", fontWeight: 500 }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "1.25rem", paddingTop: "1.25rem", borderTop: "1px solid rgba(18,63,64,0.06)", display: "flex", gap: "2rem", fontFamily: "var(--font-jetbrains, monospace)", fontSize: "0.8125rem" }}>
              <div><span style={{ color: "#526563" }}>{m.results.yourIdeal} </span><span style={{ color: "#123F40", fontWeight: 600 }}>{ej}</span></div>
              <div><span style={{ color: "#526563" }}>{m.results.yourFloor} </span><span style={{ color: "#756039", fontWeight: 600 }}>{aj}</span></div>
            </div>
            {char.behavioral_insights && (
              <div style={{ marginTop: "1.25rem", paddingTop: "1.25rem", borderTop: "1px solid rgba(18,63,64,0.06)" }}>
                <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#526563", marginBottom: "0.4rem" }}>{m.results.insights}</div>
                <p style={{ fontSize: "0.9375rem", color: "#123F40", margin: 0, lineHeight: 1.65 }}>{char.behavioral_insights}</p>
              </div>
            )}

            {/* Retake interview section */}
            <div style={{ marginTop: "1.25rem", paddingTop: "1.25rem", borderTop: "1px solid rgba(18,63,64,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.875rem" }}>
              <div>
                <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#526563", marginBottom: "0.25rem" }}>
                  {m.results.quota}
                </div>
                {rateLimit ? (
                  <div style={{ fontSize: "0.875rem", color: "#526563" }}>
                    <span style={{ color: rateLimit.remaining === 0 ? "#9E3434" : "#123F40", fontWeight: 600 }}>
                      {rateLimit.attempts} / {MAX_INTERVIEWS_PER_DAY}
                    </span>{" "}
                    {m.results.usedToday}
                    {rateLimit.remaining === 0 && rateLimit.nextAvailableAt && (
                      <span style={{ color: "#526563" }}>
                        {" "}— {m.results.resetsIn}{" "}
                        <span style={{ color: "#756039", fontWeight: 600 }}>
                          {formatWait(rateLimit.nextAvailableAt, m.results.soon)}
                        </span>
                      </span>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: "0.875rem", color: "#526563" }}>{m.common.loading}</div>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.375rem" }}>
                <button
                  disabled={!rateLimit || rateLimit.remaining === 0}
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      sessionStorage.setItem("requestedRetake", "true");
                    }
                    router.push("/interview");
                  }}
                  style={{
                    padding: "0.5rem 1.125rem",
                    borderRadius: 999,
                    border: "1px solid",
                    borderColor: !rateLimit || rateLimit.remaining === 0 ? "#E0DDD7" : "#123F40",
                    background: !rateLimit || rateLimit.remaining === 0 ? "transparent" : "linear-gradient(155deg, #0C3031, #123332)",
                    color: !rateLimit || rateLimit.remaining === 0 ? "#C0BAB2" : "#fff",
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
                  <div style={{ fontSize: "0.6875rem", color: "#526563", textAlign: "end" }}>
                    {rateLimit.remaining} {m.results.retakesLeft}
                  </div>
                )}
                {rateLimit && rateLimit.remaining === 0 && rateLimit.nextAvailableAt && (
                  <div style={{ fontSize: "0.6875rem", color: "#9E3434", textAlign: "end" }}>
                    {m.results.tryAgainIn} {formatWait(rateLimit.nextAvailableAt, m.results.soon)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Match cards */}
        {ranked.map((outcome) => {
          if (outcome.valid) validRank++;
          const detail = aomDetails[outcome.aomId];
          return (
            <MatchCard
              key={outcome.aomId}
              outcome={outcome}
              detail={detail}
              rank={validRank}
              ej={ej}
              aj={aj}
              token={token}
              onOfferSent={() => { setToast(true); }}
              onOpenLeverage={setLeverageTarget}
            />
          );
        })}

        {/* Recommendations */}
        {validMatches.length > 0 && recommendations.length > 0 && (
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid rgba(18,63,64,0.08)", boxShadow: "0 1px 3px rgba(18,63,64,0.04)", padding: "1.75rem" }}>
            <div style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#526563", marginBottom: "1.25rem" }}>
              {m.results.nextSteps}
            </div>
            <div className="hn-results-recs" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(19rem, 1fr))", gap: "0.875rem" }}>
              {recommendations.map(r => (
                <div key={r.id} style={{ background: "#F5F3EE", borderRadius: 14, border: "1px solid rgba(18,63,64,0.07)", padding: "1.125rem 1.25rem", display: "flex", gap: "0.875rem", alignItems: "flex-start" }}>
                  <span style={{ fontSize: "1.375rem", lineHeight: 1, flexShrink: 0, marginTop: "0.1rem" }}>{r.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.9375rem", color: "#123F40", marginBottom: "0.3rem" }}>{r.label}</div>
                    <p style={{ margin: 0, fontSize: "0.875rem", color: "#526563", lineHeight: 1.6 }}>{r.blurb}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Leverage groups CTA */}
        {validMatches.length > 0 && (
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid rgba(18,63,64,0.08)", boxShadow: "0 1px 3px rgba(18,63,64,0.04)", overflow: "hidden" }}>
            <div style={{ height: 4, background: "linear-gradient(90deg, #756039, #756039)" }} />
            <div style={{ padding: "1.5rem 1.75rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1.25rem", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 600, color: "#123F40", fontSize: "1rem", marginBottom: "0.3rem", letterSpacing: "0" }}>{m.results.groupCtaTitle}</div>
                <p style={{ margin: 0, fontSize: "0.9375rem", color: "#526563", lineHeight: 1.5 }}>
                  {m.results.groupCtaBody}
                </p>
              </div>
              <Link
                href="/buyer/leverage-groups"
                style={{ padding: "0.6875rem 1.375rem", borderRadius: 999, background: "linear-gradient(155deg, #0C3031, #123332)", color: "#fff", fontSize: "0.875rem", fontWeight: 600, textDecoration: "none", flexShrink: 0, boxShadow: "0 1px 0 rgba(255,255,255,0.15) inset, 0 8px 20px -8px rgba(18,51,50,0.5)", whiteSpace: "nowrap" }}
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
