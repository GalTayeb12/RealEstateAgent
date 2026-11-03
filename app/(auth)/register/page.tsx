"use client";
import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/LocaleProvider";
import { TextField, Button } from "@/components/quiet";
import { AuthAside, AuthRoom, translateAuthError } from "@/components/auth/Room";

export default function RegisterPage() {
  const { m } = useI18n();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, role: "buyer" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Registration failed");
      setRegisteredEmail(form.email);
      setRegistered(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      setError(translateAuthError(message, m));
    } finally {
      setLoading(false);
    }
  }

  if (registered) {
    return (
      <AuthRoom aside={<AuthAside href="/login" prompt={m.auth.haveAccount} action={m.auth.signIn} />}>
        <div style={{ textAlign: "center", display: "grid", gap: "1rem" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--qp-soft)", border: "1px solid var(--qp-border)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--qp-ink)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 500, margin: 0 }}>{m.auth.checkInbox}</h1>
          <p className="qp-body">{m.auth.sentTo}</p>
          <p className="qp-num" dir="ltr" style={{ color: "var(--qp-ink)", margin: 0, fontWeight: 500 }}>{registeredEmail}</p>
          <p className="qp-body">{m.auth.linkExpires}</p>
          <Link href="/login" className="qp-btn qp-btn--primary qp-btn--block" style={{ display: "flex" }}>{m.auth.goSignIn}</Link>
        </div>
      </AuthRoom>
    );
  }

  return (
    <AuthRoom aside={<AuthAside href="/login" prompt={m.auth.haveAccount} action={m.auth.signIn} />}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 500, margin: 0 }}>{m.auth.createAccount}</h1>
      <p className="qp-body">{m.auth.buyerBlurb}</p>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "1rem" }}>
        <TextField
          label={m.auth.email}
          type="email"
          required
          autoComplete="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <TextField
          label={m.auth.password}
          type="password"
          required
          autoComplete="new-password"
          placeholder={m.auth.passwordPh}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        {error && <div className="qp-notice qp-notice--danger" role="alert">{error}</div>}
        <Button type="submit" className="qp-btn--block" disabled={loading}>
          {loading ? m.auth.creating : m.auth.createAccount}
        </Button>
      </form>
      <p style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--qp-muted)", margin: 0 }}>
        {m.auth.consentBefore}{" "}
        <Link href="/terms" style={{ color: "var(--qp-ink)", fontWeight: 600, textDecoration: "none" }}>{m.auth.termsLink}</Link>
        {m.auth.consentJoin ? ` ${m.auth.consentJoin} ` : " "}
        <Link href="/privacy" style={{ color: "var(--qp-ink)", fontWeight: 600, textDecoration: "none" }}>{m.auth.privacyLink}</Link>.
      </p>
      <p style={{ textAlign: "center", fontSize: "0.875rem", color: "var(--qp-muted)", margin: 0 }}>
        {m.auth.haveAccount}{" "}
        <Link href="/login" style={{ color: "var(--qp-ink)", fontWeight: 600, textDecoration: "none" }}>{m.auth.signIn}</Link>
      </p>
      <p style={{ textAlign: "center", fontSize: "0.875rem", color: "var(--qp-muted)", margin: 0 }}>
        {m.auth.devPrompt}{" "}
        <Link href="/dev/register" style={{ color: "var(--qp-ink)", fontWeight: 600, textDecoration: "none" }}>{m.auth.devPortal}</Link>
      </p>
    </AuthRoom>
  );
}
