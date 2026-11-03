"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function DevPendingPage() {
  const [email, setEmail] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setEmail(sessionStorage.getItem("dev_pending_email") ?? "");

    // Periodically poll /api/dev/me to detect status change without page reload
    let stopped = false;
    async function poll() {
      const token = localStorage.getItem("token") ?? "";
      if (!token) return;
      try {
        const res = await fetch("/api/dev/me", { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          if (data?.crnStatus === "approved") {
            window.location.href = "/dev/dashboard";
          } else if (data?.crnStatus === "rejected") {
            window.location.href = "/dev/rejected";
          }
        }
      } catch { /* ignore network errors */ }
      if (!stopped) {
        setChecking(c => !c); // toggle to re-trigger pulse animation
        setTimeout(poll, 30_000); // poll every 30s
      }
    }
    const t = setTimeout(poll, 5_000); // first check after 5s
    return () => { stopped = true; clearTimeout(t); };
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "var(--qp-bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1rem", fontFamily: "var(--font-heebo, sans-serif)" }}>
      <div style={{ width: "100%", maxWidth: "520px" }}>
        <div style={{ background: "var(--qp-surface)", borderRadius: "1rem", border: "1px solid var(--qp-border)", borderTop: "4px solid var(--qp-ink)", overflow: "hidden" }}>
          <div style={{ padding: "2.5rem 2.5rem 2rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>

            <div>
              <div style={{ fontFamily: "var(--font-heebo, sans-serif)", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--qp-ink)", marginBottom: "0.5rem" }}>
                Haveniq — Developer Portal
              </div>
              <h1 style={{ fontFamily: "var(--font-heebo, sans-serif)", fontSize: "1.875rem", fontWeight: 600, color: "var(--qp-ink)", margin: 0, lineHeight: 1.2 }}>
                Verification in progress
              </h1>
            </div>

            {/* Stepper */}
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {[
                { label: "Details submitted", done: true },
                { label: "Companies registry check", done: false, active: true },
                { label: "Licensed solicitor sign-off", done: false },
                { label: "Account activated", done: false },
              ].map((step, i) => (
                <div key={i} style={{ display: "flex", gap: "0.875rem", alignItems: "flex-start" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "1.25rem", flexShrink: 0 }}>
                    <div style={{
                      width: "1.125rem", height: "1.125rem", borderRadius: "50%", flexShrink: 0,
                      background: step.done ? "var(--qp-ink)" : step.active ? "var(--qp-accent-text)" : "var(--qp-soft)",
                      border: step.active ? "2px solid var(--qp-accent-text)" : "none",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      marginTop: "0.1875rem",
                      animation: step.active ? "pulse 2s ease-in-out infinite" : "none",
                    }}>
                      {step.done && <span style={{ color: "var(--qp-on-primary)", fontSize: "0.625rem", fontWeight: 600 }}>✓</span>}
                      {step.active && <span style={{ width: "0.375rem", height: "0.375rem", borderRadius: "50%", background: "var(--qp-accent-text)", display: "block" }} />}
                    </div>
                    {i < 3 && <div style={{ width: 2, flex: 1, minHeight: "1.5rem", background: step.done ? "var(--qp-ink)" : "var(--qp-soft)", margin: "0.125rem 0" }} />}
                  </div>
                  <div style={{ paddingBottom: "1.25rem" }}>
                    <div style={{
                      fontSize: "0.9375rem", fontWeight: step.active ? 600 : 400,
                      color: step.done ? "var(--qp-ink)" : step.active ? "var(--qp-ink)" : "var(--qp-muted)",
                      lineHeight: 1.4,
                    }}>
                      {step.label}
                    </div>
                    {step.active && (
                      <div style={{ fontSize: "0.8125rem", color: "var(--qp-muted)", marginTop: "0.2rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <span style={{
                          width: 7, height: 7, borderRadius: "50%", background: "var(--qp-accent-text)", display: "inline-block",
                          animation: "blink 1.4s ease-in-out infinite",
                        }} />
                        Checking status…
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Info box */}
            <div style={{ background: "var(--qp-soft)", borderRadius: "0.625rem", padding: "1rem 1.125rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <p style={{ margin: 0, fontSize: "0.9375rem", color: "var(--qp-ink)", lineHeight: 1.55 }}>
                Your company registration number <strong>{email ? `(submitted under ${email})` : ""}</strong> is being verified against the companies registry. A licensed solicitor will review the details and confirm your eligibility before your account is activated.
              </p>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--qp-ink)" }}>
                You will receive an email notification once the review is complete.
              </p>
            </div>

            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--qp-muted)" }}>
              Questions? Contact support at{" "}
              <a href="mailto:galta851@gmail.com" style={{ color: "var(--qp-ink)", fontWeight: 600 }}>
                galta851@gmail.com
              </a>
            </p>
          </div>

          <div style={{ borderTop: "1px solid var(--qp-soft)", padding: "1.25rem 2.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%", background: "var(--qp-accent-text)", display: "inline-block",
                animation: "blink 1.4s ease-in-out infinite",
              }} />
              <span style={{ fontSize: "0.75rem", color: "var(--qp-muted)" }}>
                Status: <strong style={{ fontFamily: "var(--font-heebo, monospace)", color: "var(--qp-accent-text)" }}>PENDING REVIEW</strong>
              </span>
            </div>
            <Link href="/login" style={{ fontSize: "0.875rem", color: "var(--qp-ink)", fontWeight: 600 }}>
              Check status →
            </Link>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(200,155,60,0.4); }
          50%       { box-shadow: 0 0 0 6px rgba(200,155,60,0); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
      `}</style>
    </main>
  );
}
