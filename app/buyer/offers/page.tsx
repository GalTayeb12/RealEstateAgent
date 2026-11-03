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

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  pending:   { label: "Pending response",   bg: "var(--qp-warning-bg)", color: "var(--qp-accent-text)" },
  countered: { label: "Counter offer",      bg: "var(--qp-warning-bg)", color: "var(--qp-accent-text)" },
  accepted:  { label: "Accepted",           bg: "var(--qp-soft)",       color: "var(--qp-ink)" },
  rejected:  { label: "Rejected",           bg: "var(--qp-error-bg)",   color: "var(--qp-error)" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_META[status] ?? STATUS_META.pending;
  return (
    <span style={{
      fontSize: "0.75rem", fontWeight: 600,
      padding: "0.2rem 0.7rem", borderRadius: 999,
      background: s.bg, color: s.color,
    }}>
      {s.label}
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
      background: "var(--qp-ink)", color: "var(--qp-on-primary)", borderRadius: "0.625rem",
      padding: "0.75rem 1.25rem", fontSize: "0.9rem", fontWeight: 500,
      boxShadow: "0 4px 24px rgba(0,0,0,0.22)", zIndex: 9999,
      display: "flex", alignItems: "center", gap: "0.75rem", whiteSpace: "nowrap",
    }}>
      {message}
      <button onClick={onDismiss} style={{ background: "none", border: "none", color: "var(--qp-muted)", cursor: "pointer", fontSize: "1rem", padding: 0, lineHeight: 1 }}>✕</button>
    </div>
  );
}

function NegotiationHistory({ offer }: { offer: Offer }) {
  const history: HistoryEntry[] = (() => {
    try { return JSON.parse(offer.negotiationHistory || "[]"); } catch { return []; }
  })();

  if (history.length === 0) return null;

  return (
    <div style={{ marginTop: "0.75rem" }}>
      <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--qp-muted)", marginBottom: "0.5rem" }}>
        Negotiation history
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {history.map((entry, i) => (
          <div key={i} style={{
            padding: "0.625rem 0.875rem",
            borderRadius: "0.375rem",
            background: entry.actor === "developer" ? "var(--qp-warning-bg)" : "rgba(18,63,64,0.05)",
            borderLeft: `3px solid ${entry.actor === "developer" ? "var(--qp-accent-text)" : "var(--qp-ink)"}`,
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: entry.actor === "developer" ? "var(--qp-accent-text)" : "var(--qp-ink)" }}>
                {entry.actor === "developer" ? "Developer's counter" : "Your counter"}
              </span>
              <span style={{ fontFamily: "var(--font-heebo, monospace)", fontWeight: 600, fontSize: "0.9375rem", color: "var(--qp-ink)" }}>
                <Money amount={entry.price} />
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--qp-muted)" }}>
                {new Date(entry.ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </span>
            </div>
            {entry.explanation && (
              <p style={{ margin: "0.3rem 0 0", fontSize: "0.8125rem", color: "var(--qp-muted)", fontStyle: "italic" }}>
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
  const { m } = useI18n();
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
        setActionError(data.error ?? "Something went wrong");
        return;
      }
      if (action === "accept") {
        // Redirect to dedicated Deal Room — don't just stay on offers page
        router.push(`/deal/${offer.id}`);
        return;
      } else if (action === "reject") {
        onUpdated(offer.id, { status: "rejected" });
        onToast("Offer declined.");
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
        onToast("Your counter-offer has been sent to the developer.");
        setShowCounterForm(false);
      }
      setActing(null);
    } catch {
      setActionError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      background: "var(--qp-surface)",
      borderRadius: "0.875rem",
      border: `${dealComplete ? "2px" : "1px"} solid ${dealComplete ? "var(--qp-accent-text)" : isNew ? "var(--qp-accent-text)" : "var(--qp-border)"}`,
      overflow: "hidden",
      borderTop: `4px solid ${
        dealComplete ? "var(--qp-accent-text)" :
        offer.status === "accepted" ? "var(--qp-ink)" :
        offer.status === "rejected" ? "var(--qp-error)" :
        offer.status === "countered" ? "var(--qp-accent-text)" : "var(--qp-border)"
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
                textTransform: "uppercase", color: "var(--qp-accent-text)",
                background: "rgba(200,155,60,0.1)", borderRadius: 999,
                padding: "0.15rem 0.5rem", marginBottom: "0.4rem",
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--qp-accent-text)", display: "inline-block" }} />
                New update
              </div>
            )}
            <h3 style={{ fontFamily: "var(--font-heebo, sans-serif)", fontSize: "1.0625rem", fontWeight: 600, color: "var(--qp-ink)", margin: 0, marginBottom: "0.2rem" }}>
              {unit.project.name} — {unit.unitLabel}
            </h3>
            <div style={{ fontSize: "0.8125rem", color: "var(--qp-muted)" }}>
              {unit.project.location}
              {unit.price > 0 && <> · <Money amount={unit.price} /></>}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", flexWrap: "wrap" }}>
            {dealComplete && (
              <span style={{
                fontSize: "0.75rem", fontWeight: 600,
                padding: "0.2rem 0.7rem", borderRadius: 999,
                background: "var(--qp-warning-bg)", color: "var(--qp-accent-text)",
                display: "inline-flex", alignItems: "center", gap: "0.3rem",
              }}>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="var(--qp-ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1.5 6 4.5 9 10.5 3"/>
                </svg>
                Deal complete
              </span>
            )}
            {!dealComplete && <StatusBadge status={offer.status} />}
          </div>
        </div>

        {/* Original offer */}
        <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
          <div>
            <div style={{ fontSize: "0.6875rem", color: "var(--qp-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.2rem" }}>Your offer</div>
            <div style={{ fontFamily: "var(--font-heebo, monospace)", fontWeight: 600, fontSize: "1rem", color: "var(--qp-ink)" }}>
              <Money amount={offer.offeredPrice} />
            </div>
          </div>
          {offer.terms && (
            <div>
              <div style={{ fontSize: "0.6875rem", color: "var(--qp-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.2rem" }}>Terms</div>
              <div style={{ fontSize: "0.875rem", color: "var(--qp-muted)" }}>&ldquo;{offer.terms}&rdquo;</div>
            </div>
          )}
        </div>

        {/* Negotiation history (past rounds) */}
        <NegotiationHistory offer={offer} />

        {/* Developer's current counter-offer (live — round 1) */}
        {isCountered && (
          <div style={{ background: "var(--qp-warning-bg)", borderRadius: "0.5rem", padding: "0.875rem 1rem", border: "1px solid rgba(179,139,77,0.3)", marginTop: "0.75rem" }}>
            <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--qp-accent-text)", marginBottom: "0.375rem" }}>
              Developer&rsquo;s counter-offer
            </div>
            <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "baseline", marginBottom: offer.counterExplanation ? "0.375rem" : 0 }}>
              <div>
                <span style={{ fontSize: "0.8125rem", color: "var(--qp-muted)" }}>Counter price </span>
                <span style={{ fontFamily: "var(--font-heebo, monospace)", fontWeight: 600, color: "var(--qp-accent-text)", fontSize: "1rem" }}><Money amount={offer.counterPrice!} /></span>
              </div>
              {offer.counterTerms && (
                <div style={{ fontSize: "0.875rem", color: "var(--qp-ink)" }}>&ldquo;{offer.counterTerms}&rdquo;</div>
              )}
            </div>
            {offer.counterExplanation && (
              <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--qp-muted)", fontStyle: "italic", marginBottom: "0.875rem" }}>
                &ldquo;{offer.counterExplanation}&rdquo;
              </p>
            )}

            {/* Action buttons — only when no counter form open */}
            {!showCounterForm && (
              <div className="qp-offer-actions" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  onClick={() => { setActing("accept"); respond("accept"); }}
                  disabled={submitting}
                  className="qp-offer-action-btn"
                  style={{ padding: "0.45rem 1rem", borderRadius: 999, border: "none", cursor: submitting ? "not-allowed" : "pointer", background: acting === "accept" && submitting ? "rgba(18,63,64,0.6)" : "var(--qp-ink)", color: "var(--qp-on-primary)", fontSize: "0.8125rem", fontWeight: 600, opacity: submitting && acting !== "accept" ? 0.5 : 1 }}
                >
                  {acting === "accept" && submitting ? "Accepting…" : "Accept"}
                </button>
                <button
                  onClick={() => { setActing("reject"); respond("reject"); }}
                  disabled={submitting}
                  className="qp-offer-action-btn"
                  style={{ padding: "0.45rem 1rem", borderRadius: 999, border: "1px solid var(--qp-border)", cursor: submitting ? "not-allowed" : "pointer", background: "var(--qp-surface)", color: "var(--qp-error)", fontSize: "0.8125rem", fontWeight: 600, opacity: submitting && acting !== "reject" ? 0.5 : 1 }}
                >
                  {acting === "reject" && submitting ? "Declining…" : "Decline"}
                </button>
                {/* Counter only available in round 1 (buyer hasn't countered yet) */}
                {offer.roundNumber < 2 && (
                  <button
                    onClick={() => setShowCounterForm(true)}
                    disabled={submitting}
                    className="qp-offer-action-btn"
                    style={{ padding: "0.45rem 1rem", borderRadius: 999, border: "1px solid var(--qp-accent-text)", cursor: submitting ? "not-allowed" : "pointer", background: "transparent", color: "var(--qp-accent-text)", fontSize: "0.8125rem", fontWeight: 600, opacity: submitting ? 0.5 : 1 }}
                  >
                    Counter
                  </button>
                )}
              </div>
            )}

            {/* Inline counter form — price only, no terms */}
            {showCounterForm && (
              <div style={{ marginTop: "0.625rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.6875rem", fontWeight: 600, color: "var(--qp-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem" }}>
                    מחיר נגד (₪) / Counter (ILS)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={counterPrice}
                    onChange={e => setCounterPrice(e.target.value)}
                    placeholder={String(offer.counterPrice ?? offer.offeredPrice)}
                    className="qp-counter-input"
                    style={{ width: "10rem", padding: "0.45rem 0.75rem", borderRadius: "0.375rem", border: "1px solid var(--qp-border)", fontSize: "1rem", fontFamily: "var(--font-heebo, monospace)", outline: "none" }}
                  />
                </div>
                {actionError && (
                  <div style={{ fontSize: "0.8125rem", color: "var(--qp-error)" }}>{actionError}</div>
                )}
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button
                    onClick={() => respond("counter")}
                    disabled={submitting || !counterPrice}
                    className="qp-offer-action-btn"
                    style={{ padding: "0.45rem 1rem", borderRadius: 999, border: "none", background: "var(--qp-accent-text)", color: "var(--qp-on-primary)", fontSize: "0.8125rem", fontWeight: 600, cursor: submitting || !counterPrice ? "not-allowed" : "pointer", opacity: submitting || !counterPrice ? 0.6 : 1 }}
                  >
                    {submitting ? "Sending…" : "Send counter"}
                  </button>
                  <button
                    onClick={() => { setShowCounterForm(false); setCounterPrice(""); setActionError(""); }}
                    disabled={submitting}
                    className="qp-offer-action-btn"
                    style={{ padding: "0.45rem 1rem", borderRadius: 999, border: "1px solid var(--qp-border)", background: "var(--qp-surface)", color: "var(--qp-muted)", fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {actionError && !showCounterForm && (
              <div style={{ fontSize: "0.8125rem", color: "var(--qp-error)", marginTop: "0.5rem" }}>{actionError}</div>
            )}
          </div>
        )}

        {/* Final round — buyer countered, awaiting developer */}
        {isFinalRound && (
          <div style={{ marginTop: "0.75rem", padding: "0.75rem 1rem", background: "var(--qp-soft)", borderRadius: "0.5rem", border: "1px solid var(--qp-border)" }}>
            <div style={{ fontSize: "0.8125rem", color: "var(--qp-muted)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--qp-accent-text)", display: "inline-block", flexShrink: 0, animation: "pulse 1.8s ease-in-out infinite" }} />
              Awaiting developer&rsquo;s decision — they must accept or reject your counter.
            </div>
            {offer.meetingLink && (
              <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "var(--qp-soft)", borderRadius: "0.4rem", border: "1px solid rgba(18,63,64,0.15)" }}>
                <div style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--qp-ink)", marginBottom: "0.4rem" }}>
                  Video call
                </div>
                <a
                  href={offer.meetingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.45rem 1rem", borderRadius: 999, background: "var(--qp-ink)", color: "var(--qp-on-primary)", fontSize: "0.8125rem", fontWeight: 600, textDecoration: "none" }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--qp-on-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                  </svg>
                  Join call
                </a>
              </div>
            )}
            <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }`}</style>
          </div>
        )}

        {/* Meeting link also visible on accepted/other statuses if set */}
        {!isFinalRound && offer.meetingLink && (
          <div style={{ marginTop: "0.75rem", padding: "0.75rem 1rem", background: "var(--qp-soft)", borderRadius: "0.5rem", border: "1px solid rgba(18,63,64,0.15)" }}>
            <div style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--qp-ink)", marginBottom: "0.4rem" }}>
              Video call
            </div>
            <a
              href={offer.meetingLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.45rem 1rem", borderRadius: 999, background: "var(--qp-ink)", color: "var(--qp-on-primary)", fontSize: "0.8125rem", fontWeight: 600, textDecoration: "none" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--qp-on-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
                background: "var(--qp-ink)",
                color: "var(--qp-on-primary)",
                fontSize: "0.8125rem",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              {dealComplete ? "View signed contract →" : "View Deal Room →"}
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
                  border: "1px solid var(--qp-border)",
                  background: "var(--qp-surface)",
                  color: "var(--qp-muted)",
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

        <div style={{ fontSize: "0.75rem", color: "var(--qp-muted)", marginTop: "0.75rem" }}>
          Submitted {new Date(offer.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          {offer.updatedAt !== offer.createdAt && (
            <> · Updated {new Date(offer.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</>
          )}
          {offer.roundNumber > 0 && (
            <> · Round {offer.roundNumber + 1} of 3</>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ textAlign: "center", padding: "4rem 2rem", background: "var(--qp-surface)", borderRadius: "0.875rem", border: "1px solid var(--qp-border)" }}>
      <div style={{ width: "3rem", height: "3rem", borderRadius: "50%", background: "var(--qp-soft)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--qp-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </div>
      <div style={{ fontFamily: "var(--font-heebo, sans-serif)", fontSize: "1.125rem", fontWeight: 600, color: "var(--qp-ink)", marginBottom: "0.5rem" }}>
        No offers yet
      </div>
      <p style={{ margin: "0 0 1.5rem", fontSize: "0.9375rem", color: "var(--qp-muted)", maxWidth: "22rem", marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>
        Once you find matches and send an offer, it will appear here.
      </p>
      <Link
        href="/results"
        style={{ display: "inline-block", padding: "0.625rem 1.5rem", borderRadius: 999, background: "var(--qp-ink)", color: "var(--qp-on-primary)", fontSize: "0.875rem", fontWeight: 600, textDecoration: "none" }}
      >
        View matches →
      </Link>
    </div>
  );
}

export default function BuyerOffersPage() {
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
    <main style={{ minHeight: "100vh", background: "var(--qp-bg)", fontFamily: "var(--font-heebo, sans-serif)", paddingBottom: "4rem" }}>
      <style>{`
        @media (max-width: 640px) {
          .qp-offer-actions     { flex-wrap: wrap; }
          .qp-offer-action-btn  { min-height: 2.5rem !important; padding: 0.6rem 1rem !important; font-size: 0.875rem !important; }
          .qp-counter-input     { width: 100% !important; font-size: 1rem !important; }
        }
      `}</style>
      {toast && <Toast message={toast} onDismiss={() => setToast("")} />}

      {/* Header */}
      <div style={{ borderBottom: "1px solid var(--qp-border)", background: "var(--qp-surface)" }}>
        <div style={{ maxWidth: "75rem", margin: "0 auto", padding: "1.5rem" }}>
          <div style={{ fontFamily: "var(--font-heebo, sans-serif)", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--qp-ink)", marginBottom: "0.5rem" }}>
            Haveniq
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <h1 style={{ fontFamily: "var(--font-heebo, sans-serif)", fontSize: "1.875rem", fontWeight: 600, color: "var(--qp-ink)", margin: 0 }}>
                My offers
              </h1>
              <p style={{ margin: "0.375rem 0 0", color: "var(--qp-muted)", fontSize: "0.9375rem" }}>
                Track the status of all offers you&rsquo;ve submitted.
              </p>
            </div>
            <Link href="/results" style={{ fontSize: "0.875rem", color: "var(--qp-ink)", fontWeight: 600, textDecoration: "none" }}>
              ← Back to results
            </Link>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "75rem", margin: "0 auto", padding: "2rem 1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: "4rem 0" }}>
            <div style={{ width: "2rem", height: "2rem", borderRadius: "50%", border: "2px solid rgba(18,63,64,0.08)", borderTopColor: "var(--qp-ink)", animation: "spin 0.9s linear infinite" }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {!loading && error && (
          <div style={{ background: "var(--qp-error-bg)", borderRadius: "0.875rem", padding: "1.25rem 1.5rem", color: "var(--qp-error)", fontSize: "0.9375rem" }}>
            Failed to load offers: {error}
          </div>
        )}

        {!loading && !error && offers.length === 0 && <EmptyState />}

        {recentlyUpdated.length > 0 && (
          <div>
            <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--qp-accent-text)", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--qp-accent-text)", display: "inline-block" }} />
              Recent updates ({recentlyUpdated.length})
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
              <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--qp-muted)", marginBottom: "0.75rem" }}>
                All offers ({rest.length})
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
