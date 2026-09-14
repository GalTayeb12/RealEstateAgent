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
    <main style={{ minHeight: "100vh", background: "#F7F5F1", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1rem", fontFamily: "var(--font-inter, sans-serif)" }}>
      <div style={{ width: "100%", maxWidth: "520px" }}>
        <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #DDD9D3", borderTop: "4px solid #1F4B4A", overflow: "hidden" }}>
          <div style={{ padding: "2.5rem 2.5rem 2rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>

            <div>
              <div style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "#1F4B4A", marginBottom: "0.5rem" }}>
                Haveniq — Developer Portal
              </div>
              <h1 style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1.875rem", fontWeight: 700, color: "#1C1B19", margin: 0, lineHeight: 1.2 }}>
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
                      background: step.done ? "#1F4B4A" : step.active ? "#C89B3C" : "#E8E4DF",
                      border: step.active ? "2px solid #C89B3C" : "none",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      marginTop: "0.1875rem",
                      animation: step.active ? "pulse 2s ease-in-out infinite" : "none",
                    }}>
                      {step.done && <span style={{ color: "#fff", fontSize: "0.625rem", fontWeight: 700 }}>✓</span>}
                      {step.active && <span style={{ width: "0.375rem", height: "0.375rem", borderRadius: "50%", background: "#C89B3C", display: "block" }} />}
                    </div>
                    {i < 3 && <div style={{ width: 2, flex: 1, minHeight: "1.5rem", background: step.done ? "#1F4B4A" : "#E8E4DF", margin: "0.125rem 0" }} />}
                  </div>
                  <div style={{ paddingBottom: "1.25rem" }}>
                    <div style={{
                      fontSize: "0.9375rem", fontWeight: step.active ? 600 : 400,
                      color: step.done ? "#1F4B4A" : step.active ? "#1C1B19" : "#6B6860",
                      lineHeight: 1.4,
                    }}>
                      {step.label}
                    </div>
                    {step.active && (
                      <div style={{ fontSize: "0.8125rem", color: "#6B6860", marginTop: "0.2rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <span style={{
                          width: 7, height: 7, borderRadius: "50%", background: "#C89B3C", display: "inline-block",
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
            <div style={{ background: "#E8F0EF", borderRadius: "0.625rem", padding: "1rem 1.125rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <p style={{ margin: 0, fontSize: "0.9375rem", color: "#1C1B19", lineHeight: 1.55 }}>
                Your company registration number <strong>{email ? `(submitted under ${email})` : ""}</strong> is being verified against the companies registry. A licensed solicitor will review the details and confirm your eligibility before your account is activated.
              </p>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "#1F4B4A" }}>
                You will receive an email notification once the review is complete.
              </p>
            </div>

            <p style={{ margin: 0, fontSize: "0.875rem", color: "#6B6860" }}>
              Questions? Contact support at{" "}
              <a href="mailto:galta851@gmail.com" style={{ color: "#1F4B4A", fontWeight: 600 }}>
                galta851@gmail.com
              </a>
            </p>
          </div>

          <div style={{ borderTop: "1px solid #F0EDE8", padding: "1.25rem 2.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%", background: "#C89B3C", display: "inline-block",
                animation: "blink 1.4s ease-in-out infinite",
              }} />
              <span style={{ fontSize: "0.75rem", color: "#6B6860" }}>
                Status: <strong style={{ fontFamily: "var(--font-jetbrains, monospace)", color: "#C89B3C" }}>PENDING REVIEW</strong>
              </span>
            </div>
            <Link href="/login" style={{ fontSize: "0.875rem", color: "#1F4B4A", fontWeight: 600 }}>
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
