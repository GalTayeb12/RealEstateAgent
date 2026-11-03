"use client";
import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/LocaleProvider";
import { TextField, Button } from "@/components/quiet";
import { AuthRoom } from "@/components/auth/Room";

export default function ForgotPasswordPage() {
  const { m } = useI18n();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    // Always show success — never leak whether email exists.
    setState("sent");
  }

  if (state === "sent") {
    return (
      <AuthRoom>
        <div style={{ textAlign: "center", display: "grid", gap: "1rem" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--qp-soft)", border: "1px solid var(--qp-border)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--qp-ink)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 500, margin: 0 }}>{m.auth.checkInbox}</h1>
          <p className="qp-body" style={{ textAlign: "center" }}>
            {m.auth.resetSent}
          </p>
          <Link href="/login" className="qp-btn qp-btn--primary qp-btn--block" style={{ display: "flex", justifyContent: "center" }}>
            {m.auth.backToSignIn}
          </Link>
        </div>
      </AuthRoom>
    );
  }

  return (
    <AuthRoom>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 500, margin: 0 }}>{m.auth.forgotTitle}</h1>
      <p className="qp-body">{m.auth.forgotBody}</p>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "1rem" }}>
        <TextField
          label={m.auth.email}
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" className="qp-btn--block" disabled={state === "sending"}>
          {state === "sending" ? m.auth.sending : m.auth.sendReset}
        </Button>
      </form>
      <p style={{ textAlign: "center", fontSize: "0.875rem", color: "var(--qp-muted)", margin: 0 }}>
        <Link href="/login" style={{ color: "var(--qp-ink)", fontWeight: 600, textDecoration: "none" }}>{m.auth.backToSignIn}</Link>
      </p>
    </AuthRoom>
  );
}
