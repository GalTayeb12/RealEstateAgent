"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/components/LocaleProvider";
import { TextField, Button } from "@/components/quiet";
import { AuthRoom } from "@/components/auth/Room";

type Status = "verifying" | "success" | "expired" | "already_used" | "invalid" | "error";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const { m } = useI18n();
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

  if (status === "verifying") {
    return (
      <AuthRoom>
        <div style={{ textAlign: "center", color: "var(--qp-muted)", display: "grid", gap: "1rem" }}>
          <div style={{ width: 40, height: 40, border: "3px solid var(--qp-border)", borderTopColor: "var(--qp-ink)", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <p style={{ margin: 0, fontSize: "0.9375rem" }}>{m.auth.verifying}</p>
        </div>
      </AuthRoom>
    );
  }

  if (status === "success") {
    return (
      <AuthRoom>
        <div style={{ textAlign: "center", display: "grid", gap: "1rem" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--qp-soft)", border: "1px solid var(--qp-border)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--qp-ink)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 500, margin: 0 }}>{m.auth.emailVerified}</h1>
          <p className="qp-body" style={{ textAlign: "center" }}>{m.auth.emailVerifiedBody}</p>
          <Link href="/login" className="qp-btn qp-btn--primary qp-btn--block" style={{ display: "flex", justifyContent: "center" }}>{m.auth.signIn} →</Link>
        </div>
      </AuthRoom>
    );
  }

  if (status === "already_used") {
    return (
      <AuthRoom>
        <div style={{ textAlign: "center", display: "grid", gap: "1rem" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--qp-warning-bg)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--qp-warning)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          </div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 500, margin: 0 }}>{m.auth.alreadyVerified}</h1>
          <p className="qp-body" style={{ textAlign: "center" }}>{m.auth.alreadyVerifiedBody}</p>
          <Link href="/login" className="qp-btn qp-btn--primary qp-btn--block" style={{ display: "flex", justifyContent: "center" }}>{m.auth.signIn} →</Link>
        </div>
      </AuthRoom>
    );
  }

  // expired or invalid — show resend form
  const isExpired = status === "expired";
  return (
    <AuthRoom>
      <div style={{ textAlign: "center", display: "grid", gap: "1rem" }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--qp-error-bg)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--qp-error)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
        </div>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 500, margin: 0 }}>
          {isExpired ? m.auth.linkExpiredTitle : m.auth.linkInvalidTitle}
        </h1>
        <p className="qp-body" style={{ textAlign: "center" }}>
          {isExpired ? m.auth.verifyExpiredBody : m.auth.verifyInvalidBody}
        </p>
      </div>

      {resendState === "sent" ? (
        <div className="qp-notice qp-notice--success">
          {m.auth.resendSentBody}
        </div>
      ) : (
        <form onSubmit={handleResend} style={{ display: "grid", gap: "1rem" }}>
          <TextField
            label={m.auth.email}
            type="email"
            required
            value={resendEmail}
            onChange={(e) => setResendEmail(e.target.value)}
          />
          <Button type="submit" className="qp-btn--block" disabled={resendState === "sending"}>
            {resendState === "sending" ? m.auth.sending : m.auth.sendNewVerification}
          </Button>
        </form>
      )}

      <p style={{ textAlign: "center", fontSize: "0.875rem", color: "var(--qp-muted)", margin: 0 }}>
        <Link href="/login" style={{ color: "var(--qp-ink)", fontWeight: 600, textDecoration: "none" }}>{m.auth.backToSignIn}</Link>
      </p>
    </AuthRoom>
  );
}
