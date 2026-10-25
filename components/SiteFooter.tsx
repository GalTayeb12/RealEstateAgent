"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/LocaleProvider";

const HIDE_FOOTER = new Set(["/interview", "/transition", "/processing"]);

/**
 * SiteFooter — the only site-wide footer. Hidden on full-screen cinematic pages
 * so it cannot sit under a position:fixed overlay.
 */
export default function SiteFooter() {
  const pathname = usePathname();
  const { m } = useI18n();
  if (HIDE_FOOTER.has(pathname)) return null;
  return (
    <footer
      style={{
        borderTop: "1px solid rgba(28,27,25,0.06)",
        background: "#FAF8F4",
        fontFamily: "var(--font-inter, ui-sans-serif, sans-serif)",
      }}
    >
      <div
        style={{
          maxWidth: "80rem",
          margin: "0 auto",
          padding: "1rem 1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <span style={{ fontSize: "0.8125rem", color: "#9A958F" }}>
          © 2026 Haveniq
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
          <Link
            href="/terms"
            style={{
              fontSize: "0.8125rem",
              color: "#9A958F",
              textDecoration: "none",
              transition: "color 0.15s",
            }}
          >
            {m.footer.terms}
          </Link>
          <Link
            href="/privacy"
            style={{
              fontSize: "0.8125rem",
              color: "#9A958F",
              textDecoration: "none",
            }}
          >
            {m.footer.privacy}
          </Link>
        </div>
      </div>
    </footer>
  );
}
