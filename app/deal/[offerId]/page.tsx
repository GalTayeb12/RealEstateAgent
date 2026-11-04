"use client";
/**
 * /deal/[offerId] — Deal Room
 *
 * Three-step progression (both views share the same data model):
 *   1. Price agreed and reserved  — automatic
 *   2. Pay reservation deposit    — buyer-only action
 *   3. Sign contract              — dual action: buyer AND developer each sign
 *
 * Role awareness: reads localStorage user.role to decide which UI branch
 * to render. Server-side access control in GET /api/deal/[offerId] is the
 * real enforcement — the role check here is UI-only.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/components/LocaleProvider";
import { EstimatedPriceNote, Money } from "@/components/Money";
import type { Messages } from "@/lib/i18n/messages";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SignatureRecord {
  signatureDataUrl: string;
  typedName: string;
  signedAt: string;
}

interface DealOffer {
  id: string;
  offeredPrice: number;
  counterPrice: number | null;
  terms: string;
  status: string;
  depositPaid: boolean;
  ledgerBlockHash: string | null;
  meetingLink: string | null;
  buyerSignature: string | null;       // JSON-encoded SignatureRecord | null
  developerSignature: string | null;   // JSON-encoded SignatureRecord | null
  contractEmailSentAt: string | null;
  createdAt: string;
  updatedAt: string;
  buyer: { email: string };
  developer: {
    email: string;
    name: string | null;
    developerProfile: { companyName: string } | null;
  };
  unitType: {
    unitLabel: string;
    price: number;
    ownerType: string;
    project: { name: string; location: string };
  };
}

function parseSig(raw: string | null): SignatureRecord | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function fmtDate(iso: string, locale?: string) {
  return new Date(iso).toLocaleDateString(locale === "he" ? "he-IL" : "en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
}

// ── Step icons ────────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ClockIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  );
}

// ── Step card ─────────────────────────────────────────────────────────────────

type StepState = "done" | "active" | "upcoming";

function Step({
  num, title, description, state, action, doneLabel,
}: {
  num: number;
  title: string;
  description: string;
  state: StepState;
  action?: React.ReactNode;
  doneLabel: string;
}) {
  const isDone   = state === "done";
  const isActive = state === "active";

  return (
    <div style={{
      display: "flex", gap: "1rem", padding: "1.125rem 1.375rem",
      background: isDone ? "#F0F6F5" : isActive ? "#fff" : "#FAFAF9",
      borderRadius: "0.625rem",
      border: `1px solid ${isDone ? "#B8D4D3" : isActive ? "#D4DED8" : "#EDEBE7"}`,
      opacity: state === "upcoming" ? 0.6 : 1,
    }}>
      <div style={{
        flexShrink: 0, width: 32, height: 32, borderRadius: "50%",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: isDone ? "#123F40" : isActive ? "#756039" : "#E8E4DF",
        marginTop: 2,
      }}>
        {isDone
          ? <CheckIcon />
          : <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: isActive ? "#fff" : "#526563" }}>{num}</span>
        }
      </div>
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: "0.9375rem", fontWeight: 600,
          color: isDone ? "#123F40" : isActive ? "#123F40" : "#526563",
          marginBottom: "0.2rem", fontFamily: "var(--font-inter, sans-serif)",
        }}>
          {title}
        </div>
        <div style={{ fontSize: "0.8125rem", color: "#526563", lineHeight: 1.5 }}>
          {description}
        </div>
        {action && <div style={{ marginTop: "0.875rem" }}>{action}</div>}
      </div>
      <div style={{ flexShrink: 0, display: "flex", alignItems: "flex-start", paddingTop: 6 }}>
        {isDone && (
          <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "#123F40", background: "#D4EDEA", borderRadius: 999, padding: "0.15rem 0.5rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {doneLabel}
          </span>
        )}
        {isActive && <ClockIcon color="#756039" />}
      </div>
    </div>
  );
}

// ── Ledger disclosure widget ──────────────────────────────────────────────────

function LedgerDisclosure({ hash, m }: { hash: string; m: Messages }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ textAlign: "center", fontSize: "0.75rem", color: "#526563" }}>
      <div style={{ color: "#123F40", fontWeight: 600, marginBottom: "0.25rem" }}>
        ✓ {m.deal.ledgerRecorded}
      </div>
      <details style={{ display: "inline-block" }}>
        <summary style={{ cursor: "pointer", color: "#526563", fontSize: "0.6875rem" }}>
          {m.deal.ledgerDetails}
        </summary>
        <div style={{ marginTop: "0.375rem", fontFamily: "monospace", fontSize: "0.6875rem", color: "#7A7570", display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "center" }}>
          <span>{hash}</span>
          <button
            type="button"
            onClick={() => { navigator.clipboard.writeText(hash).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#526563", padding: "0 0.25rem", fontSize: "0.6875rem" }}
          >
            {copied ? m.deal.ledgerCopied : "⧉"}
          </button>
        </div>
      </details>
    </div>
  );
}

// ── Signature modal ───────────────────────────────────────────────────────────

function SignatureModal({
  offer,
  role,
  finalPrice,
  companyName,
  onClose,
  onSigned,
}: {
  offer: DealOffer;
  role: string;
  finalPrice: number;
  companyName: string;
  onClose: () => void;
  onSigned: () => void;
}) {
  const { formatPrice, m, locale } = useI18n();
  const canvasRef       = useRef<HTMLCanvasElement>(null);
  const isDrawingRef    = useRef(false);
  const [typedName,   setTypedName]   = useState("");
  const [checked,     setChecked]     = useState(false);
  const [hasDrawn,    setHasDrawn]    = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState("");

  // Initialise canvas context once the modal is in the DOM.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = "#123F40";
    ctx.lineWidth   = 2;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
  }, []);

  // ── Drawing helpers ──────────────────────────────────────────────────────

  function getXY(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    const r = canvas.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const { x, y } = getXY(canvas, e.clientX, e.clientY);
    isDrawingRef.current = true;
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const { x, y } = getXY(canvas, e.clientX, e.clientY);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasDrawn) setHasDrawn(true);
  }

  function onMouseUp() { isDrawingRef.current = false; }
  function onMouseLeave() { isDrawingRef.current = false; }

  function onTouchStart(e: React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const t = e.touches[0];
    const { x, y } = getXY(canvas, t.clientX, t.clientY);
    isDrawingRef.current = true;
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function onTouchMove(e: React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const t = e.touches[0];
    const { x, y } = getXY(canvas, t.clientX, t.clientY);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasDrawn) setHasDrawn(true);
  }

  function onTouchEnd() { isDrawingRef.current = false; }

  function clearCanvas() {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }

  // ── Contract text ────────────────────────────────────────────────────────

  const contractText = [
    ...(locale === "he" ? [m.deal.contractDraftNote, ""] : []),
    m.deal.contractHeader,
    "",
    `${m.deal.contractBuyerLabel}  ${offer.buyer.email}`,
    `${m.deal.contractDevLabel}  ${companyName} (${offer.developer.email})`,
    "",
    `${m.deal.contractPropertyLabel}  ${offer.unitType.project.name}, ${offer.unitType.project.location}`,
    `${m.deal.contractUnitLabel}  ${offer.unitType.unitLabel}`,
    `${m.deal.contractPriceLabel}  ${formatPrice(finalPrice)}`,
    `${m.deal.contractDepositLabel}  ${m.deal.contractDepositPaid}`,
    "",
    m.deal.contractBody,
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    m.deal.contractDisclaimer,
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  ].join("\n");

  // ── Submit ───────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasDrawn || !typedName.trim() || !checked || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const signatureDataUrl = canvasRef.current!.toDataURL("image/png");
      const token = localStorage.getItem("token") ?? "";
      const res = await fetch(`/api/deal/${offer.id}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ signatureDataUrl, typedName: typedName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? m.deal.signingFailed); return; }
      onSigned();
    } catch {
      setError(m.deal.networkError);
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = hasDrawn && typedName.trim().length > 0 && checked && !submitting;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1rem",
        overflowY: "auto",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#fff", borderRadius: "1rem", width: "100%", maxWidth: "34rem",
        boxShadow: "0 32px 64px -24px rgba(18,51,50,0.4)",
        display: "flex", flexDirection: "column", maxHeight: "90vh", overflow: "hidden",
      }}>
        {/* Modal header */}
        <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid #E9EEEA", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "var(--font-heebo, sans-serif)", fontWeight: 600, fontSize: "1.125rem", color: "#123F40" }}>
              {m.deal.contractTitle}
            </div>
            <div style={{ fontSize: "0.8125rem", color: "#526563", marginTop: "0.125rem" }}>
              {m.deal.signingAs} <strong style={{ color: "#123F40" }}>{role === "buyer" ? m.nav.roleBuyer : role === "seller" ? m.nav.roleSeller : m.nav.roleDeveloper}</strong>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#526563", padding: "0.25rem", lineHeight: 0 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem", padding: "1.5rem" }}>

            {/* Contract text */}
            <div>
              <div style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#526563", marginBottom: "0.5rem" }}>
                {m.deal.agreementText}
              </div>
              <pre style={{
                fontFamily: "var(--font-heebo, sans-serif)",
                fontSize: "0.75rem",
                lineHeight: 1.7,
                color: "#123F40",
                background: "#F5F3EE",
                borderRadius: "0.5rem",
                padding: "1rem",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                margin: 0,
                border: "1px solid #E0DDD7",
              }}>
                {contractText}
              </pre>
            </div>

            {/* Full legal name */}
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#55534C", marginBottom: "0.4rem" }}>
                {m.deal.legalName} <span style={{ color: "#9E3434" }}>*</span>
              </label>
              <input
                type="text"
                required
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder={m.deal.legalNamePh}
                style={{
                  width: "100%", background: "#F5F3EE", border: "1.5px solid #E0DDD7",
                  borderRadius: "0.625rem", padding: "0.75rem 1rem",
                  fontSize: "0.9375rem", color: "#123F40", outline: "none", boxSizing: "border-box",
                }}
                onFocus={(e) => { e.target.style.borderColor = "#123F40"; e.target.style.boxShadow = "0 0 0 3px rgba(31,75,74,0.12)"; }}
                onBlur={(e) => { e.target.style.borderColor = "#E0DDD7"; e.target.style.boxShadow = "none"; }}
              />
            </div>

            {/* Signature pad */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#55534C" }}>
                  {m.deal.drawSignature} <span style={{ color: "#9E3434" }}>*</span>
                </label>
                <button
                  type="button"
                  onClick={clearCanvas}
                  style={{ fontSize: "0.75rem", fontWeight: 600, color: "#526563", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  {m.deal.clearSignature}
                </button>
              </div>
              <canvas
                ref={canvasRef}
                width={480}
                height={120}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseLeave}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                style={{
                  display: "block",
                  width: "100%",
                  height: 120,
                  background: "#F5F3EE",
                  border: `1.5px solid ${hasDrawn ? "#123F40" : "#E0DDD7"}`,
                  borderRadius: "0.625rem",
                  cursor: "crosshair",
                  touchAction: "none",
                }}
              />
              {!hasDrawn && (
                <p style={{ margin: "0.375rem 0 0", fontSize: "0.75rem", color: "#526563" }}>
                  {m.deal.signatureHint}
                </p>
              )}
            </div>

            {/* Confirmation checkbox */}
            <label style={{ display: "flex", alignItems: "flex-start", gap: "0.625rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                style={{ marginTop: "0.1rem", flexShrink: 0, accentColor: "#123F40", width: 16, height: 16 }}
              />
              <span style={{ fontSize: "0.875rem", color: "#55534C", lineHeight: 1.5 }}>
                {m.deal.confirmStatement}
              </span>
            </label>

            {/* Error */}
            {error && (
              <div style={{ background: "#FBECEA", border: "1px solid rgba(176,64,64,0.2)", borderRadius: "0.5rem", padding: "0.75rem 1rem", fontSize: "0.875rem", color: "#9E3434" }}>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                width: "100%", padding: "0.875rem", borderRadius: 999,
                fontSize: "0.9375rem", fontWeight: 600, color: "#fff",
                background: canSubmit ? "linear-gradient(155deg, #123F40, #123332)" : "rgba(31,75,74,0.35)",
                border: "none",
                cursor: canSubmit ? "pointer" : "not-allowed",
                boxShadow: canSubmit ? "0 10px 24px -10px rgba(18,51,50,0.55)" : "none",
                transition: "opacity 0.15s",
              }}
            >
              {submitting ? m.deal.signing : m.deal.submitSignature}
            </button>

          </form>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DealRoomPage() {
  const params = useParams();
  const { formatPrice, m, locale } = useI18n();
  const offerId = params.offerId as string;
  const router  = useRouter();

  const [offer,         setOffer]         = useState<DealOffer | null>(null);
  const [role,          setRole]          = useState<string>("buyer");
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState("");
  const [errorCode,     setErrorCode]     = useState(0);
  const [payingDeposit, setPayingDeposit] = useState(false);
  const [cancelling,    setCancelling]    = useState(false);
  const [cancelError,   setCancelError]   = useState("");
  const [pdfLoading,    setPdfLoading]    = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);

  // ── Data load ───────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const token = localStorage.getItem("token") ?? "";
    if (!token) { router.push("/login"); return; }

    try {
      const stored = localStorage.getItem("user");
      if (stored) setRole(JSON.parse(stored).role ?? "buyer");
    } catch { /* keep default */ }

    try {
      const res = await fetch(`/api/deal/${offerId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { router.push("/login"); return; }
      const data = await res.json();
      if (!res.ok) {
        setErrorCode(res.status);
        setError(data.error ?? m.deal.networkError);
        setLoading(false);
        return;
      }
      setOffer(data.offer);
    } catch {
      setError(m.deal.networkError);
    } finally {
      setLoading(false);
    }
  }, [offerId, router, m]);

  useEffect(() => { load(); }, [load]);

  // ── Actions ─────────────────────────────────────────────────────────────

  async function payDeposit() {
    if (!offer || offer.depositPaid || payingDeposit) return;
    setPayingDeposit(true);
    try {
      const token = localStorage.getItem("token") ?? "";
      const res = await fetch(`/api/deal/${offerId}/deposit`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setOffer(prev => prev ? { ...prev, depositPaid: true } : prev);
    } finally {
      setPayingDeposit(false);
    }
  }

  async function downloadPdf() {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const token = localStorage.getItem("token") ?? "";
      const res = await fetch(`/api/deal/${offerId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url;
      a.download = `deal-summary-${offerId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setPdfLoading(false);
    }
  }

  // Called by the modal after a successful signature submission.
  function handleSigned() {
    setShowSignModal(false);
    // Reload deal data to get fresh signature fields.
    setLoading(true);
    load();
  }

  // ── Loading ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", background: "#F4F5F0", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "2rem", height: "2rem", borderRadius: "50%", border: "2px solid rgba(18,63,64,0.08)", borderTopColor: "#123F40", animation: "spin 0.9s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </main>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────

  if (error) {
    const backHref = role === "developer" ? "/dev/dashboard" : role === "seller" ? "/seller/dashboard" : errorCode === 403 ? "/buyer/offers" : "/";
    return (
      <main style={{ minHeight: "100vh", background: "#F4F5F0", fontFamily: "var(--font-inter, sans-serif)", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
        <div style={{ maxWidth: "28rem", width: "100%", textAlign: "center" }}>
          <div style={{ width: "3.5rem", height: "3.5rem", borderRadius: "50%", background: "#FBECEA", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.25rem" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9E3434" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h1 style={{ fontFamily: "var(--font-heebo, sans-serif)", fontSize: "1.375rem", fontWeight: 600, color: "#123F40", margin: "0 0 0.5rem" }}>
            {errorCode === 403 ? m.deal.accessDenied : m.deal.notFound}
          </h1>
          <p style={{ color: "#526563", fontSize: "0.9375rem", margin: "0 0 1.5rem", lineHeight: 1.6 }}>
            {error}
          </p>
          <Link href={backHref} style={{ display: "inline-block", padding: "0.625rem 1.5rem", borderRadius: 999, background: "#123F40", color: "#fff", fontSize: "0.875rem", fontWeight: 600, textDecoration: "none" }}>
            {m.deal.backToDashboard}
          </Link>
        </div>
      </main>
    );
  }

  if (!offer) return null;

  // ── Derived values ──────────────────────────────────────────────────────

  const finalPrice   = offer.counterPrice ?? offer.offeredPrice;
  const companyName  = offer.unitType.ownerType === "seller"
    ? (offer.developer.name || offer.developer.email)
    : (offer.developer.developerProfile?.companyName ?? offer.developer.email);
  const dateAccepted = fmtDate(offer.updatedAt, locale);

  const buyerSig     = parseSig(offer.buyerSignature);
  const developerSig = parseSig(offer.developerSignature);
  const bothSigned   = !!(buyerSig && developerSig);

  // ── Step states ─────────────────────────────────────────────────────────

  const step1: StepState = "done";
  const step2: StepState = offer.depositPaid ? "done" : "active";
  // Step 3 (sign contract): only unlocked after deposit; done when both have signed.
  const step3: StepState = !offer.depositPaid ? "upcoming" : bothSigned ? "done" : "active";

  // ── Step 2 action — buyer-only interactive deposit button ───────────────

  const depositAction = role !== "buyer" ? (
    // Developer read-only view
    <span style={{ fontSize: "0.8125rem", color: "#756039", fontWeight: 600 }}>
      {offer.depositPaid ? m.deal.paidByBuyer : m.deal.waitingBuyer}
    </span>
  ) : step2 === "active" ? (
    <button
      onClick={payDeposit}
      disabled={payingDeposit}
      style={{
        padding: "0.5rem 1.25rem", borderRadius: 999, border: "none",
        background: "#756039", color: "#fff", fontSize: "0.875rem", fontWeight: 600,
        cursor: payingDeposit ? "not-allowed" : "pointer",
        opacity: payingDeposit ? 0.7 : 1,
      }}
    >
      {payingDeposit ? m.deal.processing : m.deal.payDeposit}
    </button>
  ) : undefined;

  // ── Step 3 action — dual signing status + button ────────────────────────

  const isBuyer       = role === "buyer";
  const mySig         = isBuyer ? buyerSig     : developerSig;
  const otherSig      = isBuyer ? developerSig : buyerSig;
  const otherLabel    = isBuyer ? m.nav.roleDeveloper : m.nav.roleBuyer;

  const signAction = step3 === "upcoming" ? undefined : (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>

      {/* Own signing row */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", flexWrap: "wrap" }}>
        {mySig ? (
          <span style={{ fontSize: "0.8125rem", color: "#123F40", fontWeight: 600 }}>
            ✓ {isBuyer ? m.offers.signedByBuyer : m.offers.signedByDev}: <em>{mySig.typedName}</em> · {fmtDate(mySig.signedAt, locale)}
          </span>
        ) : (
          <button
            onClick={() => setShowSignModal(true)}
            style={{
              padding: "0.5rem 1.125rem", borderRadius: 999, border: "none",
              background: "#123F40", color: "#fff", fontSize: "0.875rem", fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {m.deal.contractTitle}
          </button>
        )}
      </div>

      {/* Counterpart row */}
      <div style={{ fontSize: "0.8125rem", color: "#526563" }}>
        {otherSig
          ? <span style={{ color: "#123F40", fontWeight: 600 }}>✓ {otherLabel}: <em>{otherSig.typedName}</em> · {fmtDate(otherSig.signedAt, locale)}</span>
          : <span>{m.offers.awaitingDev}</span>
        }
      </div>

    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      {showSignModal && (
        <SignatureModal
          offer={offer}
          role={role}
          finalPrice={finalPrice}
          companyName={companyName}
          onClose={() => setShowSignModal(false)}
          onSigned={handleSigned}
        />
      )}

      <main style={{ minHeight: "100vh", background: "#F4F5F0", fontFamily: "var(--font-inter, sans-serif)", paddingBottom: "4rem" }}>
        <style>{`
          @media (max-width: 640px) {
            .hn-deal-summary-grid { grid-template-columns: 1fr !important; }
            .hn-deal-summary-grid > div { border-right: none !important; border-bottom: 1px solid #E9EEEA !important; }
          }
        `}</style>

        {/* Header */}
        <div style={{ borderBottom: "1px solid #D4DED8", background: "#fff" }}>
          <div style={{ maxWidth: "75rem", margin: "0 auto", padding: "1.5rem" }}>
            <div style={{ fontFamily: "var(--font-heebo, sans-serif)", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "#123F40", marginBottom: "0.5rem" }}>
              Haveniq
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
              <div>
                <h1 style={{ fontFamily: "var(--font-heebo, sans-serif)", fontSize: "1.875rem", fontWeight: 600, color: "#123F40", margin: 0 }}>
                  {m.deal.step1}
                </h1>
                <p style={{ margin: "0.375rem 0 0", color: "#526563", fontSize: "0.9375rem" }}>
                  {offer.unitType.project.name} — {offer.unitType.unitLabel}
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                {role === "developer" ? (
                  <Link href="/dev/dashboard" style={{ fontSize: "0.875rem", color: "#526563", fontWeight: 500, textDecoration: "none" }}>
                    {m.deal.backToDashboard}
                  </Link>
                ) : role === "seller" ? (
                  <Link href="/seller/dashboard" style={{ fontSize: "0.875rem", color: "#526563", fontWeight: 500, textDecoration: "none" }}>
                    {m.deal.backToDashboard}
                  </Link>
                ) : (
                  <Link href="/buyer/offers" style={{ fontSize: "0.875rem", color: "#526563", fontWeight: 500, textDecoration: "none" }}>
                    {m.deal.myOffers}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: "75rem", margin: "0 auto", padding: "2rem 1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>

          {/* Status card */}
          <div style={{ background: "#fff", borderRadius: "0.875rem", border: "1px solid #B8D4D3", borderTop: "4px solid #123F40", overflow: "hidden" }}>
            <div style={{ padding: "1.5rem 1.75rem" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.625rem", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "var(--font-heebo, sans-serif)", fontSize: "1.25rem", fontWeight: 600, color: "#123F40" }}>
                      {m.deal.step1}
                    </span>
                    <span style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.2rem 0.75rem", borderRadius: 999, background: "#D4EDEA", color: "#123F40", border: "1px solid #B8D4D3" }}>
                      {m.dev.statusReserved}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.9375rem", color: "#526563" }}>
                    {offer.unitType.project.name} · {offer.unitType.project.location}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "0.6875rem", color: "#526563", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem" }}>
                    {m.offers.finalPrice}
                  </div>
                  <div style={{ fontFamily: "var(--font-heebo, sans-serif)", fontSize: "2rem", fontWeight: 600, color: "#123F40", fontVariantNumeric: "tabular-nums" }}>
                    {formatPrice(finalPrice)}
                    <EstimatedPriceNote />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Summary table */}
          <div style={{ background: "#fff", borderRadius: "0.875rem", border: "1px solid #D4DED8", overflow: "hidden" }}>
            <div style={{ padding: "1rem 1.5rem 0.5rem", borderBottom: "1px solid #E9EEEA" }}>
              <div style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#526563" }}>{m.deal.step1}</div>
            </div>
            <div className="hn-deal-summary-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
              {([
                [m.profile.email,       offer.buyer.email,         false],
                [offer.unitType.ownerType === "seller" ? m.seller.registerTitle : m.dev.companyNameLabel, companyName, false],
                [m.offers.finalPrice,   formatPrice(finalPrice),   true],
                [m.results.timeline,    dateAccepted,              false],
              ] as [string, string, boolean][]).map(([label, value, isPrice], i) => (
                <div key={label} style={{ padding: "1rem 1.5rem", borderBottom: i < 2 ? "1px solid #E9EEEA" : undefined, borderRight: i % 2 === 0 ? "1px solid #E9EEEA" : undefined }}>
                  <div style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#526563", marginBottom: "0.3rem" }}>
                    {label}
                  </div>
                  <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#123F40", fontFamily: isPrice ? "var(--font-heebo, sans-serif)" : undefined, fontVariantNumeric: isPrice ? "tabular-nums" : undefined }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Checklist */}
          <div style={{ background: "#fff", borderRadius: "0.875rem", border: "1px solid #D4DED8", overflow: "hidden" }}>
            <div style={{ padding: "1rem 1.5rem 0.75rem", borderBottom: "1px solid #E9EEEA" }}>
              <div style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#526563" }}>
                {(role === "developer" || role === "seller") ? m.deal.dealStatus : m.deal.whatNext}
              </div>
            </div>
            <div style={{ padding: "1rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>

              <Step
                num={1}
                state={step1}
                title={m.deal.step1}
                description={m.deal.step2Desc}
                doneLabel={m.deal.done}
              />

              <Step
                num={2}
                state={step2}
                title={m.deal.step2}
                description={m.deal.step2Desc}
                action={depositAction}
                doneLabel={m.deal.done}
              />

              <Step
                num={3}
                state={step3}
                title={m.deal.step3}
                description={m.deal.step3Desc}
                action={signAction}
                doneLabel={m.deal.done}
              />

            </div>
          </div>

          {role === "buyer" && offer.status === "accepted" && !bothSigned && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.5rem" }}>
              <button
                type="button"
                disabled={cancelling}
                onClick={async () => {
                  if (!window.confirm(m.deal.cancelHoldConfirm)) return;
                  setCancelling(true);
                  setCancelError("");
                  try {
                    const token = localStorage.getItem("token") ?? "";
                    const res = await fetch(`/api/offers/${offerId}/cancel`, {
                      method: "POST",
                      headers: { Authorization: `Bearer ${token}` },
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      setCancelError(data.error ?? m.deal.cancelError);
                      return;
                    }
                    router.push("/buyer/offers");
                  } finally {
                    setCancelling(false);
                  }
                }}
                style={{
                  padding: "0.55rem 1.125rem",
                  borderRadius: 999,
                  border: "1px solid #E7C9C9",
                  background: "#fff",
                  color: "#8C3030",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: cancelling ? "wait" : "pointer",
                }}
              >
                {m.deal.cancelHold}
              </button>
              {cancelError && <p style={{ margin: 0, color: "#9E3434", fontSize: "0.8125rem" }}>{cancelError}</p>}
            </div>
          )}

          {/* Video call */}
          {offer.meetingLink && (
            <div style={{ background: "#fff", borderRadius: "0.875rem", border: "1px solid #D4DED8", overflow: "hidden" }}>
              <div style={{ padding: "1rem 1.5rem 0.75rem", borderBottom: "1px solid #E9EEEA" }}>
                <div style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#526563" }}>{m.deal.meetingLink}</div>
              </div>
              <div style={{ padding: "1rem 1.5rem", display: "flex", alignItems: "center", gap: "0.875rem", flexWrap: "wrap" }}>
                <a
                  href={offer.meetingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.5rem 1.125rem", borderRadius: 999, background: "#123F40", color: "#fff", fontSize: "0.875rem", fontWeight: 600, textDecoration: "none" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                  </svg>
                  {m.offers.joinCall}
                </a>
                <span style={{ fontSize: "0.8125rem", color: "#526563" }}>{m.deal.meetingLink}</span>
              </div>
            </div>
          )}

          {/* Documents */}
          <div style={{ background: "#fff", borderRadius: "0.875rem", border: "1px solid #D4DED8", overflow: "hidden" }}>
            <div style={{ padding: "1rem 1.5rem 0.75rem", borderBottom: "1px solid #E9EEEA" }}>
              <div style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#526563" }}>{m.deal.downloadPdf}</div>
            </div>
            <div style={{ padding: "1rem 1.5rem" }}>
              <button
                onClick={downloadPdf}
                disabled={pdfLoading}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.625rem 1.25rem", borderRadius: "0.5rem", border: "1px solid #D4DED8", background: "#fff", color: "#123F40", fontSize: "0.875rem", fontWeight: 600, cursor: pdfLoading ? "not-allowed" : "pointer", opacity: pdfLoading ? 0.7 : 1 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#123F40" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="18" x2="12" y2="12"/>
                  <polyline points="9 15 12 18 15 15"/>
                </svg>
                {m.deal.downloadPdf}
              </button>
              <p style={{ margin: "0.5rem 0 0", fontSize: "0.8125rem", color: "#526563" }}>{m.deal.pdfNote}</p>
            </div>
          </div>

          {/* Ledger reference */}
          {offer.ledgerBlockHash && (
            <LedgerDisclosure hash={offer.ledgerBlockHash} m={m} />
          )}

        </div>
      </main>
    </>
  );
}
