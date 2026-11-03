"use client";
import { useState } from "react";
import Link from "next/link";

export default function SellerRegisterPage() {
  const [form, setForm] = useState({ name: "", phone: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
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
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--qp-bg)", display: "flex", flexDirection: "column" }}>

      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1.5rem", position: "relative", zIndex: 1 }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          <div style={{ background: "var(--qp-surface)", borderRadius: 20, border: "1px solid rgba(18,63,64,0.08)", boxShadow: "0 2px 4px rgba(18,63,64,0.04), 0 24px 48px -20px rgba(18,51,50,0.14)", overflow: "hidden" }}>
            <div style={{ height: 4, background: "linear-gradient(90deg, var(--qp-primary-hover), var(--qp-ink))" }} />
            <div style={{ padding: "2.5rem 2.5rem 2.75rem" }}>

              {success ? (
                <div style={{ textAlign: "center" }}>
                  <div style={{ width: "3.5rem", height: "3.5rem", borderRadius: "50%", background: "var(--qp-soft)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.25rem" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--qp-ink)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <h1 style={{ fontFamily: "var(--font-heebo), sans-serif", fontWeight: 500, fontSize: "1.625rem", lineHeight: 1.2, letterSpacing: "0", margin: "0 0 0.75rem", color: "var(--qp-ink)" }}>
                    Check your inbox
                  </h1>
                  <p style={{ margin: "0 0 1.5rem", fontSize: "0.9375rem", color: "var(--qp-muted)", lineHeight: 1.6 }}>
                    We&apos;ve sent a verification link to <strong style={{ color: "var(--qp-ink)" }}>{form.email}</strong>. Click the link to activate your seller account.
                  </p>
                  <Link href="/login" style={{ display: "inline-block", padding: "0.75rem 1.5rem", borderRadius: 999, background: "var(--qp-ink)", color: "var(--qp-on-primary)", fontSize: "0.9375rem", fontWeight: 600, textDecoration: "none" }}>
                    Go to login →
                  </Link>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: "2rem" }}>
                    <h1 style={{ fontFamily: "var(--font-heebo), sans-serif", fontWeight: 500, fontSize: "2rem", lineHeight: 1.15, letterSpacing: "0", margin: "0 0 0.5rem", color: "var(--qp-ink)" }}>
                      List your property
                    </h1>
                    <p style={{ margin: 0, fontSize: "0.9375rem", color: "var(--qp-muted)", lineHeight: 1.5 }}>
                      Create a seller account to list your property on Haveniq.
                    </p>
                  </div>

                  <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--qp-muted)", marginBottom: "0.5rem" }}>
                        Full name
                      </label>
                      <input
                        type="text"
                        required
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="Jane Smith"
                        style={{ width: "100%", background: "var(--qp-soft)", border: "1.5px solid var(--qp-border)", borderRadius: 10, padding: "0.75rem 1rem", fontSize: "1rem", color: "var(--qp-ink)", outline: "none", boxSizing: "border-box" }}
                        onFocus={(e) => { e.target.style.borderColor = "var(--qp-ink)"; e.target.style.boxShadow = "0 0 0 3px rgba(31,75,74,0.12)"; }}
                        onBlur={(e) => { e.target.style.borderColor = "var(--qp-border)"; e.target.style.boxShadow = "none"; }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--qp-muted)", marginBottom: "0.5rem" }}>
                        Phone number
                      </label>
                      <input
                        type="tel"
                        required
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        placeholder="+44 7700 000000"
                        style={{ width: "100%", background: "var(--qp-soft)", border: "1.5px solid var(--qp-border)", borderRadius: 10, padding: "0.75rem 1rem", fontSize: "1rem", color: "var(--qp-ink)", outline: "none", boxSizing: "border-box" }}
                        onFocus={(e) => { e.target.style.borderColor = "var(--qp-ink)"; e.target.style.boxShadow = "0 0 0 3px rgba(31,75,74,0.12)"; }}
                        onBlur={(e) => { e.target.style.borderColor = "var(--qp-border)"; e.target.style.boxShadow = "none"; }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--qp-muted)", marginBottom: "0.5rem" }}>
                        Email address
                      </label>
                      <input
                        type="email"
                        required
                        autoComplete="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        placeholder="you@example.com"
                        style={{ width: "100%", background: "var(--qp-soft)", border: "1.5px solid var(--qp-border)", borderRadius: 10, padding: "0.75rem 1rem", fontSize: "1rem", color: "var(--qp-ink)", outline: "none", boxSizing: "border-box" }}
                        onFocus={(e) => { e.target.style.borderColor = "var(--qp-ink)"; e.target.style.boxShadow = "0 0 0 3px rgba(31,75,74,0.12)"; }}
                        onBlur={(e) => { e.target.style.borderColor = "var(--qp-border)"; e.target.style.boxShadow = "none"; }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--qp-muted)", marginBottom: "0.5rem" }}>
                        Password
                      </label>
                      <input
                        type="password"
                        required
                        autoComplete="new-password"
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        placeholder="••••••••"
                        style={{ width: "100%", background: "var(--qp-soft)", border: "1.5px solid var(--qp-border)", borderRadius: 10, padding: "0.75rem 1rem", fontSize: "1rem", color: "var(--qp-ink)", outline: "none", boxSizing: "border-box" }}
                        onFocus={(e) => { e.target.style.borderColor = "var(--qp-ink)"; e.target.style.boxShadow = "0 0 0 3px rgba(31,75,74,0.12)"; }}
                        onBlur={(e) => { e.target.style.borderColor = "var(--qp-border)"; e.target.style.boxShadow = "none"; }}
                      />
                    </div>

                    {error && (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", background: "var(--qp-error-bg)", border: "1px solid rgba(176,64,64,0.2)", borderRadius: 10, padding: "0.75rem 1rem" }}>
                        <span style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--qp-error)", flexShrink: 0 }}>Error</span>
                        <span style={{ fontSize: "0.875rem", color: "var(--qp-error)" }}>{error}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      style={{ width: "100%", padding: "0.875rem", borderRadius: 999, fontSize: "0.9375rem", fontWeight: 600, color: "var(--qp-on-primary)", background: loading ? "rgba(31,75,74,0.6)" : "var(--qp-ink)", border: "none", cursor: loading ? "not-allowed" : "pointer", boxShadow: loading ? "none" : "0 1px 0 rgba(255,255,255,0.15) inset, 0 10px 24px -10px rgba(18,51,50,0.55)" }}
                    >
                      {loading ? "Creating account…" : "Create seller account"}
                    </button>
                  </form>

                  <p style={{ textAlign: "center", fontSize: "0.875rem", color: "var(--qp-muted)", margin: "1.25rem 0 0" }}>
                    Already have an account?{" "}
                    <Link href="/login" style={{ color: "var(--qp-ink)", fontWeight: 600, textDecoration: "none" }}>
                      Sign in
                    </Link>
                  </p>
                </>
              )}
            </div>
          </div>

          <p style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--qp-muted)", marginTop: "1.5rem" }}>
            Haveniq — prototype v0.1
          </p>
        </div>
      </main>
    </div>
  );
}
