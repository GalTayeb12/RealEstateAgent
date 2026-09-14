"use client";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

type Status = "idle" | "submitting" | "success" | "invalid" | "expired" | "already_used" | "error";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
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
      setMatchError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setMatchError("Password must be at least 8 characters.");
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

  const shell = (children: React.ReactNode) => (
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
            <div style={{ padding: "2.5rem 2.5rem 2.75rem" }}>{children}</div>
          </div>
          <p style={{ textAlign: "center", fontSize: "0.75rem", color: "#9A958F", marginTop: "1.5rem" }}>Haveniq — prototype v0.1</p>
        </div>
      </main>
    </div>
  );

  // ── Success ────────────────────────────────────────────────────────────────
  if (status === "success") return shell(
    <>
      <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(47,102,100,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2F6664" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      </div>
      <h1 style={{ fontFamily: "var(--font-fraunces), serif", fontWeight: 800, fontSize: "1.75rem", lineHeight: 1.2, letterSpacing: "-0.02em", margin: "0 0 0.75rem", color: "#14130F", textAlign: "center" }}>Password updated</h1>
      <p style={{ margin: "0 0 2rem", fontSize: "0.9375rem", color: "#6B6860", lineHeight: 1.6, textAlign: "center" }}>
        Your password has been reset. Redirecting you to sign in…
      </p>
      <Link href="/login" style={{ display: "block", textAlign: "center", padding: "0.875rem", borderRadius: 999, fontSize: "0.9375rem", fontWeight: 700, color: "#fff", background: "linear-gradient(155deg, #2F6664, #123332)", textDecoration: "none", boxShadow: "0 1px 0 rgba(255,255,255,0.15) inset, 0 10px 24px -10px rgba(18,51,50,0.55)" }}>
        Sign in now →
      </Link>
    </>
  );

  // ── Token errors ───────────────────────────────────────────────────────────
  if (status === "expired" || status === "already_used" || status === "invalid" || status === "error") {
    const isExpired = status === "expired";
    const isUsed    = status === "already_used";
    return shell(
      <>
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#FAE8E8", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#B04040" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
        </div>
        <h1 style={{ fontFamily: "var(--font-fraunces), serif", fontWeight: 800, fontSize: "1.75rem", lineHeight: 1.2, letterSpacing: "-0.02em", margin: "0 0 0.75rem", color: "#14130F", textAlign: "center" }}>
          {isExpired ? "Link expired" : isUsed ? "Link already used" : "Invalid link"}
        </h1>
        <p style={{ margin: "0 0 2rem", fontSize: "0.9375rem", color: "#6B6860", lineHeight: 1.6, textAlign: "center" }}>
          {isExpired
            ? "This reset link expired after 1 hour."
            : isUsed
            ? "This reset link has already been used."
            : "This reset link is not valid."}
          {" "}Request a new one from the forgot-password page.
        </p>
        <Link href="/forgot-password" style={{ display: "block", textAlign: "center", padding: "0.875rem", borderRadius: 999, fontSize: "0.9375rem", fontWeight: 700, color: "#fff", background: "linear-gradient(155deg, #2F6664, #123332)", textDecoration: "none", boxShadow: "0 1px 0 rgba(255,255,255,0.15) inset, 0 10px 24px -10px rgba(18,51,50,0.55)" }}>
          Request new reset link
        </Link>
        <p style={{ textAlign: "center", fontSize: "0.875rem", color: "#6B6860", margin: "1.25rem 0 0" }}>
          <Link href="/login" style={{ color: "#1F4B4A", fontWeight: 600, textDecoration: "none" }}>Back to sign in</Link>
        </p>
      </>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return shell(
    <>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontFamily: "var(--font-fraunces), serif", fontWeight: 800, fontSize: "2rem", lineHeight: 1.15, letterSpacing: "-0.02em", margin: "0 0 0.5rem", color: "#14130F" }}>Reset password</h1>
        <p style={{ margin: 0, fontSize: "0.9375rem", color: "#6B6860", lineHeight: 1.5 }}>Choose a new password for your account.</p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div>
          <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#55534C", marginBottom: "0.5rem" }}>New password</label>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            style={{ width: "100%", background: "#F5F3EE", border: "1.5px solid #E0DDD7", borderRadius: 10, padding: "0.75rem 1rem", fontSize: "1rem", color: "#1C1B19", outline: "none", boxSizing: "border-box", transition: "border-color 0.15s, box-shadow 0.15s" }}
            onFocus={(e) => { e.target.style.borderColor = "#1F4B4A"; e.target.style.boxShadow = "0 0 0 3px rgba(31,75,74,0.12)"; }}
            onBlur={(e) => { e.target.style.borderColor = "#E0DDD7"; e.target.style.boxShadow = "none"; }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#55534C", marginBottom: "0.5rem" }}>Confirm new password</label>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repeat your password"
            style={{ width: "100%", background: "#F5F3EE", border: `1.5px solid ${matchError ? "#B04040" : "#E0DDD7"}`, borderRadius: 10, padding: "0.75rem 1rem", fontSize: "1rem", color: "#1C1B19", outline: "none", boxSizing: "border-box", transition: "border-color 0.15s, box-shadow 0.15s" }}
            onFocus={(e) => { e.target.style.borderColor = "#1F4B4A"; e.target.style.boxShadow = "0 0 0 3px rgba(31,75,74,0.12)"; }}
            onBlur={(e) => { e.target.style.borderColor = matchError ? "#B04040" : "#E0DDD7"; e.target.style.boxShadow = "none"; }}
          />
          {matchError && <p style={{ margin: "0.375rem 0 0", fontSize: "0.8125rem", color: "#B04040" }}>{matchError}</p>}
        </div>

        <button
          type="submit"
          disabled={status === "submitting"}
          style={{ width: "100%", padding: "0.875rem", borderRadius: 999, fontSize: "0.9375rem", fontWeight: 700, color: "#fff", background: status === "submitting" ? "rgba(31,75,74,0.6)" : "linear-gradient(155deg, #2F6664, #123332)", border: "none", cursor: status === "submitting" ? "not-allowed" : "pointer", boxShadow: status === "submitting" ? "none" : "0 1px 0 rgba(255,255,255,0.15) inset, 0 10px 24px -10px rgba(18,51,50,0.55)", transition: "opacity 0.15s" }}
          onMouseEnter={(e) => { if (status === "idle") (e.currentTarget as HTMLButtonElement).style.opacity = "0.92"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
        >
          {status === "submitting" ? "Updating…" : "Update password"}
        </button>
      </form>

      <p style={{ textAlign: "center", fontSize: "0.875rem", color: "#6B6860", margin: "1.75rem 0 0" }}>
        <Link href="/login" style={{ color: "#1F4B4A", fontWeight: 600, textDecoration: "none" }}>Back to sign in</Link>
      </p>
    </>
  );
}
