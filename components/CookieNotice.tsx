"use client";

import { useSyncExternalStore, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/LocaleProvider";

const KEY = "hq_cookie_notice_seen";
const EVENT = "hq-cookie-notice";

function readSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false; // storage blocked: the notice shows
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Notice about cookies. Haveniq sets only strictly necessary cookies (the login
 * session and the language preference), so this is an information notice with a
 * dismiss control, not an opt-in banner. The dismissal is remembered in
 * localStorage; if storage is blocked the notice simply shows again.
 * On the server (and before hydration) the notice is hidden to avoid a flash.
 */
export default function CookieNotice() {
  const { m } = useI18n();
  const seen = useSyncExternalStore(subscribe, readSeen, () => true);
  const [dismissed, setDismissed] = useState(false);

  if (seen || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* storage blocked: the notice is hidden for this view only */
    }
    window.dispatchEvent(new Event(EVENT));
  }

  return (
    <div
      role="region"
      aria-label={m.cookies.title}
      style={{
        position: "fixed",
        insetInline: "1rem",
        bottom: "1rem",
        zIndex: 60,
        maxWidth: "36rem",
        marginInline: "auto",
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        flexWrap: "wrap",
        padding: "0.875rem 1.125rem",
        borderRadius: "0.875rem",
        background: "var(--qp-surface)",
        color: "var(--qp-ink)",
        border: "1px solid var(--qp-border)",
        boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
        fontSize: "0.875rem",
        lineHeight: 1.5,
      }}
    >
      <p style={{ margin: 0, flex: "1 1 16rem" }}>
        {m.cookies.text}{" "}
        <Link href="/privacy" style={{ color: "var(--qp-ink)", textDecoration: "underline" }}>
          {m.cookies.link}
        </Link>
      </p>
      <button
        type="button"
        onClick={dismiss}
        style={{
          padding: "0.5rem 1rem",
          borderRadius: 999,
          border: "none",
          background: "var(--qp-ink)",
          color: "var(--qp-surface)",
          fontWeight: 600,
          cursor: "pointer",
          minHeight: 44,
        }}
      >
        {m.cookies.ok}
      </button>
    </div>
  );
}
