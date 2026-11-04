"use client";
import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/LocaleProvider";
import { TextField, Button } from "@/components/quiet";
import { AuthAside, AuthRoom, translateAuthError } from "@/components/auth/Room";

export default function SellerRegisterPage() {
  const { m } = useI18n();
  const [form, setForm] = useState({ name: "", phone: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/seller/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Registration failed");
      setSuccess(true);
    } catch (err: unknown) {
      setError(translateAuthError(err instanceof Error ? err.message : "", m));
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <AuthRoom aside={<AuthAside href="/login" prompt={m.seller.alreadyAccount} action={m.auth.signIn} />}>
        <div style={{ textAlign: "center", display: "grid", gap: "1rem" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--qp-soft)", border: "1px solid var(--qp-border)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--qp-ink)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 500, margin: 0 }}>{m.seller.successTitle}</h1>
          <p className="qp-body">
            {m.seller.successBodyA}{" "}
            <strong style={{ color: "var(--qp-ink)" }} dir="ltr">{form.email}</strong>
            {m.seller.successBodyB}
          </p>
          <Link href="/login" className="qp-btn qp-btn--primary qp-btn--block" style={{ display: "flex" }}>
            {m.seller.goLogin}
          </Link>
        </div>
      </AuthRoom>
    );
  }

  return (
    <AuthRoom aside={<AuthAside href="/login" prompt={m.seller.alreadyAccount} action={m.auth.signIn} />}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 500, margin: 0 }}>{m.seller.registerTitle}</h1>
      <p className="qp-body">{m.seller.registerBody}</p>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "1rem" }}>
        <TextField label={m.seller.fullNameLabel} type="text" required placeholder={m.seller.fullNamePh}
          value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <TextField label={m.seller.phoneLabel} type="tel" required placeholder={m.seller.phonePh}
          value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        <TextField label={m.auth.email} type="email" required autoComplete="email"
          value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        <TextField label={m.auth.password} type="password" required autoComplete="new-password"
          placeholder={m.auth.passwordPh} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
        {error && <div className="qp-notice qp-notice--danger" role="alert">{error}</div>}
        <Button type="submit" className="qp-btn--block" disabled={loading}>
          {loading ? m.seller.submitting : m.seller.submit}
        </Button>
      </form>
    </AuthRoom>
  );
}
