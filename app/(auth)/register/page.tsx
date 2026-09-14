"use client";
import { useState } from "react";
import Link from "next/link";

export default function RegisterPage() {
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
      // Do NOT save token or redirect — user must verify email first.
      setRegisteredEmail(form.email);
      setRegistered(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  // ── Post-registration: verification pending ───────────────────────────────
  if (registered) {
    return (
      <div style={{ minHeight: "100vh", background: "#FAF8F4", display: "flex", flexDirection: "column" }}>
        <div style={{ position: "fixed", inset: 0, background: "radial-gradient(60% 40% at 80% 10%, rgba(47,102,100,0.07) 0%, transparent 60%), radial-gradient(40% 30% at 10% 80%, rgba(200,155,60,0.06) 0%, transparent 60%)", pointerEvents: "none", zIndex: 0 }} />
        <nav style={{ position: "relative", zIndex: 10, padding: "1.25rem 2.5rem" }}>
          <Link href="/" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.6rem" }}>
            <img src="/haveniq_logo_horizontal.png" alt="Haveniq" style={{ height: 26, width: "auto" }} />
          </Link>
        </nav>
        <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1.5rem", position: "relative", zIndex: 1 }}>
          <div style={{ width: "100%", maxWidth: 420 }}>
            <div style={{ background: "#fff", borderRadius: 20, border: "1px solid rgba(28,27,25,0.08)", boxShadow: "0 2px 4px rgba(28,27,25,0.04), 0 24px 48px -20px rgba(18,51,50,0.14)", overflow: "hidden" }}>
              <div style={{ height: 4, background: "linear-gradient(90deg, #2F6664, #123332)" }} />
              <div style={{ padding: "2.5rem 2.5rem 2.75rem", textAlign: "center" }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(47,102,100,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem" }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2F6664" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
                  </svg>
                </div>
                <h1 style={{ fontFamily: "var(--font-fraunces), serif", fontWeight: 800, fontSize: "1.75rem", lineHeight: 1.2, letterSpacing: "-0.02em", margin: "0 0 0.75rem", color: "#14130F" }}>Check your inbox</h1>
                <p style={{ margin: "0 0 0.5rem", fontSize: "0.9375rem", color: "#6B6860", lineHeight: 1.6 }}>
                  We sent a verification link to
                </p>
                <p style={{ margin: "0 0 1.75rem", fontSize: "0.9375rem", fontWeight: 700, color: "#1C1B19" }}>{registeredEmail}</p>
                <p style={{ margin: "0 0 2rem", fontSize: "0.875rem", color: "#6B6860", lineHeight: 1.6 }}>
                  Click the link in the email to activate your account. The link expires in 24 hours.
                </p>
                <Link href="/login" style={{ display: "block", padding: "0.875rem", borderRadius: 999, fontSize: "0.9375rem", fontWeight: 700, color: "#fff", background: "linear-gradient(155deg, #2F6664, #123332)", textDecoration: "none", boxShadow: "0 1px 0 rgba(255,255,255,0.15) inset, 0 10px 24px -10px rgba(18,51,50,0.55)" }}>
                  Go to sign in
                </Link>
              </div>
            </div>
            <p style={{ textAlign: "center", fontSize: "0.75rem", color: "#9A958F", marginTop: "1.5rem" }}>Haveniq — prototype v0.1</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#FAF8F4", display: "flex", flexDirection: "column" }}>

      {/* Subtle background glow — matches homepage hero */}
      <div style={{ position: "fixed", inset: 0, background: "radial-gradient(60% 40% at 80% 10%, rgba(47,102,100,0.07) 0%, transparent 60%), radial-gradient(40% 30% at 10% 80%, rgba(200,155,60,0.06) 0%, transparent 60%)", pointerEvents: "none", zIndex: 0 }} />

      {/* ── Minimal nav ─────────────────────────────────────────────────────── */}
      <nav style={{ position: "relative", zIndex: 10, padding: "1.25rem 2.5rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <img src="/haveniq_logo_horizontal.png" alt="Haveniq" style={{ height: 26, width: "auto" }} />
        </Link>
        <Link href="/login" style={{ textDecoration: "none", fontSize: "0.875rem", fontWeight: 600, color: "#55534C" }}>
          Have an account? <span style={{ color: "#1F4B4A" }}>Sign in →</span>
        </Link>
      </nav>

      {/* ── Card ────────────────────────────────────────────────────────────── */}
      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1.5rem", position: "relative", zIndex: 1 }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid rgba(28,27,25,0.08)", boxShadow: "0 2px 4px rgba(28,27,25,0.04), 0 24px 48px -20px rgba(18,51,50,0.14)", overflow: "hidden" }}>

            {/* Teal top accent */}
            <div style={{ height: 4, background: "linear-gradient(90deg, #2F6664, #123332)" }} />

            <div style={{ padding: "2.5rem 2.5rem 2.75rem" }}>

              {/* Heading */}
              <div style={{ marginBottom: "2rem" }}>
                <h1 style={{ fontFamily: "var(--font-fraunces), serif", fontWeight: 800, fontSize: "2rem", lineHeight: 1.15, letterSpacing: "-0.02em", margin: "0 0 0.5rem", color: "#14130F" }}>
                  Create your account
                </h1>
                <p style={{ margin: 0, fontSize: "0.9375rem", color: "#6B6860", lineHeight: 1.5 }}>
                  Register as a buyer to get matched with listed properties.
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

                {/* Email */}
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#55534C", marginBottom: "0.5rem" }}>
                    Email address
                  </label>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="you@example.com"
                    style={{ width: "100%", background: "#F5F3EE", border: "1.5px solid #E0DDD7", borderRadius: 10, padding: "0.75rem 1rem", fontSize: "1rem", color: "#1C1B19", outline: "none", boxSizing: "border-box", transition: "border-color 0.15s, box-shadow 0.15s" }}
                    onFocus={(e) => { e.target.style.borderColor = "#1F4B4A"; e.target.style.boxShadow = "0 0 0 3px rgba(31,75,74,0.12)"; }}
                    onBlur={(e) => { e.target.style.borderColor = "#E0DDD7"; e.target.style.boxShadow = "none"; }}
                  />
                </div>

                {/* Password */}
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#55534C", marginBottom: "0.5rem" }}>
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Choose a password"
                    style={{ width: "100%", background: "#F5F3EE", border: "1.5px solid #E0DDD7", borderRadius: 10, padding: "0.75rem 1rem", fontSize: "1rem", color: "#1C1B19", outline: "none", boxSizing: "border-box", transition: "border-color 0.15s, box-shadow 0.15s" }}
                    onFocus={(e) => { e.target.style.borderColor = "#1F4B4A"; e.target.style.boxShadow = "0 0 0 3px rgba(31,75,74,0.12)"; }}
                    onBlur={(e) => { e.target.style.borderColor = "#E0DDD7"; e.target.style.boxShadow = "none"; }}
                  />
                </div>

                {/* Error */}
                {error && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", background: "#FAE8E8", border: "1px solid rgba(176,64,64,0.2)", borderRadius: 10, padding: "0.75rem 1rem" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#B04040", flexShrink: 0 }}>Error</span>
                    <span style={{ fontSize: "0.875rem", color: "#B04040" }}>{error}</span>
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  style={{ width: "100%", padding: "0.875rem", borderRadius: 999, fontSize: "0.9375rem", fontWeight: 700, color: "#fff", background: loading ? "rgba(31,75,74,0.6)" : "linear-gradient(155deg, #2F6664, #123332)", border: "none", cursor: loading ? "not-allowed" : "pointer", boxShadow: loading ? "none" : "0 1px 0 rgba(255,255,255,0.15) inset, 0 10px 24px -10px rgba(18,51,50,0.55)", transition: "opacity 0.15s" }}
                  onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.opacity = "0.92"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
                >
                  {loading ? "Creating account…" : "Create account"}
                </button>
              </form>

              {/* Legal consent */}
              <p style={{ textAlign: "center", fontSize: "0.75rem", color: "#9A958F", margin: "1.25rem 0 0", lineHeight: 1.6 }}>
                By creating an account you agree to our{" "}
                <Link href="/terms" style={{ color: "#1F4B4A", fontWeight: 600, textDecoration: "none" }}>
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" style={{ color: "#1F4B4A", fontWeight: 600, textDecoration: "none" }}>
                  Privacy Policy
                </Link>
                .
              </p>

              {/* Footer links */}
              <p style={{ textAlign: "center", fontSize: "0.875rem", color: "#6B6860", margin: "1.75rem 0 0.625rem" }}>
                Already have an account?{" "}
                <Link href="/login" style={{ color: "#1F4B4A", fontWeight: 600, textDecoration: "none" }}>
                  Sign in
                </Link>
              </p>
              <p style={{ textAlign: "center", fontSize: "0.8125rem", color: "#9A958F", margin: 0 }}>
                Registering a development company?{" "}
                <Link href="/dev/register" style={{ color: "#1F4B4A", fontWeight: 600, textDecoration: "none" }}>
                  Developer portal →
                </Link>
              </p>
            </div>
          </div>

          <p style={{ textAlign: "center", fontSize: "0.75rem", color: "#9A958F", marginTop: "1.5rem" }}>
            Haveniq — prototype v0.1
          </p>
        </div>
      </main>
    </div>
  );
}
