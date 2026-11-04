"use client";
import Link from "next/link";
import { useI18n } from "@/components/LocaleProvider";
import { AuthRoom } from "@/components/auth/Room";

export default function DevRejectedPage() {
  const { m } = useI18n();
  return (
    <AuthRoom>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--qp-muted)", letterSpacing: "0.06em" }}>
        {m.dev.portalLabel}
      </div>

      <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--qp-error-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--qp-error)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>

      <h1 style={{ fontSize: "1.6rem", fontWeight: 500, margin: 0 }}>{m.dev.rejectedTitle}</h1>

      <div style={{ background: "var(--qp-error-bg)", borderRadius: 8, padding: "12px 14px" }}>
        <p style={{ margin: 0, fontSize: 14, color: "var(--qp-ink)", lineHeight: 1.55 }}>
          {m.dev.rejectedBody}
        </p>
      </div>

      <p style={{ margin: 0, fontSize: 14, color: "var(--qp-muted)", lineHeight: 1.6 }}>
        {m.dev.rejectedContact}
      </p>

      <a href="mailto:support@haveniq.com" className="qp-btn qp-btn--primary qp-btn--block"
        style={{ display: "flex", textDecoration: "none", justifyContent: "center" }}>
        {m.dev.contactSupport}
      </a>

      <p style={{ textAlign: "center", fontSize: 14, color: "var(--qp-muted)", margin: 0 }}>
        <Link href="/dev/register" style={{ color: "var(--qp-ink)", fontWeight: 600 }}>{m.dev.reRegister}</Link>
      </p>
    </AuthRoom>
  );
}
