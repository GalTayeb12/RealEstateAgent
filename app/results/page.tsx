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

// DEMO ONLY — set to false (or remove the block below) before production.
const DEMO_SHOW_PROFILE = true;

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { computeElasticity, ElasticityResult } from "@/lib/elasticity";

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
      background: "#14130F", color: "#FAF8F4", borderRadius: 14,
      padding: "0.875rem 1.25rem", boxShadow: "0 8px 30px rgba(0,0,0,0.3)",
      fontSize: "0.9375rem", fontWeight: 500, maxWidth: "90vw",
      animation: "slideUp 0.25s ease-out",
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4CAF87" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span>{message}</span>
      <Link href="/buyer/offers" style={{ color: "#C89B3C", fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap", marginLeft: "0.25rem" }}>
        Track it →
      </Link>
      <button onClick={onDismiss} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: "1rem", padding: "0 0.125rem", marginLeft: "0.25rem" }}>✕</button>
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
    ? "You've joined the group. We'll be in touch when enough buyers are interested to open negotiations with the developer."
    : "Your group request has been registered. Others can join, and we'll reach out when there's enough interest to move forward.";

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(20,19,15,0.55)", zIndex: 1000, backdropFilter: "blur(3px)" }}
      />
      {/* Panel */}
      <div style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 1001, width: "min(92vw, 30rem)",
        background: "#FAFAF7", borderRadius: 20,
        border: "1px solid rgba(28,27,25,0.1)",
        boxShadow: "0 24px 64px -20px rgba(0,0,0,0.4)",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid rgba(28,27,25,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#1F4B4A", marginBottom: "0.2rem" }}>
              Group buying interest
            </div>
            <div style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1rem", fontWeight: 700, color: "#14130F" }}>
              {outcome.title}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9A958F", fontSize: "1.25rem", lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>

          {/* Loading */}
          {loading && (
            <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
              <div style={{ width: "1.5rem", height: "1.5rem", borderRadius: "50%", border: "2px solid rgba(28,27,25,0.08)", borderTopColor: "#1F4B4A", animation: "spin 0.9s linear infinite", margin: "0 auto" }} />
            </div>
          )}

          {/* Success confirmation */}
          {success && (
            <div style={{ background: "#E8F0EF", borderRadius: 10, padding: "1rem 1.125rem", display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1F4B4A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <div>
                <div style={{ fontWeight: 700, color: "#1F4B4A", fontSize: "0.9375rem", marginBottom: "0.3rem" }}>
                  {success === "join" ? "You're in." : "Group request registered."}
                </div>
                <div style={{ fontSize: "0.875rem", color: "#3A6B6A", lineHeight: 1.55 }}>{successMsg}</div>
              </div>
            </div>
          )}

          {/* Groups list + actions */}
          {!loading && !success && (
            <>
              {existingGroups.length > 0 ? (
                <div>
                  {/* How it works blurb */}
                  <div style={{ background: "#F5F3EE", borderRadius: 10, padding: "0.75rem 1rem", fontSize: "0.8125rem", color: "#6B6860", lineHeight: 1.55, marginBottom: "0.875rem" }}>
                    Pool your interest with other buyers — we&rsquo;ll approach the developer once enough people are on board. No commitment required at this stage.
                  </div>

                  <div style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#6B6860", marginBottom: "0.625rem" }}>
                    Open group for this listing
                  </div>

                  {existingGroups.map(g => {
                    const inGroup = myGroupIds.has(g.id);
                    return (
                      <div key={g.id} style={{ background: "#fff", border: "1px solid #E0DDD7", borderRadius: 12, padding: "0.875rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.625rem" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1F4B4A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                            </svg>
                            <span style={{ fontFamily: "var(--font-jetbrains, monospace)", fontWeight: 700, fontSize: "0.9375rem", color: "#1C1B19" }}>
                              {g.memberCount} {g.memberCount === 1 ? "buyer" : "buyers"} interested
                            </span>
                          </div>
                          <div style={{ fontSize: "0.8125rem", color: "#9A958F", marginTop: "0.25rem" }}>
                            Started {new Date(g.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                          </div>
                        </div>
                        {inGroup ? (
                          <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#1F4B4A", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                            Joined ✓
                          </span>
                        ) : (
                          <button
                            onClick={() => join(g.id)}
                            style={{ padding: "0.5rem 1.125rem", borderRadius: 999, background: "linear-gradient(155deg, #2F6664, #123332)", color: "#fff", border: "none", fontSize: "0.875rem", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 4px 12px -4px rgba(18,51,50,0.4)" }}
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
                  <div style={{ background: "#F5F3EE", borderRadius: 10, padding: "0.875rem 1rem", fontSize: "0.875rem", color: "#6B6860", lineHeight: 1.6 }}>
                    No group exists yet for this listing. Be the first to signal interest — we&rsquo;ll reach out to the developer once enough buyers are on board.
                  </div>
                  {error && <p style={{ margin: 0, fontSize: "0.8125rem", color: "#B04040" }}>{error}</p>}
                  <button
                    onClick={create}
                    disabled={submitting}
                    style={{ padding: "0.6875rem 1.5rem", borderRadius: 999, background: submitting ? "rgba(31,75,74,0.55)" : "linear-gradient(155deg, #2F6664, #123332)", color: "#fff", border: "none", fontSize: "0.875rem", fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer", boxShadow: submitting ? "none" : "0 1px 0 rgba(255,255,255,0.15) inset, 0 8px 20px -8px rgba(18,51,50,0.5)", alignSelf: "flex-start" }}
                  >
                    {submitting ? "Registering interest…" : "Signal interest"}
                  </button>
                </div>
              )}

              {/* Shared error for join actions */}
              {error && existingGroups.length > 0 && (
                <p style={{ margin: 0, fontSize: "0.8125rem", color: "#B04040" }}>{error}</p>
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
  const pct = (v: number) => `${Math.max(0, Math.min(100, v))}%`;
  const { eil, ail } = aom;
  const { lowerBound, upperBound, pfij, valid } = outcome;
  const showElasticity = valid && elasticity !== null;

  return (
    <div style={{ marginTop: "1.25rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "1.25rem", marginBottom: "0.625rem", fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#6B6860" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "#1F4B4A", display: "inline-block" }} />Seller range
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "#C89B3C", display: "inline-block" }} />Your range
        </span>
        {valid && (
          <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: "#0E3332", display: "inline-block" }} />Feasible overlap
          </span>
        )}
        {showElasticity && (
          <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <span style={{ width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: "6px solid #1C1B19", display: "inline-block" }} />Suggested price
          </span>
        )}
      </div>

      <div style={{ position: "relative" }}>
        <div style={{ position: "relative", height: "1.5rem", background: "#EFEDE6", borderRadius: 7, overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, bottom: 0, left: pct(eil), width: `${ail - eil}%`, background: "#1F4B4A", opacity: 0.35 }} />
          <div style={{ position: "absolute", top: 0, bottom: 0, left: pct(aj), width: `${ej - aj}%`, background: "#C89B3C", opacity: 0.4 }} />
          {valid && <div style={{ position: "absolute", top: 0, bottom: 0, left: pct(lowerBound), width: `${upperBound - lowerBound}%`, background: "#0E3332", opacity: 0.75 }} />}
          {valid && <div style={{ position: "absolute", top: 0, bottom: 0, left: pct(pfij), width: 2, background: "#fff", transform: "translateX(-1px)" }} />}
        </div>
        {showElasticity && (
          <div
            title={`Suggested price: ${elasticity!.suggestedScore}`}
            style={{ position: "absolute", top: "1.5rem", left: pct(elasticity!.suggestedScore), transform: "translateX(-50%)", marginTop: 3, width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "7px solid #1C1B19" }}
          />
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: showElasticity ? "0.8rem" : "0.3rem", fontSize: "0.625rem", color: "#9A958F", fontFamily: "var(--font-jetbrains, monospace)" }}>
        <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
      </div>

      <div style={{ marginTop: "0.625rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", fontSize: "0.75rem", color: "#6B6860", fontFamily: "var(--font-jetbrains, monospace)" }}>
        <span>Seller min: {eil}</span><span>Seller target: {ail}</span>
        <span style={{ color: "#C89B3C" }}>Your floor: {aj}</span>
        <span style={{ color: "#C89B3C" }}>Your ideal: {ej}</span>
        {valid && <span style={{ color: "#1F4B4A", fontWeight: 700 }}>Match score: {pfij}</span>}
        {showElasticity && <span style={{ color: "#1C1B19", fontWeight: 700 }}>↓ Suggested: {elasticity!.suggestedScore}</span>}
      </div>

      {showElasticity && (
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.75rem", color: "#6B6860", fontStyle: "italic", lineHeight: 1.5 }}>
          {elasticity!.label}
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
          setErrMsg("Enter a valid offer price");
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
      <div style={{ marginTop: "1.25rem", padding: "1rem 1.125rem", background: "linear-gradient(135deg, #EEF4F3, #E4EEEC)", borderRadius: 12, border: "1px solid #B8D4D3", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1F4B4A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <div>
          <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "#1F4B4A" }}>
            Offer sent — £{Number(offeredPrice).toLocaleString()} pending review
          </div>
          {terms && <div style={{ fontSize: "0.8125rem", color: "#3A6B6A", marginTop: "0.125rem" }}>&ldquo;{terms}&rdquo;</div>}
        </div>
      </div>
    );
  }

  if (phase === "idle") {
    return (
      <div style={{ marginTop: "1.5rem" }}>
        <button
          onClick={() => setPhase("open")}
          style={{ padding: "0.625rem 1.5rem", borderRadius: 999, background: "linear-gradient(155deg, #2F6664, #123332)", color: "#fff", border: "none", fontSize: "0.875rem", fontWeight: 700, cursor: "pointer", boxShadow: "0 1px 0 rgba(255,255,255,0.15) inset, 0 8px 20px -8px rgba(18,51,50,0.5)", letterSpacing: "0.01em" }}
        >
          {isDeveloperUnit ? "Reserve at listed price" : "Send offer"}
        </button>
      </div>
    );
  }

  // Developer unit: simplified confirmation panel — no price input or terms
  if (isDeveloperUnit) {
    return (
      <div style={{ marginTop: "1.25rem", background: "#F5F3EE", borderRadius: 14, border: "1px solid rgba(28,27,25,0.08)", overflow: "hidden" }}>
        <div style={{ padding: "0.875rem 1.25rem", borderBottom: "1px solid rgba(28,27,25,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#1F4B4A" }}>Reserve at listed price</span>
          <button onClick={() => { setPhase("idle"); setErrMsg(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#9A958F", fontSize: "1rem", lineHeight: 1, padding: "0.125rem" }} aria-label="Close">✕</button>
        </div>
        <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #E0DDD7", padding: "0.875rem 1rem" }}>
            <div style={{ fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#9A958F", marginBottom: "0.25rem" }}>
              Reserving at listed price
            </div>
            <div style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "1.25rem", fontWeight: 700, color: "#1F4B4A" }}>
              £{detail.price.toLocaleString()}
            </div>
            <div style={{ fontSize: "0.8125rem", color: "#9A958F", marginTop: "0.25rem" }}>
              Fixed price — no negotiation. You will be taken to the Deal Room immediately.
            </div>
          </div>
          {errMsg && <p style={{ margin: 0, fontSize: "0.8125rem", color: "#B04040", fontWeight: 500 }}>{errMsg}</p>}
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <button
              onClick={submit} disabled={phase === "submitting"}
              style={{ padding: "0.625rem 1.5rem", borderRadius: 999, background: phase === "submitting" ? "rgba(31,75,74,0.55)" : "linear-gradient(155deg, #2F6664, #123332)", color: "#fff", border: "none", fontSize: "0.875rem", fontWeight: 700, cursor: phase === "submitting" ? "not-allowed" : "pointer", boxShadow: phase === "submitting" ? "none" : "0 1px 0 rgba(255,255,255,0.15) inset, 0 8px 20px -8px rgba(18,51,50,0.5)" }}
            >
              {phase === "submitting" ? "Reserving…" : "Confirm reservation"}
            </button>
            <button onClick={() => { setPhase("idle"); setErrMsg(""); }} style={{ background: "none", border: "none", fontSize: "0.8125rem", color: "#9A958F", cursor: "pointer", padding: "0.25rem", fontWeight: 500 }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Seller unit: standard offer form
  return (
    <div style={{ marginTop: "1.25rem", background: "#F5F3EE", borderRadius: 14, border: "1px solid rgba(28,27,25,0.08)", overflow: "hidden" }}>
      <div style={{ padding: "0.875rem 1.25rem", borderBottom: "1px solid rgba(28,27,25,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff" }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#1F4B4A" }}>Make an offer</span>
        <button onClick={() => { setPhase("idle"); setErrMsg(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#9A958F", fontSize: "1rem", lineHeight: 1, padding: "0.125rem" }} aria-label="Close">✕</button>
      </div>

      <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          <label style={{ display: "block", fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#55534C", marginBottom: "0.5rem" }}>
            Your offer price (£)
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: "0.875rem", top: "50%", transform: "translateY(-50%)", fontSize: "1rem", fontWeight: 700, color: "#6B6860", pointerEvents: "none" }}>£</span>
              <input
                type="number" min={1} step={1000} value={offeredPrice}
                onChange={e => setOfferedPrice(e.target.value)}
                style={{ background: "#fff", border: "1.5px solid #E0DDD7", borderRadius: 10, padding: "0.625rem 0.875rem 0.625rem 2rem", fontSize: "1.125rem", fontWeight: 700, fontFamily: "var(--font-jetbrains, monospace)", outline: "none", width: "12rem", boxSizing: "border-box" }}
                onFocus={e => { e.target.style.borderColor = "#1F4B4A"; e.target.style.boxShadow = "0 0 0 3px rgba(31,75,74,0.12)"; }}
                onBlur={e => { e.target.style.borderColor = "#E0DDD7"; e.target.style.boxShadow = "none"; }}
              />
            </div>
            {detail.price > 0 && <span style={{ fontSize: "0.8125rem", color: "#9A958F" }}>Listed at £{detail.price.toLocaleString()}</span>}
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#55534C", marginBottom: "0.5rem" }}>
            Terms <span style={{ fontWeight: 400, color: "#9A958F" }}>(optional)</span>
          </label>
          <textarea
            rows={2} value={terms} onChange={e => setTerms(e.target.value)}
            placeholder="e.g. Cash purchase, 30-day settlement, no conditions"
            style={{ width: "100%", background: "#fff", border: "1.5px solid #E0DDD7", borderRadius: 10, padding: "0.625rem 0.875rem", fontSize: "0.9375rem", outline: "none", resize: "none", fontFamily: "inherit", boxSizing: "border-box" }}
            onFocus={e => { e.target.style.borderColor = "#1F4B4A"; e.target.style.boxShadow = "0 0 0 3px rgba(31,75,74,0.12)"; }}
            onBlur={e => { e.target.style.borderColor = "#E0DDD7"; e.target.style.boxShadow = "none"; }}
          />
        </div>

        {errMsg && <p style={{ margin: 0, fontSize: "0.8125rem", color: "#B04040", fontWeight: 500 }}>{errMsg}</p>}

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <button
            onClick={submit} disabled={phase === "submitting"}
            style={{ padding: "0.625rem 1.5rem", borderRadius: 999, background: phase === "submitting" ? "rgba(31,75,74,0.55)" : "linear-gradient(155deg, #2F6664, #123332)", color: "#fff", border: "none", fontSize: "0.875rem", fontWeight: 700, cursor: phase === "submitting" ? "not-allowed" : "pointer", boxShadow: phase === "submitting" ? "none" : "0 1px 0 rgba(255,255,255,0.15) inset, 0 8px 20px -8px rgba(18,51,50,0.5)" }}
          >
            {phase === "submitting" ? "Sending…" : "Submit offer"}
          </button>
          <button onClick={() => { setPhase("idle"); setErrMsg(""); }} style={{ background: "none", border: "none", fontSize: "0.8125rem", color: "#9A958F", cursor: "pointer", padding: "0.25rem", fontWeight: 500 }}>
            Cancel
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
  const attrs = detail?.attributes ?? {};
  const eil = detail?.eil ?? outcome.lowerBound;
  const ail = detail?.ail ?? outcome.upperBound;
  const elasticity = computeElasticity(
    { ej, aj },
    { eil, ail },
    { lowerBound: outcome.lowerBound, upperBound: outcome.upperBound }
  );

  return (
    <div style={{ background: "#FFFFFF", borderRadius: 20, overflow: "hidden", border: "1px solid rgba(28,27,25,0.08)", boxShadow: outcome.valid ? "0 2px 4px rgba(28,27,25,0.04), 0 24px 48px -20px rgba(18,51,50,0.14)" : "0 1px 3px rgba(28,27,25,0.04)", opacity: outcome.valid ? 1 : 0.6 }}>
      <div style={{ height: 4, background: outcome.valid ? "linear-gradient(90deg, #2F6664, #123332)" : "#E0DDD7" }} />
      <div style={{ padding: "1.75rem" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
          <div>
            <div style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: outcome.valid ? "#1F4B4A" : "#9A958F", marginBottom: "0.375rem" }}>
              {outcome.valid ? `Match #${rank}` : "Not feasible"}
            </div>
            <h2 style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1.375rem", fontWeight: 800, color: "#14130F", margin: 0, lineHeight: 1.2, letterSpacing: "-0.01em" }}>
              {outcome.title}
            </h2>
            {detail?.description && <p style={{ margin: "0.375rem 0 0", fontSize: "0.9375rem", color: "#6B6860", lineHeight: 1.5 }}>{detail.description}</p>}
          </div>

          <div style={{ flexShrink: 0, textAlign: "right" }}>
            {outcome.valid ? (
              <div style={{ background: "linear-gradient(155deg, #EEF4F3, #E1EBE9)", borderRadius: 12, padding: "0.625rem 1rem", fontFamily: "var(--font-jetbrains, monospace)" }}>
                <div style={{ fontSize: "0.625rem", color: "#1F4B4A", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>Surplus</div>
                <div style={{ fontSize: "1.375rem", fontWeight: 700, color: "#123332", lineHeight: 1.1 }}>{outcome.zij.toFixed(1)}</div>
              </div>
            ) : (
              <div style={{ background: "#FAE8E8", borderRadius: 12, padding: "0.625rem 1rem" }}>
                <div style={{ fontSize: "0.75rem", color: "#B04040", fontWeight: 700 }}>Not feasible</div>
                <div style={{ fontSize: "0.6875rem", color: "#B04040", marginTop: "0.125rem", opacity: 0.75 }}>ranges don&apos;t overlap</div>
              </div>
            )}
          </div>
        </div>

        {Object.keys(attrs).length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginTop: "1rem" }}>
            {Object.entries(attrs).map(([k, v]) => (
              <span key={k} style={{ fontSize: "0.75rem", background: "#F5F3EE", color: "#55534C", borderRadius: 6, padding: "0.2rem 0.625rem", border: "1px solid rgba(28,27,25,0.08)", fontWeight: 500 }}>
                {k}: {String(v)}
              </span>
            ))}
          </div>
        )}

        <AlignmentBar outcome={outcome} ej={ej} aj={aj} aom={{ eil, ail }} elasticity={elasticity} />

        <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <Link href={`/aom/${outcome.aomId}`} style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#1F4B4A", textDecoration: "none" }}>
            View property details →
          </Link>
          {outcome.valid && (
            <button
              onClick={() => onOpenLeverage(outcome)}
              style={{ background: "none", border: "1px solid #C89B3C", borderRadius: 999, padding: "0.3rem 0.875rem", fontSize: "0.8125rem", fontWeight: 600, color: "#C89B3C", cursor: "pointer" }}
            >
              Group discount
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

function formatWait(nextAvailableAt: string): string {
  const diff = new Date(nextAvailableAt).getTime() - Date.now();
  if (diff <= 0) return "any moment";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.ceil((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export default function ResultsPage() {
  const router = useRouter();
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
      <main style={{ minHeight: "100vh", background: "#FAF8F4", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-inter, sans-serif)" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "#6B6860", marginBottom: "1rem", fontSize: "0.9375rem" }}>No results found in this session.</p>
          <Link href="/processing" style={{ color: "#1F4B4A", fontWeight: 700, textDecoration: "none" }}>Run matching →</Link>
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
    <div style={{ minHeight: "100vh", background: "#FAF8F4", fontFamily: "var(--font-inter, ui-sans-serif, sans-serif)" }}>
      <style>{`
        @media (max-width: 640px) {
          .hn-results-2col { grid-template-columns: 1fr !important; gap: 0.75rem !important; }
          .hn-results-recs  { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div style={{ position: "fixed", inset: 0, background: "radial-gradient(60% 40% at 85% 5%, rgba(47,102,100,0.07) 0%, transparent 55%), radial-gradient(40% 30% at 5% 85%, rgba(200,155,60,0.05) 0%, transparent 55%)", pointerEvents: "none", zIndex: 0 }} />

      {/* Toast */}
      {toast && <Toast message="Offer sent successfully!" onDismiss={dismissToast} />}

      {/* Leverage modal */}
      {leverageTarget && (
        <LeverageModal outcome={leverageTarget} token={token} onClose={() => setLeverageTarget(null)} />
      )}

      {/* Page intro */}
      <div style={{ position: "relative", zIndex: 1, maxWidth: "56rem", margin: "0 auto", padding: "3rem 1.5rem 0" }}>
        <div style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "0.75rem", fontWeight: 500, letterSpacing: "0.08em", color: "#1F4B4A", marginBottom: "0.625rem" }}>
          MATCH RESULTS
        </div>
        <h1 style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "2.25rem", fontWeight: 800, color: "#14130F", margin: "0 0 0.5rem", lineHeight: 1.15, letterSpacing: "-0.02em" }}>
          Your matches
        </h1>
        <p style={{ margin: 0, color: "#6B6860", fontSize: "1rem", lineHeight: 1.5 }}>
          {validMatches.length} of {ranked.length} listings are a feasible match for your profile.
        </p>
      </div>

      {/* Content */}
      <main style={{ position: "relative", zIndex: 1, maxWidth: "56rem", margin: "0 auto", padding: "1.75rem 1.5rem 5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>

        {/* Buyer profile card */}
        <div style={{ background: "#fff", borderRadius: 20, border: "1px solid rgba(28,27,25,0.08)", boxShadow: "0 2px 4px rgba(28,27,25,0.03), 0 16px 36px -16px rgba(18,51,50,0.10)", overflow: "hidden" }}>
          <div style={{ height: 4, background: "linear-gradient(90deg, #C89B3C, #B8892C)" }} />
          <div style={{ padding: "1.75rem" }}>
            <div style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6B6860", marginBottom: "1.25rem" }}>Your profile</div>
            <div className="hn-results-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem 2.5rem" }}>
              {[["Type", prefs.property_type], ["Location", prefs.location], ["Bedrooms", prefs.bedrooms != null ? `${prefs.bedrooms}+` : "—"], ["Timeline", prefs.timeline]].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: "0.6875rem", color: "#9A958F", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>{label}</div>
                  <div style={{ fontSize: "0.9375rem", color: "#1C1B19", fontWeight: 500 }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "1.25rem", paddingTop: "1.25rem", borderTop: "1px solid rgba(28,27,25,0.06)", display: "flex", gap: "2rem", fontFamily: "var(--font-jetbrains, monospace)", fontSize: "0.8125rem" }}>
              <div><span style={{ color: "#9A958F" }}>Your ideal </span><span style={{ color: "#1F4B4A", fontWeight: 700 }}>{ej}</span></div>
              <div><span style={{ color: "#9A958F" }}>Your floor </span><span style={{ color: "#C89B3C", fontWeight: 700 }}>{aj}</span></div>
            </div>
            {char.behavioral_insights && (
              <div style={{ marginTop: "1.25rem", paddingTop: "1.25rem", borderTop: "1px solid rgba(28,27,25,0.06)" }}>
                <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9A958F", marginBottom: "0.4rem" }}>Insights</div>
                <p style={{ fontSize: "0.9375rem", color: "#1C1B19", margin: 0, lineHeight: 1.65 }}>{char.behavioral_insights}</p>
              </div>
            )}

            {/* Retake interview section */}
            <div style={{ marginTop: "1.25rem", paddingTop: "1.25rem", borderTop: "1px solid rgba(28,27,25,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.875rem" }}>
              <div>
                <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9A958F", marginBottom: "0.25rem" }}>
                  Interview quota
                </div>
                {rateLimit ? (
                  <div style={{ fontSize: "0.875rem", color: "#6B6860" }}>
                    <span style={{ color: rateLimit.remaining === 0 ? "#B04040" : "#1C1B19", fontWeight: 600 }}>
                      {rateLimit.attempts} of {MAX_INTERVIEWS_PER_DAY}
                    </span>{" "}
                    interviews used today
                    {rateLimit.remaining === 0 && rateLimit.nextAvailableAt && (
                      <span style={{ color: "#9A958F" }}>
                        {" "}— resets in{" "}
                        <span style={{ color: "#C89B3C", fontWeight: 600 }}>
                          {formatWait(rateLimit.nextAvailableAt)}
                        </span>
                      </span>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: "0.875rem", color: "#9A958F" }}>Loading…</div>
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
                    borderColor: !rateLimit || rateLimit.remaining === 0 ? "#E0DDD7" : "#1F4B4A",
                    background: !rateLimit || rateLimit.remaining === 0 ? "transparent" : "linear-gradient(155deg, #2F6664, #123332)",
                    color: !rateLimit || rateLimit.remaining === 0 ? "#C0BAB2" : "#fff",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    cursor: !rateLimit || rateLimit.remaining === 0 ? "not-allowed" : "pointer",
                    boxShadow: !rateLimit || rateLimit.remaining === 0 ? "none" : "0 4px 12px -4px rgba(18,51,50,0.4)",
                    whiteSpace: "nowrap",
                    transition: "all 0.15s",
                  }}
                >
                  Redo my profile
                </button>
                {rateLimit && rateLimit.remaining > 0 && (
                  <div style={{ fontSize: "0.6875rem", color: "#9A958F", textAlign: "right" }}>
                    {rateLimit.remaining} retake{rateLimit.remaining === 1 ? "" : "s"} remaining today
                  </div>
                )}
                {rateLimit && rateLimit.remaining === 0 && rateLimit.nextAvailableAt && (
                  <div style={{ fontSize: "0.6875rem", color: "#B04040", textAlign: "right" }}>
                    Try again in {formatWait(rateLimit.nextAvailableAt)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* DEMO debug panel */}
        {DEMO_SHOW_PROFILE && (
          <div style={{ background: "linear-gradient(160deg, #1A1916 0%, #1C1B19 100%)", borderRadius: 20, border: "1px solid rgba(255,255,255,0.07)", padding: "1.5rem", boxShadow: "0 2px 4px rgba(0,0,0,0.15), 0 20px 40px -20px rgba(0,0,0,0.4)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem", paddingBottom: "1rem", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#C89B3C", background: "rgba(200,155,60,0.12)", border: "1px solid rgba(200,155,60,0.25)", borderRadius: 999, padding: "0.2rem 0.75rem", flexShrink: 0 }}>Demo only</span>
              <span style={{ fontSize: "0.8125rem", color: "rgba(255,255,255,0.25)", fontWeight: 500 }}>Debug — parsed buyer profile</span>
            </div>
            <div className="hn-results-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem 2.5rem", fontFamily: "var(--font-jetbrains, monospace)", fontSize: "0.8125rem" }}>
              {[["Property type", prefs.property_type], ["Location", prefs.location], ["Bedrooms", prefs.bedrooms != null ? String(prefs.bedrooms) : "—"], ["Bathrooms", prefs.bathrooms != null ? String(prefs.bathrooms) : "—"], ["Timeline", prefs.timeline], ["Ideal score (ej)", String(char.expected_score_ej)], ["Floor score (aj)", String(char.min_acceptance_score_aj)]].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: "0.625rem", color: "rgba(255,255,255,0.28)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.2rem" }}>{label}</div>
                  <div style={{ color: "rgba(255,255,255,0.72)", fontWeight: 500 }}>{value}</div>
                </div>
              ))}
            </div>
            {prefs.must_haves?.length > 0 && (
              <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: "0.625rem", color: "rgba(255,255,255,0.28)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.5rem" }}>Must-haves</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
                  {prefs.must_haves.map((item: string, i: number) => (
                    <span key={i} style={{ fontSize: "0.75rem", background: "rgba(31,75,74,0.35)", color: "#B8D4D3", borderRadius: 6, padding: "0.2rem 0.625rem", border: "1px solid rgba(31,75,74,0.5)", fontFamily: "var(--font-jetbrains, monospace)" }}>{item}</span>
                  ))}
                </div>
              </div>
            )}
            {prefs.dealbreakers?.length > 0 && (
              <div style={{ marginTop: "0.875rem" }}>
                <div style={{ fontSize: "0.625rem", color: "rgba(255,255,255,0.28)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.5rem" }}>Dealbreakers</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
                  {prefs.dealbreakers.map((item: string, i: number) => (
                    <span key={i} style={{ fontSize: "0.75rem", background: "rgba(176,64,64,0.18)", color: "#E8A0A0", borderRadius: 6, padding: "0.2rem 0.625rem", border: "1px solid rgba(176,64,64,0.3)", fontFamily: "var(--font-jetbrains, monospace)" }}>{item}</span>
                  ))}
                </div>
              </div>
            )}
            {char.psychometric_scores && (
              <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: "0.625rem", color: "rgba(255,255,255,0.28)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.875rem" }}>Psychometric scores</div>
                <div className="hn-results-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem 2.5rem" }}>
                  {([["Verbal reasoning", char.psychometric_scores.verbal_reasoning], ["Numerical reasoning", char.psychometric_scores.numerical_reasoning], ["Spatial reasoning", char.psychometric_scores.spatial_reasoning], ["Abstract reasoning", char.psychometric_scores.abstract_reasoning], ["Memory", char.psychometric_scores.memory], ["Attention", char.psychometric_scores.attention], ["Processing speed", char.psychometric_scores.processing_speed], ["Executive function", char.psychometric_scores.executive_function]] as [string, number][]).map(([label, score]) => (
                    <div key={label}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.25rem" }}>
                        <div style={{ fontSize: "0.625rem", color: "rgba(255,255,255,0.3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "var(--font-jetbrains, monospace)" }}>{label}</div>
                        <span style={{ color: "rgba(255,255,255,0.65)", fontSize: "0.75rem", fontWeight: 700, fontFamily: "var(--font-jetbrains, monospace)" }}>{Math.round(score)}</span>
                      </div>
                      <div style={{ height: 5, background: "rgba(255,255,255,0.07)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${score}%`, background: score >= 70 ? "#1F4B4A" : score >= 45 ? "#C89B3C" : "#B04040", borderRadius: 3 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid rgba(28,27,25,0.08)", boxShadow: "0 1px 3px rgba(28,27,25,0.04)", padding: "1.75rem" }}>
            <div style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6B6860", marginBottom: "1.25rem" }}>
              Next steps — services to consider
            </div>
            <div className="hn-results-recs" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(19rem, 1fr))", gap: "0.875rem" }}>
              {recommendations.map(r => (
                <div key={r.id} style={{ background: "#F5F3EE", borderRadius: 14, border: "1px solid rgba(28,27,25,0.07)", padding: "1.125rem 1.25rem", display: "flex", gap: "0.875rem", alignItems: "flex-start" }}>
                  <span style={{ fontSize: "1.375rem", lineHeight: 1, flexShrink: 0, marginTop: "0.1rem" }}>{r.icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.9375rem", color: "#1C1B19", marginBottom: "0.3rem" }}>{r.label}</div>
                    <p style={{ margin: 0, fontSize: "0.875rem", color: "#6B6860", lineHeight: 1.6 }}>{r.blurb}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Leverage groups CTA */}
        {validMatches.length > 0 && (
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid rgba(28,27,25,0.08)", boxShadow: "0 1px 3px rgba(28,27,25,0.04)", overflow: "hidden" }}>
            <div style={{ height: 4, background: "linear-gradient(90deg, #C89B3C, #B8892C)" }} />
            <div style={{ padding: "1.5rem 1.75rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1.25rem", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 700, color: "#14130F", fontSize: "1rem", marginBottom: "0.3rem", letterSpacing: "-0.01em" }}>Interested in a group discount?</div>
                <p style={{ margin: 0, fontSize: "0.9375rem", color: "#6B6860", lineHeight: 1.5 }}>
                  Pool with other buyers to negotiate a better price on any of the listings above. Click &ldquo;Group discount&rdquo; on any card.
                </p>
              </div>
              <Link
                href="/buyer/leverage-groups"
                style={{ padding: "0.6875rem 1.375rem", borderRadius: 999, background: "linear-gradient(155deg, #2F6664, #123332)", color: "#fff", fontSize: "0.875rem", fontWeight: 700, textDecoration: "none", flexShrink: 0, boxShadow: "0 1px 0 rgba(255,255,255,0.15) inset, 0 8px 20px -8px rgba(18,51,50,0.5)", whiteSpace: "nowrap" }}
              >
                View all groups →
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
