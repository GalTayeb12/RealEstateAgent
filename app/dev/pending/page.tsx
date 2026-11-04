"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/LocaleProvider";
import { AuthRoom } from "@/components/auth/Room";

export default function DevPendingPage() {
  const { m } = useI18n();
  const [email, setEmail] = useState("");

  useEffect(() => {
    setEmail(sessionStorage.getItem("dev_pending_email") ?? "");

    let stopped = false;
    async function poll() {
      const token = localStorage.getItem("token") ?? "";
      if (!token) return;
      try {
        const res = await fetch("/api/dev/me", { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          if (data?.crnStatus === "approved") { window.location.href = "/dev/dashboard"; return; }
          if (data?.crnStatus === "rejected")  { window.location.href = "/dev/rejected";  return; }
        }
      } catch { /* ignore */ }
      if (!stopped) setTimeout(poll, 30_000);
    }
    const t = setTimeout(poll, 5_000);
    return () => { stopped = true; clearTimeout(t); };
  }, []);

  const steps = [
    { label: m.dev.pendingStep1, done: true,  active: false },
    { label: m.dev.pendingStep2, done: false, active: true  },
    { label: m.dev.pendingStep3, done: false, active: false },
    { label: m.dev.pendingStep4, done: false, active: false },
  ];

  return (
    <AuthRoom>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--qp-muted)", letterSpacing: "0.06em" }}>
          {m.dev.portalLabel}
        </div>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--qp-accent)", display: "inline-block", animation: "blink 1.4s ease-in-out infinite" }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--qp-accent-text)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{m.dev.pendingStatusLabel}</span>
        </span>
      </div>

      <h1 style={{ fontSize: "1.6rem", fontWeight: 500, margin: 0 }}>{m.dev.pendingTitle}</h1>

      {/* Stepper */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 20, flexShrink: 0 }}>
              <div style={{
                width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                background: s.done ? "var(--qp-ink)" : s.active ? "var(--qp-accent)" : "var(--qp-soft)",
                display: "flex", alignItems: "center", justifyContent: "center",
                marginTop: 3,
              }}>
                {s.done   && <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden><path d="M2 5l2.5 2.5L8 3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                {s.active && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", display: "block" }} />}
              </div>
              {i < 3 && <div style={{ width: 2, flex: 1, minHeight: 20, background: s.done ? "var(--qp-ink)" : "var(--qp-soft)", margin: "2px 0" }} />}
            </div>
            <div style={{ paddingBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: s.active ? 600 : 400, color: s.done || s.active ? "var(--qp-ink)" : "var(--qp-muted)" }}>
                {s.label}
              </div>
              {s.active && (
                <div style={{ fontSize: 13, color: "var(--qp-muted)", marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--qp-accent)", display: "inline-block", animation: "blink 1.4s ease-in-out infinite" }} />
                  {m.dev.pendingChecking}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Info box */}
      <div style={{ background: "var(--qp-soft)", borderRadius: 8, padding: "12px 14px", display: "grid", gap: 6 }}>
        <p style={{ margin: 0, fontSize: 14, color: "var(--qp-ink)", lineHeight: 1.5 }}>
          {m.dev.pendingInfoA}{email ? ` (${email})` : ""} {m.dev.pendingInfoB}
        </p>
        <p style={{ margin: 0, fontSize: 13, color: "var(--qp-muted)" }}>{m.dev.pendingEmailNote}</p>
      </div>

      <p style={{ margin: 0, fontSize: 13, color: "var(--qp-muted)" }}>
        {m.dev.pendingQuestions}{" "}
        <a href="mailto:support@haveniq.com" style={{ color: "var(--qp-ink)", fontWeight: 600 }}>support@haveniq.com</a>
      </p>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Link href="/login" style={{ fontSize: 14, color: "var(--qp-ink)", fontWeight: 600, textDecoration: "none" }}>
          {m.dev.pendingCheck} →
        </Link>
      </div>

      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </AuthRoom>
  );
}
