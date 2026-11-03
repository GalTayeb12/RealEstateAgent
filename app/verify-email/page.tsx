"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type Status = "verifying" | "success" | "expired" | "already_used" | "invalid" | "error";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [status, setStatus] = useState<Status>("verifying");
  const [resendEmail, setResendEmail] = useState("");
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  useEffect(() => {
    if (!token) { setStatus("invalid"); return; }

    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) { setStatus("success"); return; }
        if (data.reason === "expired")      { setStatus("expired");      return; }
        if (data.reason === "already_used") { setStatus("already_used"); return; }
        setStatus("invalid");
      })
      .catch(() => setStatus("error"));
  }, [token]);

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    setResendState("sending");
    await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: resendEmail }),
    });
    setResendState("sent");
  }

  // ── shared shell ───────────────────────────────────────────────────────────
  const shell = (children: React.ReactNode) => (
    <div style={{ minHeight: "100vh", background: "#F4F5F0", display: "flex", flexDirection: "column" }}>
      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1.5rem", position: "relative", zIndex: 1 }}>
        <div style={{ width: "100%", maxWidth: 440 }}>
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid rgba(18,63,64,0.08)", boxShadow: "0 2px 4px rgba(18,63,64,0.04), 0 24px 48px -20px rgba(18,51,50,0.14)", overflow: "hidden" }}>
            <div style={{ height: 4, background: "linear-gradient(90deg, #0C3031, #123332)" }} />
            <div style={{ padding: "2.5rem 2.5rem 2.75rem" }}>{children}</div>
          </div>
        </div>
      </main>
    </div>
  );

  // ── verifying ──────────────────────────────────────────────────────────────
  if (status === "verifying") return shell(
    <div style={{ textAlign: "center", color: "#526563" }}>
      <div style={{ width: 40, height: 40, border: "3px solid #E0DDD7", borderTopColor: "#0C3031", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 1.5rem" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <p style={{ margin: 0, fontSize: "0.9375rem" }}>Verifying your email…</p>
    </div>
  );

  // ── success ────────────────────────────────────────────────────────────────
  if (status === "success") return shell(
    <>
      <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(47,102,100,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0C3031" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      </div>
      <h1 style={{ fontFamily: "var(--font-fraunces), serif", fontWeight: 500, fontSize: "1.75rem", lineHeight: 1.2, letterSpacing: "0", margin: "0 0 0.75rem", color: "#123F40", textAlign: "center" }}>Email verified</h1>
      <p style={{ margin: "0 0 2rem", fontSize: "0.9375rem", color: "#526563", lineHeight: 1.6, textAlign: "center" }}>Your email address has been confirmed. You can now sign in to your account.</p>
      <Link href="/login" style={{ display: "block", textAlign: "center", padding: "0.875rem", borderRadius: 999, fontSize: "0.9375rem", fontWeight: 600, color: "#fff", background: "linear-gradient(155deg, #0C3031, #123332)", textDecoration: "none", boxShadow: "0 1px 0 rgba(255,255,255,0.15) inset, 0 10px 24px -10px rgba(18,51,50,0.55)" }}>
        Sign in →
      </Link>
    </>
  );

  // ── already used ───────────────────────────────────────────────────────────
  if (status === "already_used") return shell(
    <>
      <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(200,155,60,0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#756039" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
      </div>
      <h1 style={{ fontFamily: "var(--font-fraunces), serif", fontWeight: 500, fontSize: "1.75rem", lineHeight: 1.2, letterSpacing: "0", margin: "0 0 0.75rem", color: "#123F40", textAlign: "center" }}>Already verified</h1>
      <p style={{ margin: "0 0 2rem", fontSize: "0.9375rem", color: "#526563", lineHeight: 1.6, textAlign: "center" }}>This link has already been used. Your email is verified — go ahead and sign in.</p>
      <Link href="/login" style={{ display: "block", textAlign: "center", padding: "0.875rem", borderRadius: 999, fontSize: "0.9375rem", fontWeight: 600, color: "#fff", background: "linear-gradient(155deg, #0C3031, #123332)", textDecoration: "none", boxShadow: "0 1px 0 rgba(255,255,255,0.15) inset, 0 10px 24px -10px rgba(18,51,50,0.55)" }}>
        Sign in →
      </Link>
    </>
  );

  // ── expired or invalid — show resend form ──────────────────────────────────
  const isExpired = status === "expired";
  return shell(
    <>
      <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#FBECEA", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9E3434" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
      </div>
      <h1 style={{ fontFamily: "var(--font-fraunces), serif", fontWeight: 500, fontSize: "1.75rem", lineHeight: 1.2, letterSpacing: "0", margin: "0 0 0.75rem", color: "#123F40", textAlign: "center" }}>
        {isExpired ? "Link expired" : "Invalid link"}
      </h1>
      <p style={{ margin: "0 0 2rem", fontSize: "0.9375rem", color: "#526563", lineHeight: 1.6, textAlign: "center" }}>
        {isExpired
          ? "This verification link expired after 24 hours. Enter your email below to receive a fresh one."
          : "This verification link is not valid. Enter your email below to receive a new one."}
      </p>

      {resendState === "sent" ? (
        <div style={{ background: "#F0F7F0", border: "1px solid rgba(47,102,100,0.2)", borderRadius: 10, padding: "1rem 1.25rem", textAlign: "center", fontSize: "0.9375rem", color: "#0C3031" }}>
          If that account exists and is unverified, a new verification link has been sent.
        </div>
      ) : (
        <form onSubmit={handleResend} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#55534C", marginBottom: "0.5rem" }}>Email address</label>
            <input
              type="email"
              required
              value={resendEmail}
              onChange={(e) => setResendEmail(e.target.value)}
              placeholder="you@example.com"
              style={{ width: "100%", background: "#F5F3EE", border: "1.5px solid #E0DDD7", borderRadius: 10, padding: "0.75rem 1rem", fontSize: "0.9375rem", color: "#123F40", outline: "none", boxSizing: "border-box" }}
              onFocus={(e) => { e.target.style.borderColor = "#123F40"; e.target.style.boxShadow = "0 0 0 3px rgba(31,75,74,0.12)"; }}
              onBlur={(e) => { e.target.style.borderColor = "#E0DDD7"; e.target.style.boxShadow = "none"; }}
            />
          </div>
          <button
            type="submit"
            disabled={resendState === "sending"}
            style={{ width: "100%", padding: "0.875rem", borderRadius: 999, fontSize: "0.9375rem", fontWeight: 600, color: "#fff", background: resendState === "sending" ? "rgba(31,75,74,0.6)" : "linear-gradient(155deg, #0C3031, #123332)", border: "none", cursor: resendState === "sending" ? "not-allowed" : "pointer", boxShadow: resendState === "sending" ? "none" : "0 1px 0 rgba(255,255,255,0.15) inset, 0 10px 24px -10px rgba(18,51,50,0.55)" }}
          >
            {resendState === "sending" ? "Sending…" : "Send new verification link"}
          </button>
        </form>
      )}

      <p style={{ textAlign: "center", fontSize: "0.875rem", color: "#526563", margin: "1.5rem 0 0" }}>
        <Link href="/login" style={{ color: "#123F40", fontWeight: 600, textDecoration: "none" }}>Back to sign in</Link>
      </p>
    </>
  );
}
