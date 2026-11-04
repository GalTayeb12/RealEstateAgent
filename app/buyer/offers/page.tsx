"use client";
/**
 * /buyer/offers — buyer's sent offers with full negotiation history.
 *
 * Negotiation rounds (roundNumber):
 *   0 — initial offer sent, awaiting developer
 *   1 — developer countered → buyer can Accept / Reject / Counter (price only)
 *   2 — buyer countered back → awaiting developer's final Accept/Reject only
 */
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Money } from "@/components/Money";
import { useI18n } from "@/components/LocaleProvider";

interface OfferUnit {
  unitLabel: string;
  price: number;
  project: { name: string; location: string };
}

interface HistoryEntry {
  actor: "developer" | "buyer";
  price: number;
  terms?: string;
  explanation?: string;
  ts: string;
}

interface Offer {
  id: string;
  offeredPrice: number;
  terms: string;
  status: string;
  counterPrice: number | null;
  counterTerms: string | null;
  counterExplanation: string | null;
  roundNumber: number;
  negotiationHistory: string;
  meetingLink: string | null;
  buyerSignature: string | null;
  developerSignature: string | null;
  createdAt: string;
  updatedAt: string;
  unitType: OfferUnit;
}

const STATUS_BG: Record<string, { bg: string; color: string }> = {
  pending:   { bg: "#FCF2D9", color: "#756039" },
  countered: { bg: "#FCF2D9", color: "#756039" },
  accepted:  { bg: "#E9EEEA", color: "#123F40" },
  rejected:  { bg: "#FBECEA", color: "#9E3434" },
};

function StatusBadge({ status }: { status: string }) {
  const { m } = useI18n();
  const s = STATUS_BG[status] ?? STATUS_BG.pending;
  const label: Record<string, string> = {
    pending: m.offers.statusPending,
    countered: m.offers.statusCountered,
    accepted: m.offers.statusAccepted,
    rejected: m.offers.statusRejected,
  };
  return (
    <span style={{
      fontSize: "0.75rem", fontWeight: 600,
      padding: "0.2rem 0.7rem", borderRadius: 999,
      background: s.bg, color: s.color,
    }}>
      {label[status] ?? m.offers.statusPending}
    </span>
  );
}

function isRecentlyUpdated(updatedAt: string, createdAt: string): boolean {
  const updated = new Date(updatedAt).getTime();
  const created = new Date(createdAt).getTime();
  if (updated - created < 5000) return false;
  return Date.now() - updated < 7 * 24 * 60 * 60 * 1000;
}

function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div style={{
      position: "fixed", bottom: "1.5rem", left: "50%", transform: "translateX(-50%)",
      background: "#123F40", color: "#F4F5F0", borderRadius: "0.625rem",
      padding: "0.75rem 1.25rem", fontSize: "0.9rem", fontWeight: 500,
      boxShadow: "0 4px 24px rgba(0,0,0,0.22)", zIndex: 9999,
      display: "flex", alignItems: "center", gap: "0.75rem", whiteSpace: "nowrap",
    }}>
      {message}
      <button onClick={onDismiss} style={{ background: "none", border: "none", color: "#526563", cursor: "pointer", fontSize: "1rem", padding: 0, lineHeight: 1 }}>✕</button>
    </div>
  );
}

function NegotiationHistory({ offer }: { offer: Offer }) {
  const { m, locale } = useI18n();
  const history: HistoryEntry[] = (() => {
    try { return JSON.parse(offer.negotiationHistory || "[]"); } catch { return []; }
  })();

  if (history.length === 0) return null;

  return (
    <div style={{ marginTop: "0.75rem" }}>
      <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#526563", marginBottom: "0.5rem" }}>
        {m.offers.negotiationHistory}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {history.map((entry, i) => (
          <div key={i} style={{
            padding: "0.625rem 0.875rem",
            borderRadius: "0.375rem",
            background: entry.actor === "developer" ? "#FCF2D9" : "#EAF3F2",
            borderLeft: `3px solid ${entry.actor === "developer" ? "#756039" : "#123F40"}`,
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: entry.actor === "developer" ? "#756039" : "#123F40" }}>
                {entry.actor === "developer" ? m.offers.devCounter : m.offers.yourCounter}
              </span>
              <span style={{ fontFamily: "var(--font-heebo, sans-serif)", fontWeight: 600, fontSize: "0.9375rem", color: "#123F40", fontVariantNumeric: "tabular-nums" }}>
                <Money amount={entry.price} />
              </span>
              <span style={{ fontSize: "0.75rem", color: "#526563" }}>
                {new Date(entry.ts).toLocaleDateString(locale === "he" ? "he-IL" : "en-GB", { day: "numeric", month: "short" })}
              </span>
            </div>
            {entry.explanation && (
              <p style={{ margin: "0.3rem 0 0", fontSize: "0.8125rem", color: "#526563", fontStyle: "italic" }}>
                &ldquo;{entry.explanation}&rdquo;
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function OfferCard({
  offer,
  isNew,
  onUpdated,
  onToast,
}: {
  offer: Offer;
  isNew: boolean;
  onUpdated: (id: string, patch: Partial<Offer>) => void;
  onToast: (msg: string) => void;
}) {
  const { m, locale } = useI18n();
  const unit = offer.unitType;
  const router = useRouter();
  const isCountered = offer.status === "countered" && offer.counterPrice != null;
  const isFinalRound = offer.roundNumber >= 2 && offer.status === "pending";
  const dealComplete = offer.status === "accepted" && !!offer.buyerSignature && !!offer.developerSignature;
  const [acting, setActing] = useState<"accept" | "reject" | "counter" | null>(null);
  const [showCounterForm, setShowCounterForm] = useState(false);
  const [counterPrice, setCounterPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");

  async function respond(action: "accept" | "reject" | "counter") {
    setSubmitting(true);
    setActionError("");
    const token = localStorage.getItem("token") ?? "";
    const body: Record<string, unknown> = { action };
    if (action === "counter") {
      body.counterPrice = Number(counterPrice);
    }
    try {
      const res = await fetch(`/api/buyer/offers/${offer.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? m.offers.somethingWrong);
        return;
      }
      if (action === "accept") {
        // Redirect to dedicated Deal Room — don't just stay on offers page
        router.push(`/deal/${offer.id}`);
        return;
      } else if (action === "reject") {
        onUpdated(offer.id, { status: "rejected" });
        onToast(m.offers.offerDeclined);
      } else {
        onUpdated(offer.id, {
          status: "pending",
          offeredPrice: Number(counterPrice),
          counterPrice: null,
          counterTerms: null,
          counterExplanation: null,
          meetingLink: null,
          roundNumber: 2,
          updatedAt: new Date().toISOString(),
        });
        onToast(m.offers.counterSent);
        setShowCounterForm(false);
      }
      setActing(null);
    } catch {
      setActionError(m.offers.networkError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      background: "#fff",
      borderRadius: "0.875rem",
      border: `${dealComplete ? "2px" : "1px"} solid ${dealComplete ? "#756039" : isNew ? "#756039" : "#D4DED8"}`,
      overflow: "hidden",
      borderTop: `4px solid ${
        dealComplete ? "#756039" :
        offer.status === "accepted" ? "#123F40" :
        offer.status === "rejected" ? "#9E3434" :
        offer.status === "countered" ? "#756039" : "#E0DDD7"
      }`,
    }}>
      <div style={{ padding: "1.25rem 1.5rem" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.875rem" }}>
          <div>
            {isNew && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: "0.3rem",
                fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.07em",
                textTransform: "uppercase", color: "#756039",
                background: "rgba(200,155,60,0.1)", borderRadius: 999,
                padding: "0.15rem 0.5rem", marginBottom: "0.4rem",
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#756039", display: "inline-block" }} />
                {m.offers.newUpdate}
              </div>
            )}
            <h3 style={{ fontFamily: "var(--font-heebo, sans-serif)", fontSize: "1.0625rem", fontWeight: 600, color: "#123F40", margin: 0, marginBottom: "0.2rem" }}>
              {unit.project.name} — {unit.unitLabel}
            </h3>
            <div style={{ fontSize: "0.8125rem", color: "#526563" }}>
              {unit.project.location}
              {unit.price > 0 && <> · <Money amount={unit.price} /></>}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", flexWrap: "wrap" }}>
            {dealComplete && (
              <span style={{
                fontSize: "0.75rem", fontWeight: 600,
                padding: "0.2rem 0.7rem", borderRadius: 999,
                background: "#FCF2D9", color: "#756039",
                display: "inline-flex", alignItems: "center", gap: "0.3rem",
              }}>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#123F40" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1.5 6 4.5 9 10.5 3"/>
                </svg>
                {m.offers.dealComplete}
              </span>
            )}
            {!dealComplete && <StatusBadge status={offer.status} />}
          </div>
        </div>

        {/* Original offer */}
        <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
          <div>
            <div style={{ fontSize: "0.6875rem", color: "#526563", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.2rem" }}>{m.offers.yourOffer}</div>
            <div style={{ fontFamily: "var(--font-heebo, sans-serif)", fontWeight: 600, fontSize: "1rem", color: "#123F40", fontVariantNumeric: "tabular-nums" }}>
              <Money amount={offer.offeredPrice} />
            </div>
          </div>
          {offer.terms && (
            <div>
              <div style={{ fontSize: "0.6875rem", color: "#526563", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.2rem" }}>{m.offers.terms}</div>
              <div style={{ fontSize: "0.875rem", color: "#526563" }}>&ldquo;{offer.terms}&rdquo;</div>
            </div>
          )}
        </div>

        {/* Negotiation history (past rounds) */}
        <NegotiationHistory offer={offer} />

        {/* Developer's current counter-offer (live — round 1) */}
        {isCountered && (
          <div style={{ background: "#FCF2D9", borderRadius: "0.5rem", padding: "0.875rem 1rem", border: "1px solid #EDD9A3", marginTop: "0.75rem" }}>
            <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#756039", marginBottom: "0.375rem" }}>
              {m.offers.devCounter}
            </div>
            <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "baseline", marginBottom: offer.counterExplanation ? "0.375rem" : 0 }}>
              <div>
                <span style={{ fontSize: "0.8125rem", color: "#526563" }}>{m.offers.counterPrice} </span>
                <span style={{ fontFamily: "var(--font-heebo, sans-serif)", fontWeight: 600, color: "#756039", fontSize: "1rem", fontVariantNumeric: "tabular-nums" }}><Money amount={offer.counterPrice!} /></span>
              </div>
              {offer.counterTerms && (
                <div style={{ fontSize: "0.875rem", color: "#123F40" }}>&ldquo;{offer.counterTerms}&rdquo;</div>
              )}
            </div>
            {offer.counterExplanation && (
              <p style={{ margin: 0, fontSize: "0.8125rem", color: "#526563", fontStyle: "italic", marginBottom: "0.875rem" }}>
                &ldquo;{offer.counterExplanation}&rdquo;
              </p>
            )}

            {/* Action buttons — only when no counter form open */}
            {!showCounterForm && (
              <div className="hn-offer-actions" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  onClick={() => { setActing("accept"); respond("accept"); }}
                  disabled={submitting}
                  className="hn-offer-action-btn"
                  style={{ padding: "0.45rem 1rem", borderRadius: 999, border: "none", cursor: submitting ? "not-allowed" : "pointer", background: acting === "accept" && submitting ? "#a5c9c7" : "#123F40", color: "#fff", fontSize: "0.8125rem", fontWeight: 600, opacity: submitting && acting !== "accept" ? 0.5 : 1 }}
                >
                  {acting === "accept" && submitting ? m.offers.accepting : m.offers.accept}
                </button>
                <button
                  onClick={() => { setActing("reject"); respond("reject"); }}
                  disabled={submitting}
                  className="hn-offer-action-btn"
                  style={{ padding: "0.45rem 1rem", borderRadius: 999, border: "1px solid #D4DED8", cursor: submitting ? "not-allowed" : "pointer", background: "#fff", color: "#9E3434", fontSize: "0.8125rem", fontWeight: 600, opacity: submitting && acting !== "reject" ? 0.5 : 1 }}
                >
                  {acting === "reject" && submitting ? m.offers.declining : m.offers.decline}
                </button>
                {/* Counter only available in round 1 (buyer hasn't countered yet) */}
                {offer.roundNumber < 2 && (
                  <button
                    onClick={() => setShowCounterForm(true)}
                    disabled={submitting}
                    className="hn-offer-action-btn"
                    style={{ padding: "0.45rem 1rem", borderRadius: 999, border: "1px solid #756039", cursor: submitting ? "not-allowed" : "pointer", background: "transparent", color: "#756039", fontSize: "0.8125rem", fontWeight: 600, opacity: submitting ? 0.5 : 1 }}
                  >
                    {m.offers.counter}
                  </button>
                )}
              </div>
            )}

            {/* Inline counter form — price only, no terms */}
            {showCounterForm && (
              <div style={{ marginTop: "0.625rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.6875rem", fontWeight: 600, color: "#526563", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem" }}>
                    {m.offers.counterPlaceholder}
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={counterPrice}
                    onChange={e => setCounterPrice(e.target.value)}
                    placeholder={String(offer.counterPrice ?? offer.offeredPrice)}
                    className="hn-counter-input"
                    style={{ width: "10rem", padding: "0.45rem 0.75rem", borderRadius: "0.375rem", border: "1px solid #D4DED8", fontSize: "1rem", fontFamily: "var(--font-heebo, sans-serif)", outline: "none" }}
                  />
                </div>
                {actionError && (
                  <div style={{ fontSize: "0.8125rem", color: "#9E3434" }}>{actionError}</div>
                )}
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button
                    onClick={() => respond("counter")}
                    disabled={submitting || !counterPrice}
                    className="hn-offer-action-btn"
                    style={{ padding: "0.45rem 1rem", borderRadius: 999, border: "none", background: "#756039", color: "#fff", fontSize: "0.8125rem", fontWeight: 600, cursor: submitting || !counterPrice ? "not-allowed" : "pointer", opacity: submitting || !counterPrice ? 0.6 : 1 }}
                  >
                    {submitting ? m.offers.sendingCounter : m.offers.sendCounter}
                  </button>
                  <button
                    onClick={() => { setShowCounterForm(false); setCounterPrice(""); setActionError(""); }}
                    disabled={submitting}
                    className="hn-offer-action-btn"
                    style={{ padding: "0.45rem 1rem", borderRadius: 999, border: "1px solid #D4DED8", background: "#fff", color: "#526563", fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer" }}
                  >
                    {m.offers.cancel}
                  </button>
                </div>
              </div>
            )}

            {actionError && !showCounterForm && (
              <div style={{ fontSize: "0.8125rem", color: "#9E3434", marginTop: "0.5rem" }}>{actionError}</div>
            )}
          </div>
        )}

        {/* Final round — buyer countered, awaiting developer */}
        {isFinalRound && (
          <div style={{ marginTop: "0.75rem", padding: "0.75rem 1rem", background: "#E9EEEA", borderRadius: "0.5rem", border: "1px solid #D4DED8" }}>
            <div style={{ fontSize: "0.8125rem", color: "#526563", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#756039", display: "inline-block", flexShrink: 0, animation: "pulse 1.8s ease-in-out infinite" }} />
              {m.offers.awaitingDev}
            </div>
            {offer.meetingLink && (
              <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "#E9EEEA", borderRadius: "0.4rem", border: "1px solid #C0DBD9" }}>
                <div style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "#123F40", marginBottom: "0.4rem" }}>
                  {m.offers.videoCall}
                </div>
                <a
                  href={offer.meetingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.45rem 1rem", borderRadius: 999, background: "#123F40", color: "#fff", fontSize: "0.8125rem", fontWeight: 600, textDecoration: "none" }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                  </svg>
                  {m.offers.joinCall}
                </a>
              </div>
            )}
            <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }`}</style>
          </div>
        )}

        {/* Meeting link also visible on accepted/other statuses if set */}
        {!isFinalRound && offer.meetingLink && (
          <div style={{ marginTop: "0.75rem", padding: "0.75rem 1rem", background: "#E9EEEA", borderRadius: "0.5rem", border: "1px solid #C0DBD9" }}>
            <div style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "#123F40", marginBottom: "0.4rem" }}>
              Video call
            </div>
            <a
              href={offer.meetingLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.45rem 1rem", borderRadius: 999, background: "#123F40", color: "#fff", fontSize: "0.8125rem", fontWeight: 600, textDecoration: "none" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
              </svg>
              Join call
            </a>
          </div>
        )}

        {/* Deal Room link — visible for accepted offers */}
        {offer.status === "accepted" && (
          <div style={{ marginTop: "0.875rem" }}>
            <Link
              href={`/deal/${offer.id}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.5rem 1.125rem",
                borderRadius: 999,
                background: "linear-gradient(155deg, #0C3031, #123332)",
                color: "#fff",
                fontSize: "0.8125rem",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              {dealComplete ? m.offers.viewSigned : m.offers.viewDealRoom}
            </Link>
            {!dealComplete && (
              <button
                type="button"
                onClick={async () => {
                  const token = localStorage.getItem("token") ?? "";
                  const res = await fetch(`/api/offers/${offer.id}/cancel`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                  });
                  if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    onToast(data.error ?? "Could not release the reservation");
                    return;
                  }
                  onUpdated(offer.id, { status: "cancelled" });
                }}
                style={{
                  marginInlineStart: "0.75rem",
                  padding: "0.5rem 0.875rem",
                  borderRadius: 999,
                  border: "1px solid #D4DED8",
                  background: "#fff",
                  color: "#526563",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {m.results.release}
              </button>
            )}
          </div>
        )}

        <div style={{ fontSize: "0.75rem", color: "#526563", marginTop: "0.75rem" }}>
          {m.offers.submittedOn} {new Date(offer.createdAt).toLocaleDateString(locale === "he" ? "he-IL" : "en-GB", { day: "numeric", month: "short", year: "numeric" })}
          {offer.updatedAt !== offer.createdAt && (
            <> · {m.offers.updatedOn} {new Date(offer.updatedAt).toLocaleDateString(locale === "he" ? "he-IL" : "en-GB", { day: "numeric", month: "short", year: "numeric" })}</>
          )}
          {offer.roundNumber > 0 && (
            <> · {m.offers.round} {offer.roundNumber + 1} {m.offers.of3}</>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  const { m } = useI18n();
  return (
    <div style={{ textAlign: "center", padding: "4rem 2rem", background: "#fff", borderRadius: "0.875rem", border: "1px solid #D4DED8" }}>
      <div style={{ width: "3rem", height: "3rem", borderRadius: "50%", background: "#E9EEEA", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#123F40" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </div>
      <div style={{ fontFamily: "var(--font-heebo, sans-serif)", fontSize: "1.125rem", fontWeight: 600, color: "#123F40", marginBottom: "0.5rem" }}>
        {m.offers.empty}
      </div>
      <p style={{ margin: "0 0 1.5rem", fontSize: "0.9375rem", color: "#526563", maxWidth: "22rem", marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>
        {m.offers.emptyBody}
      </p>
      <Link
        href="/results"
        style={{ display: "inline-block", padding: "0.625rem 1.5rem", borderRadius: 999, background: "linear-gradient(155deg, #0C3031, #123332)", color: "#fff", fontSize: "0.875rem", fontWeight: 600, textDecoration: "none" }}
      >
        {m.offers.viewMatches}
      </Link>
    </div>
  );
}

export default function BuyerOffersPage() {
  const { m } = useI18n();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    const token = localStorage.getItem("token") ?? "";
    if (!token) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/offers", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setOffers(data.offers ?? []);
      localStorage.setItem("offersLastViewedAt", String(Date.now()));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleUpdated(id: string, patch: Partial<Offer>) {
    setOffers(prev => prev.map(o => o.id === id ? { ...o, ...patch, updatedAt: new Date().toISOString() } : o));
  }

  const recentlyUpdated = offers.filter(o => isRecentlyUpdated(o.updatedAt, o.createdAt));
  const rest = offers.filter(o => !isRecentlyUpdated(o.updatedAt, o.createdAt));

  return (
    <main style={{ minHeight: "100vh", background: "#F4F5F0", fontFamily: "var(--font-inter, sans-serif)", paddingBottom: "4rem" }}>
      <style>{`
        @media (max-width: 640px) {
          .hn-offer-actions     { flex-wrap: wrap; }
          .hn-offer-action-btn  { min-height: 2.5rem !important; padding: 0.6rem 1rem !important; font-size: 0.875rem !important; }
          .hn-counter-input     { width: 100% !important; font-size: 1rem !important; }
        }
      `}</style>
      {toast && <Toast message={toast} onDismiss={() => setToast("")} />}

      {/* Header */}
      <div style={{ borderBottom: "1px solid #D4DED8", background: "#fff" }}>
        <div style={{ maxWidth: "75rem", margin: "0 auto", padding: "1.5rem" }}>
          <div style={{ fontFamily: "var(--font-heebo, sans-serif)", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "#123F40", marginBottom: "0.5rem" }}>
            Haveniq
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <h1 style={{ fontFamily: "var(--font-heebo, sans-serif)", fontSize: "1.875rem", fontWeight: 600, color: "#123F40", margin: 0 }}>
                {m.offers.title}
              </h1>
              <p style={{ margin: "0.375rem 0 0", color: "#526563", fontSize: "0.9375rem" }}>
                {m.offers.subtitle}
              </p>
            </div>
            <Link href="/results" style={{ fontSize: "0.875rem", color: "#123F40", fontWeight: 600, textDecoration: "none" }}>
              {m.offers.backToResults}
            </Link>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "75rem", margin: "0 auto", padding: "2rem 1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: "4rem 0" }}>
            <div style={{ width: "2rem", height: "2rem", borderRadius: "50%", border: "2px solid rgba(18,63,64,0.08)", borderTopColor: "#123F40", animation: "spin 0.9s linear infinite" }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {!loading && error && (
          <div style={{ background: "#FBECEA", borderRadius: "0.875rem", padding: "1.25rem 1.5rem", color: "#9E3434", fontSize: "0.9375rem" }}>
            {m.offers.failedLoad} {error}
          </div>
        )}

        {!loading && !error && offers.length === 0 && <EmptyState />}

        {recentlyUpdated.length > 0 && (
          <div>
            <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#756039", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#756039", display: "inline-block" }} />
              {m.offers.recentUpdates} ({recentlyUpdated.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {recentlyUpdated.map(o => (
                <OfferCard key={o.id} offer={o} isNew={true} onUpdated={handleUpdated} onToast={setToast} />
              ))}
            </div>
          </div>
        )}

        {rest.length > 0 && (
          <div>
            {recentlyUpdated.length > 0 && (
              <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#526563", marginBottom: "0.75rem" }}>
                {m.offers.allOffers} ({rest.length})
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {rest.map(o => (
                <OfferCard key={o.id} offer={o} isNew={false} onUpdated={handleUpdated} onToast={setToast} />
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
