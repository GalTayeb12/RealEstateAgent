"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Set when server returns EMAIL_NOT_VERIFIED — shows the resend banner.
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setUnverifiedEmail(null);
    setResendState("idle");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.status === 403 && data.code === "EMAIL_NOT_VERIFIED") {
        setUnverifiedEmail(data.email ?? form.email);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Login failed");
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      if (data.user.role === "developer") {
        const meRes = await fetch("/api/dev/me", {
          headers: { Authorization: `Bearer ${data.token}` },
        });
        const me = await meRes.json();
        if (me.crnStatus === "approved") {
          router.push("/dev/dashboard");
        } else if (me.crnStatus === "rejected") {
          router.push("/dev/rejected");
        } else {
          router.push("/dev/pending");
        }
      } else if (data.user.role === "seller") {
        router.push("/seller/dashboard");
      } else {
        router.push("/transition");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!unverifiedEmail || resendState !== "idle") return;
    setResendState("sending");
    await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: unverifiedEmail }),
    });
    setResendState("sent");
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
        <Link href="/register" style={{ textDecoration: "none", fontSize: "0.875rem", fontWeight: 600, color: "#55534C" }}>
          No account? <span style={{ color: "#1F4B4A" }}>Register →</span>
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
                  Welcome back
                </h1>
                <p style={{ margin: 0, fontSize: "0.9375rem", color: "#6B6860", lineHeight: 1.5 }}>
                  Sign in to continue to your account.
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
                    autoComplete="current-password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="••••••••"
                    style={{ width: "100%", background: "#F5F3EE", border: "1.5px solid #E0DDD7", borderRadius: 10, padding: "0.75rem 1rem", fontSize: "1rem", color: "#1C1B19", outline: "none", boxSizing: "border-box", transition: "border-color 0.15s, box-shadow 0.15s" }}
                    onFocus={(e) => { e.target.style.borderColor = "#1F4B4A"; e.target.style.boxShadow = "0 0 0 3px rgba(31,75,74,0.12)"; }}
                    onBlur={(e) => { e.target.style.borderColor = "#E0DDD7"; e.target.style.boxShadow = "none"; }}
                  />
                </div>

                {/* Generic error */}
                {error && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", background: "#FAE8E8", border: "1px solid rgba(176,64,64,0.2)", borderRadius: 10, padding: "0.75rem 1rem" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#B04040", flexShrink: 0 }}>Error</span>
                    <span style={{ fontSize: "0.875rem", color: "#B04040" }}>{error}</span>
                  </div>
                )}

                {/* Email-not-verified banner */}
                {unverifiedEmail && (
                  <div style={{ background: "#FEF9EC", border: "1px solid rgba(200,155,60,0.35)", borderRadius: 10, padding: "1rem 1.125rem" }}>
                    <p style={{ margin: "0 0 0.625rem", fontSize: "0.875rem", color: "#7A5C00", lineHeight: 1.5 }}>
                      <strong>Please verify your email first.</strong> Check your inbox for a verification link.
                    </p>
                    {resendState === "sent" ? (
                      <p style={{ margin: 0, fontSize: "0.8125rem", color: "#2F6664", fontWeight: 600 }}>New verification email sent — check your inbox.</p>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResend}
                        disabled={resendState === "sending"}
                        style={{ background: "none", border: "none", padding: 0, fontSize: "0.8125rem", fontWeight: 700, color: "#1F4B4A", cursor: resendState === "sending" ? "not-allowed" : "pointer", textDecoration: "underline" }}
                      >
                        {resendState === "sending" ? "Sending…" : "Resend verification email →"}
                      </button>
                    )}
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  style={{ width: "100%", padding: "0.875rem", borderRadius: 999, fontSize: "0.9375rem", fontWeight: 700, color: "#fff", background: loading ? "rgba(31,75,74,0.6)" : "linear-gradient(155deg, #2F6664, #123332)", border: "none", cursor: loading ? "not-allowed" : "pointer", boxShadow: loading ? "none" : "0 1px 0 rgba(255,255,255,0.15) inset, 0 10px 24px -10px rgba(18,51,50,0.55)", transition: "opacity 0.15s, box-shadow 0.15s" }}
                  onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.opacity = "0.92"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
                >
                  {loading ? "Signing in…" : "Sign in"}
                </button>
              </form>

              {/* Forgot password */}
              <p style={{ textAlign: "center", fontSize: "0.875rem", color: "#6B6860", margin: "1.25rem 0 0" }}>
                <Link href="/forgot-password" style={{ color: "#1F4B4A", fontWeight: 600, textDecoration: "none" }}>
                  Forgot password?
                </Link>
              </p>

              {/* Footer link */}
              <p style={{ textAlign: "center", fontSize: "0.875rem", color: "#6B6860", margin: "0.75rem 0 0" }}>
                No account?{" "}
                <Link href="/register" style={{ color: "#1F4B4A", fontWeight: 600, textDecoration: "none" }}>
                  Create one
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
