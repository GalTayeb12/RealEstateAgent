"use client";
import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
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

  const shell = (children: React.ReactNode) => (
    <div style={{ minHeight: "100vh", background: "#F4F5F0", display: "flex", flexDirection: "column" }}>
      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1.5rem", position: "relative", zIndex: 1 }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid rgba(18,63,64,0.08)", boxShadow: "0 2px 4px rgba(18,63,64,0.04), 0 24px 48px -20px rgba(18,51,50,0.14)", overflow: "hidden" }}>
            <div style={{ height: 4, background: "linear-gradient(90deg, #0C3031, #123332)" }} />
            <div style={{ padding: "2.5rem 2.5rem 2.75rem" }}>{children}</div>
          </div>
          <p style={{ textAlign: "center", fontSize: "0.75rem", color: "#526563", marginTop: "1.5rem" }}>Haveniq — prototype v0.1</p>
        </div>
      </main>
    </div>
  );

  if (state === "sent") return shell(
    <>
      <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(47,102,100,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0C3031" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      </div>
      <h1 style={{ fontFamily: "var(--font-fraunces), serif", fontWeight: 500, fontSize: "1.75rem", lineHeight: 1.2, letterSpacing: "0", margin: "0 0 0.75rem", color: "#123F40", textAlign: "center" }}>Check your inbox</h1>
      <p style={{ margin: "0 0 2rem", fontSize: "0.9375rem", color: "#526563", lineHeight: 1.6, textAlign: "center" }}>
        If that email exists in our system, we&apos;ve sent a reset link. It expires in 1 hour.
      </p>
      <Link href="/login" style={{ display: "block", textAlign: "center", padding: "0.875rem", borderRadius: 999, fontSize: "0.9375rem", fontWeight: 600, color: "#fff", background: "linear-gradient(155deg, #0C3031, #123332)", textDecoration: "none", boxShadow: "0 1px 0 rgba(255,255,255,0.15) inset, 0 10px 24px -10px rgba(18,51,50,0.55)" }}>
        Back to sign in
      </Link>
    </>
  );

  return shell(
    <>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontFamily: "var(--font-fraunces), serif", fontWeight: 500, fontSize: "2rem", lineHeight: 1.15, letterSpacing: "0", margin: "0 0 0.5rem", color: "#123F40" }}>Forgot password?</h1>
        <p style={{ margin: 0, fontSize: "0.9375rem", color: "#526563", lineHeight: 1.5 }}>Enter your email and we&apos;ll send you a reset link.</p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div>
          <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#55534C", marginBottom: "0.5rem" }}>Email address</label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{ width: "100%", background: "#F5F3EE", border: "1.5px solid #E0DDD7", borderRadius: 10, padding: "0.75rem 1rem", fontSize: "1rem", color: "#123F40", outline: "none", boxSizing: "border-box", transition: "border-color 0.15s, box-shadow 0.15s" }}
            onFocus={(e) => { e.target.style.borderColor = "#123F40"; e.target.style.boxShadow = "0 0 0 3px rgba(31,75,74,0.12)"; }}
            onBlur={(e) => { e.target.style.borderColor = "#E0DDD7"; e.target.style.boxShadow = "none"; }}
          />
        </div>

        <button
          type="submit"
          disabled={state === "sending"}
          style={{ width: "100%", padding: "0.875rem", borderRadius: 999, fontSize: "0.9375rem", fontWeight: 600, color: "#fff", background: state === "sending" ? "rgba(31,75,74,0.6)" : "linear-gradient(155deg, #0C3031, #123332)", border: "none", cursor: state === "sending" ? "not-allowed" : "pointer", boxShadow: state === "sending" ? "none" : "0 1px 0 rgba(255,255,255,0.15) inset, 0 10px 24px -10px rgba(18,51,50,0.55)", transition: "opacity 0.15s" }}
          onMouseEnter={(e) => { if (state === "idle") (e.currentTarget as HTMLButtonElement).style.opacity = "0.92"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
        >
          {state === "sending" ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p style={{ textAlign: "center", fontSize: "0.875rem", color: "#526563", margin: "1.75rem 0 0" }}>
        <Link href="/login" style={{ color: "#123F40", fontWeight: 600, textDecoration: "none" }}>Back to sign in</Link>
      </p>
    </>
  );
}
