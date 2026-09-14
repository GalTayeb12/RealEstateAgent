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

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
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
  num, title, description, state, action,
}: {
  num: number;
  title: string;
  description: string;
  state: StepState;
  action?: React.ReactNode;
}) {
  const isDone   = state === "done";
  const isActive = state === "active";

  return (
    <div style={{
      display: "flex", gap: "1rem", padding: "1.125rem 1.375rem",
      background: isDone ? "#F0F6F5" : isActive ? "#fff" : "#FAFAF9",
      borderRadius: "0.625rem",
      border: `1px solid ${isDone ? "#B8D4D3" : isActive ? "#DDD9D3" : "#EDEBE7"}`,
      opacity: state === "upcoming" ? 0.6 : 1,
    }}>
      <div style={{
        flexShrink: 0, width: 32, height: 32, borderRadius: "50%",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: isDone ? "#1F4B4A" : isActive ? "#C89B3C" : "#E8E4DF",
        marginTop: 2,
      }}>
        {isDone
          ? <CheckIcon />
          : <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: isActive ? "#fff" : "#9A958F" }}>{num}</span>
        }
      </div>
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: "0.9375rem", fontWeight: 700,
          color: isDone ? "#1F4B4A" : isActive ? "#1C1B19" : "#6B6860",
          marginBottom: "0.2rem", fontFamily: "var(--font-inter, sans-serif)",
        }}>
          {title}
        </div>
        <div style={{ fontSize: "0.8125rem", color: "#9A958F", lineHeight: 1.5 }}>
          {description}
        </div>
        {action && <div style={{ marginTop: "0.875rem" }}>{action}</div>}
      </div>
      <div style={{ flexShrink: 0, display: "flex", alignItems: "flex-start", paddingTop: 6 }}>
        {isDone && (
          <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#1F4B4A", background: "#D4EDEA", borderRadius: 999, padding: "0.15rem 0.5rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Done
          </span>
        )}
        {isActive && <ClockIcon color="#C89B3C" />}
      </div>
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
    ctx.strokeStyle = "#1C1B19";
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
    "PROPERTY RESERVATION AGREEMENT — SIMULATION",
    "",
    `Buyer:     ${offer.buyer.email}`,
    `Developer: ${companyName} (${offer.developer.email})`,
    "",
    `Property:  ${offer.unitType.project.name}, ${offer.unitType.project.location}`,
    `Unit:      ${offer.unitType.unitLabel}`,
    `Agreed price: £${finalPrice.toLocaleString("en-GB")}`,
    `Reservation deposit: Paid ✓`,
    "",
    "Both parties confirm their intention to proceed to legal completion of this sale, to be carried out in person with instructed solicitors.",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "DISCLAIMER: This document is a simulation for demonstration purposes only and does not constitute a legally binding contract or any form of legal commitment.",
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
      if (!res.ok) { setError(data.error ?? "Signing failed — please try again."); return; }
      onSigned();
    } catch {
      setError("Network error — please try again.");
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
        <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid #F0EDE8", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "var(--font-fraunces, serif)", fontWeight: 700, fontSize: "1.125rem", color: "#1C1B19" }}>
              Sign contract
            </div>
            <div style={{ fontSize: "0.8125rem", color: "#9A958F", marginTop: "0.125rem" }}>
              Signing as: <strong style={{ color: "#1C1B19" }}>{role === "buyer" ? "Buyer" : role === "seller" ? "Seller" : "Developer"}</strong>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#9A958F", padding: "0.25rem", lineHeight: 0 }}
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
              <div style={{ fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9A958F", marginBottom: "0.5rem" }}>
                Agreement text
              </div>
              <pre style={{
                fontFamily: "var(--font-jetbrains, monospace)",
                fontSize: "0.75rem",
                lineHeight: 1.7,
                color: "#1C1B19",
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
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#55534C", marginBottom: "0.4rem" }}>
                Full legal name <span style={{ color: "#B04040" }}>*</span>
              </label>
              <input
                type="text"
                required
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder="Type your full legal name"
                style={{
                  width: "100%", background: "#F5F3EE", border: "1.5px solid #E0DDD7",
                  borderRadius: "0.625rem", padding: "0.75rem 1rem",
                  fontSize: "0.9375rem", color: "#1C1B19", outline: "none", boxSizing: "border-box",
                }}
                onFocus={(e) => { e.target.style.borderColor = "#1F4B4A"; e.target.style.boxShadow = "0 0 0 3px rgba(31,75,74,0.12)"; }}
                onBlur={(e) => { e.target.style.borderColor = "#E0DDD7"; e.target.style.boxShadow = "none"; }}
              />
            </div>

            {/* Signature pad */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#55534C" }}>
                  Draw your signature <span style={{ color: "#B04040" }}>*</span>
                </label>
                <button
                  type="button"
                  onClick={clearCanvas}
                  style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6B6860", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  Clear
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
                  border: `1.5px solid ${hasDrawn ? "#1F4B4A" : "#E0DDD7"}`,
                  borderRadius: "0.625rem",
                  cursor: "crosshair",
                  touchAction: "none",
                }}
              />
              {!hasDrawn && (
                <p style={{ margin: "0.375rem 0 0", fontSize: "0.75rem", color: "#9A958F" }}>
                  Use your mouse or finger to draw your signature above.
                </p>
              )}
            </div>

            {/* Confirmation checkbox */}
            <label style={{ display: "flex", alignItems: "flex-start", gap: "0.625rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                style={{ marginTop: "0.1rem", flexShrink: 0, accentColor: "#1F4B4A", width: 16, height: 16 }}
              />
              <span style={{ fontSize: "0.875rem", color: "#55534C", lineHeight: 1.5 }}>
                I confirm the above and am signing this document on my own behalf.
              </span>
            </label>

            {/* Error */}
            {error && (
              <div style={{ background: "#FAE8E8", border: "1px solid rgba(176,64,64,0.2)", borderRadius: "0.5rem", padding: "0.75rem 1rem", fontSize: "0.875rem", color: "#B04040" }}>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                width: "100%", padding: "0.875rem", borderRadius: 999,
                fontSize: "0.9375rem", fontWeight: 700, color: "#fff",
                background: canSubmit ? "linear-gradient(155deg, #1F4B4A, #123332)" : "rgba(31,75,74,0.35)",
                border: "none",
                cursor: canSubmit ? "pointer" : "not-allowed",
                boxShadow: canSubmit ? "0 10px 24px -10px rgba(18,51,50,0.55)" : "none",
                transition: "opacity 0.15s",
              }}
            >
              {submitting ? "Signing…" : "Submit signature"}
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
  const offerId = params.offerId as string;
  const router  = useRouter();

  const [offer,         setOffer]         = useState<DealOffer | null>(null);
  const [role,          setRole]          = useState<string>("buyer");
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState("");
  const [errorCode,     setErrorCode]     = useState(0);
  const [payingDeposit, setPayingDeposit] = useState(false);
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
        setError(data.error ?? "Failed to load deal data.");
        setLoading(false);
        return;
      }
      setOffer(data.offer);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }, [offerId, router]);

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
      <main style={{ minHeight: "100vh", background: "#F7F5F1", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "2rem", height: "2rem", borderRadius: "50%", border: "2px solid rgba(28,27,25,0.08)", borderTopColor: "#1F4B4A", animation: "spin 0.9s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </main>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────

  if (error) {
    const backHref = role === "developer" ? "/dev/dashboard" : role === "seller" ? "/seller/dashboard" : errorCode === 403 ? "/buyer/offers" : "/";
    return (
      <main style={{ minHeight: "100vh", background: "#F7F5F1", fontFamily: "var(--font-inter, sans-serif)", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
        <div style={{ maxWidth: "28rem", width: "100%", textAlign: "center" }}>
          <div style={{ width: "3.5rem", height: "3.5rem", borderRadius: "50%", background: "#FAE8E8", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.25rem" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#B04040" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h1 style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1.375rem", fontWeight: 700, color: "#1C1B19", margin: "0 0 0.5rem" }}>
            {errorCode === 403 ? "Access denied" : "Deal not found"}
          </h1>
          <p style={{ color: "#6B6860", fontSize: "0.9375rem", margin: "0 0 1.5rem", lineHeight: 1.6 }}>
            {error}
          </p>
          <Link href={backHref} style={{ display: "inline-block", padding: "0.625rem 1.5rem", borderRadius: 999, background: "#1F4B4A", color: "#fff", fontSize: "0.875rem", fontWeight: 700, textDecoration: "none" }}>
            ← Back to dashboard
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
  const dateAccepted = fmtDate(offer.updatedAt);

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
    <span style={{ fontSize: "0.8125rem", color: "#C89B3C", fontWeight: 600 }}>
      {offer.depositPaid ? "Paid by buyer" : "Waiting on buyer"}
    </span>
  ) : step2 === "active" ? (
    <button
      onClick={payDeposit}
      disabled={payingDeposit}
      style={{
        padding: "0.5rem 1.25rem", borderRadius: 999, border: "none",
        background: "#C89B3C", color: "#fff", fontSize: "0.875rem", fontWeight: 700,
        cursor: payingDeposit ? "not-allowed" : "pointer",
        opacity: payingDeposit ? 0.7 : 1,
      }}
    >
      {payingDeposit ? "Processing…" : "Pay deposit (simulation)"}
    </button>
  ) : undefined;

  // ── Step 3 action — dual signing status + button ────────────────────────

  const isBuyer       = role === "buyer";
  const mySig         = isBuyer ? buyerSig     : developerSig;
  const otherSig      = isBuyer ? developerSig : buyerSig;
  const otherLabel    = isBuyer ? "Developer"  : "Buyer";

  const signAction = step3 === "upcoming" ? undefined : (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>

      {/* Own signing row */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", flexWrap: "wrap" }}>
        {mySig ? (
          <span style={{ fontSize: "0.8125rem", color: "#1F4B4A", fontWeight: 600 }}>
            ✓ You signed as <em>{mySig.typedName}</em> on {fmtDate(mySig.signedAt)}
          </span>
        ) : (
          <button
            onClick={() => setShowSignModal(true)}
            style={{
              padding: "0.5rem 1.125rem", borderRadius: 999, border: "none",
              background: "#1F4B4A", color: "#fff", fontSize: "0.875rem", fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Sign contract
          </button>
        )}
      </div>

      {/* Counterpart row */}
      <div style={{ fontSize: "0.8125rem", color: "#9A958F" }}>
        {otherSig
          ? <span style={{ color: "#1F4B4A", fontWeight: 600 }}>✓ {otherLabel} signed as <em>{otherSig.typedName}</em> on {fmtDate(otherSig.signedAt)}</span>
          : <span>Waiting for {otherLabel} to sign</span>
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

      <main style={{ minHeight: "100vh", background: "#F7F5F1", fontFamily: "var(--font-inter, sans-serif)", paddingBottom: "4rem" }}>
        <style>{`
          @media (max-width: 640px) {
            .hn-deal-summary-grid { grid-template-columns: 1fr !important; }
            .hn-deal-summary-grid > div { border-right: none !important; border-bottom: 1px solid #F0EDE8 !important; }
          }
        `}</style>

        {/* Header */}
        <div style={{ borderBottom: "1px solid #DDD9D3", background: "#fff" }}>
          <div style={{ maxWidth: "52rem", margin: "0 auto", padding: "1.5rem" }}>
            <div style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "#1F4B4A", marginBottom: "0.5rem" }}>
              Haveniq
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
              <div>
                <h1 style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1.875rem", fontWeight: 700, color: "#1C1B19", margin: 0 }}>
                  Deal Room
                </h1>
                <p style={{ margin: "0.375rem 0 0", color: "#6B6860", fontSize: "0.9375rem" }}>
                  {offer.unitType.project.name} — {offer.unitType.unitLabel}
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                {role === "developer" ? (
                  <Link href="/dev/dashboard" style={{ fontSize: "0.875rem", color: "#6B6860", fontWeight: 500, textDecoration: "none" }}>
                    ← Dashboard
                  </Link>
                ) : role === "seller" ? (
                  <Link href="/seller/dashboard" style={{ fontSize: "0.875rem", color: "#6B6860", fontWeight: 500, textDecoration: "none" }}>
                    ← Dashboard
                  </Link>
                ) : (
                  <Link href="/buyer/offers" style={{ fontSize: "0.875rem", color: "#6B6860", fontWeight: 500, textDecoration: "none" }}>
                    ← My offers
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: "52rem", margin: "0 auto", padding: "2rem 1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>

          {/* Status card */}
          <div style={{ background: "#fff", borderRadius: "0.875rem", border: "1px solid #B8D4D3", borderTop: "4px solid #1F4B4A", overflow: "hidden" }}>
            <div style={{ padding: "1.5rem 1.75rem" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.625rem", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1.25rem", fontWeight: 700, color: "#1C1B19" }}>
                      Deal accepted
                    </span>
                    <span style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.2rem 0.75rem", borderRadius: 999, background: "#D4EDEA", color: "#1F4B4A", border: "1px solid #B8D4D3" }}>
                      Reserved
                    </span>
                  </div>
                  <div style={{ fontSize: "0.9375rem", color: "#6B6860" }}>
                    {offer.unitType.project.name} · {offer.unitType.project.location}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "0.6875rem", color: "#6B6860", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem" }}>
                    Final price
                  </div>
                  <div style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "2rem", fontWeight: 700, color: "#1F4B4A" }}>
                    £{finalPrice.toLocaleString("en-GB")}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Summary table */}
          <div style={{ background: "#fff", borderRadius: "0.875rem", border: "1px solid #DDD9D3", overflow: "hidden" }}>
            <div style={{ padding: "1rem 1.5rem 0.5rem", borderBottom: "1px solid #F0EDE8" }}>
              <div style={{ fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9A958F" }}>Deal summary</div>
            </div>
            <div className="hn-deal-summary-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
              {([
                ["Buyer",               offer.buyer.email],
                [offer.unitType.ownerType === "seller" ? "Seller" : "Developer / company", companyName],
                ["Agreed price",        `£${finalPrice.toLocaleString("en-GB")}`],
                ["Date agreed",         dateAccepted],
              ] as [string, string][]).map(([label, value], i) => (
                <div key={label} style={{ padding: "1rem 1.5rem", borderBottom: i < 2 ? "1px solid #F0EDE8" : undefined, borderRight: i % 2 === 0 ? "1px solid #F0EDE8" : undefined }}>
                  <div style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9A958F", marginBottom: "0.3rem" }}>
                    {label}
                  </div>
                  <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#1C1B19", fontFamily: label === "Agreed price" ? "var(--font-jetbrains, monospace)" : undefined }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Checklist */}
          <div style={{ background: "#fff", borderRadius: "0.875rem", border: "1px solid #DDD9D3", overflow: "hidden" }}>
            <div style={{ padding: "1rem 1.5rem 0.75rem", borderBottom: "1px solid #F0EDE8" }}>
              <div style={{ fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9A958F" }}>
                {(role === "developer" || role === "seller") ? "Deal status" : "What happens next"}
              </div>
            </div>
            <div style={{ padding: "1rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>

              <Step
                num={1}
                state={step1}
                title="Price agreed and reserved"
                description="Both parties have agreed the final price. The property is now reserved."
              />

              <Step
                num={2}
                state={step2}
                title={role === "buyer" ? "Pay reservation deposit" : "Reservation deposit"}
                description={
                  role === "buyer"
                    ? "A reservation deposit secures the property while contracts are prepared. This is a simulation — no real payment is processed."
                    : offer.depositPaid
                      ? "The buyer has paid the reservation deposit."
                      : "Waiting on the buyer to pay the reservation deposit."
                }
                action={depositAction}
              />

              <Step
                num={3}
                state={step3}
                title="Sign contract"
                description={
                  bothSigned
                    ? "Both parties have signed. The deal is confirmed — proceed to completion with your solicitors."
                    : "Both the buyer and developer must sign to confirm the deal. Signing is a simulation only."
                }
                action={signAction}
              />

            </div>
          </div>

          {/* Video call */}
          {offer.meetingLink && (
            <div style={{ background: "#fff", borderRadius: "0.875rem", border: "1px solid #DDD9D3", overflow: "hidden" }}>
              <div style={{ padding: "1rem 1.5rem 0.75rem", borderBottom: "1px solid #F0EDE8" }}>
                <div style={{ fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9A958F" }}>Video call</div>
              </div>
              <div style={{ padding: "1rem 1.5rem", display: "flex", alignItems: "center", gap: "0.875rem", flexWrap: "wrap" }}>
                <a
                  href={offer.meetingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.5rem 1.125rem", borderRadius: 999, background: "#1F4B4A", color: "#fff", fontSize: "0.875rem", fontWeight: 700, textDecoration: "none" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                  </svg>
                  Join call
                </a>
                <span style={{ fontSize: "0.8125rem", color: "#9A958F" }}>A video call was set up as part of this deal.</span>
              </div>
            </div>
          )}

          {/* Documents */}
          <div style={{ background: "#fff", borderRadius: "0.875rem", border: "1px solid #DDD9D3", overflow: "hidden" }}>
            <div style={{ padding: "1rem 1.5rem 0.75rem", borderBottom: "1px solid #F0EDE8" }}>
              <div style={{ fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9A958F" }}>Documents</div>
            </div>
            <div style={{ padding: "1rem 1.5rem" }}>
              <button
                onClick={downloadPdf}
                disabled={pdfLoading}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.625rem 1.25rem", borderRadius: "0.5rem", border: "1px solid #DDD9D3", background: "#fff", color: "#1C1B19", fontSize: "0.875rem", fontWeight: 600, cursor: pdfLoading ? "not-allowed" : "pointer", opacity: pdfLoading ? 0.7 : 1 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1F4B4A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="18" x2="12" y2="12"/>
                  <polyline points="9 15 12 18 15 15"/>
                </svg>
                {pdfLoading ? "Generating…" : "Deal summary.pdf"}
              </button>
              <p style={{ margin: "0.5rem 0 0", fontSize: "0.8125rem", color: "#9A958F" }}>Summarises all deal details for your records.</p>
            </div>
          </div>

          {/* Ledger reference */}
          {offer.ledgerBlockHash && (
            <div style={{ textAlign: "center", fontSize: "0.75rem", color: "#9A958F" }}>
              Recorded on ledger:{" "}
              <span style={{ fontFamily: "var(--font-jetbrains, monospace)" }}>
                {offer.ledgerBlockHash.slice(0, 20)}…
              </span>
            </div>
          )}

        </div>
      </main>
    </>
  );
}
