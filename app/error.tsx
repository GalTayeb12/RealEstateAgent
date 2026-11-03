"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main style={{ minHeight: "100dvh", background: "var(--qp-bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center", fontFamily: "var(--font-heebo, sans-serif)" }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--qp-error-bg)", border: "1px solid var(--qp-error)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem" }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--qp-error)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h1 style={{ margin: "0 0 0.75rem", fontSize: "clamp(1.5rem, 4vw, 2rem)", fontWeight: 300, color: "var(--qp-ink)", lineHeight: 1.2 }}>
        אירעה שגיאה
      </h1>
      <p style={{ margin: "0 0 2rem", fontSize: "1rem", color: "var(--qp-muted)", maxWidth: "30rem", lineHeight: 1.65 }}>
        משהו לא עבד כמצופה. ניתן לנסות שוב או לחזור לדף הבית.
      </p>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={reset}
          style={{ padding: "0.75rem 1.75rem", background: "var(--qp-ink)", color: "var(--qp-on-primary)", border: "none", borderRadius: "0.5rem", fontWeight: 500, fontSize: "0.9375rem", cursor: "pointer", fontFamily: "inherit" }}
        >
          נסה שוב
        </button>
        <a
          href="/"
          style={{ padding: "0.75rem 1.75rem", background: "transparent", color: "var(--qp-ink)", border: "1.5px solid var(--qp-border)", borderRadius: "0.5rem", fontWeight: 500, fontSize: "0.9375rem", textDecoration: "none", fontFamily: "inherit" }}
        >
          דף הבית
        </a>
      </div>
    </main>
  );
}
