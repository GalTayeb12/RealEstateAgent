"use client";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/components/LocaleProvider";
import { TextField, Button } from "@/components/quiet";
import { AuthRoom } from "@/components/auth/Room";

type Status = "idle" | "submitting" | "success" | "invalid" | "expired" | "already_used" | "error";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { m } = useI18n();
  const token = searchParams.get("token") ?? "";

  const [status, setStatus] = useState<Status>("idle");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [matchError, setMatchError] = useState("");

  // Redirect to login 3 s after a successful reset.
  useEffect(() => {
    if (status !== "success") return;
    const t = setTimeout(() => router.push("/login?reset=1"), 3000);
    return () => clearTimeout(t);
  }, [status, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMatchError("");

    if (password !== confirm) {
      setMatchError(m.auth.passwordMismatch);
      return;
    }
    if (password.length < 8) {
      setMatchError(m.auth.passwordTooShort);
      return;
    }

    setStatus("submitting");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();

      if (data.ok) { setStatus("success"); return; }
      if (data.reason === "expired")      { setStatus("expired");      return; }
      if (data.reason === "already_used") { setStatus("already_used"); return; }
      setStatus("invalid");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <AuthRoom>
        <div style={{ textAlign: "center", display: "grid", gap: "1rem" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--qp-soft)", border: "1px solid var(--qp-border)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--qp-ink)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 500, margin: 0 }}>{m.auth.passwordUpdated}</h1>
          <p className="qp-body" style={{ textAlign: "center" }}>{m.auth.redirectingSignIn}</p>
          <Link href="/login" className="qp-btn qp-btn--primary qp-btn--block" style={{ display: "flex", justifyContent: "center" }}>{m.auth.signInNow}</Link>
        </div>
      </AuthRoom>
    );
  }

  if (status === "expired" || status === "already_used" || status === "invalid" || status === "error") {
    const isExpired = status === "expired";
    const isUsed    = status === "already_used";
    return (
      <AuthRoom>
        <div style={{ textAlign: "center", display: "grid", gap: "1rem" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--qp-error-bg)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--qp-error)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          </div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 500, margin: 0 }}>
            {isExpired ? m.auth.linkExpiredTitle : isUsed ? m.auth.linkUsedTitle : m.auth.linkInvalidTitle}
          </h1>
          <p className="qp-body" style={{ textAlign: "center" }}>
            {isExpired ? m.auth.linkExpiredBody : isUsed ? m.auth.linkUsedBody : m.auth.linkInvalidBody}
          </p>
          <Link href="/forgot-password" className="qp-btn qp-btn--primary qp-btn--block" style={{ display: "flex", justifyContent: "center" }}>{m.auth.requestNewLink}</Link>
          <p style={{ textAlign: "center", fontSize: "0.875rem", color: "var(--qp-muted)", margin: 0 }}>
            <Link href="/login" style={{ color: "var(--qp-ink)", fontWeight: 600, textDecoration: "none" }}>{m.auth.backToSignIn}</Link>
          </p>
        </div>
      </AuthRoom>
    );
  }

  return (
    <AuthRoom>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 500, margin: 0 }}>{m.auth.resetTitle}</h1>
      <p className="qp-body">{m.auth.resetBody}</p>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "1rem" }}>
        <TextField
          label={m.auth.newPassword}
          type="password"
          required
          autoComplete="new-password"
          value={password}
          placeholder={m.auth.passwordPh}
          onChange={(e) => setPassword(e.target.value)}
        />
        <TextField
          label={m.auth.confirmPassword}
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          placeholder={m.auth.passwordPh}
          onChange={(e) => setConfirm(e.target.value)}
          error={matchError}
        />
        <Button type="submit" className="qp-btn--block" disabled={status === "submitting"}>
          {status === "submitting" ? m.auth.updating : m.auth.updatePassword}
        </Button>
      </form>
      <p style={{ textAlign: "center", fontSize: "0.875rem", color: "var(--qp-muted)", margin: 0 }}>
        <Link href="/login" style={{ color: "var(--qp-ink)", fontWeight: 600, textDecoration: "none" }}>{m.auth.backToSignIn}</Link>
      </p>
    </AuthRoom>
  );
}
