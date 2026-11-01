"use client";
import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/LocaleProvider";
import { Button, GlassPanel, Input } from "@/components/ui";
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
        <GlassPanel className="hq-auth__card">
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: "1.75rem" }}>{m.auth.checkInbox}</h1>
            <p className="hq-lead">{m.auth.sentTo}</p>
            <p className="hq-num" dir="ltr" style={{ color: "var(--hq-ink)", margin: "0.6rem 0 1rem" }}>{registeredEmail}</p>
            <p className="hq-lead" style={{ marginBottom: "1.5rem" }}>{m.auth.linkExpires}</p>
            <Link href="/login" className="hq-btn hq-btn--primary hq-btn--block">{m.auth.goSignIn}</Link>
          </div>
        </GlassPanel>
      </AuthRoom>
    );
  }

  return (
    <AuthRoom aside={<AuthAside href="/login" prompt={m.auth.haveAccount} action={m.auth.signIn} />}>
      <GlassPanel className="hq-auth__card">
        <h1 style={{ fontSize: "2rem" }}>{m.auth.createAccount}</h1>
        <p className="hq-lead" style={{ marginBottom: "1.5rem" }}>{m.auth.buyerBlurb}</p>
        <form onSubmit={handleSubmit}>
          <Input
            label={m.auth.email}
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            label={m.auth.password}
            type="password"
            required
            autoComplete="new-password"
            placeholder={m.auth.passwordPh}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          {error && <div className="hq-note hq-note--danger" role="alert">{error}</div>}
          <Button type="submit" className="hq-btn--block" disabled={loading}>
            {loading ? m.auth.creating : m.auth.createAccount}
          </Button>
        </form>
        <p className="hq-auth__links" style={{ fontSize: "0.75rem" }}>
          {m.auth.consentBefore}{" "}
          <Link href="/terms">{m.auth.termsLink}</Link>
          {m.auth.consentJoin ? ` ${m.auth.consentJoin} ` : " "}
          <Link href="/privacy">{m.auth.privacyLink}</Link>.
        </p>
        <p className="hq-auth__links">
          {m.auth.haveAccount}{" "}
          <Link href="/login">{m.auth.signIn}</Link>
        </p>
        <p className="hq-auth__links">
          {m.auth.devPrompt}{" "}
          <Link href="/dev/register">{m.auth.devPortal}</Link>
        </p>
      </GlassPanel>
    </AuthRoom>
  );
}
