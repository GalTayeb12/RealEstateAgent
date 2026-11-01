"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/LocaleProvider";

const HIDE_FOOTER = new Set(["/interview", "/transition", "/processing", "/design-system"]);
const ROOM_FOOTER = new Set(["/", "/login", "/register"]);

/**
 * SiteFooter — the only site-wide footer. Hidden on full-screen cinematic pages
 * so it cannot sit under a position:fixed overlay.
 */
export default function SiteFooter() {
  const pathname = usePathname();
  const { m } = useI18n();
  if (HIDE_FOOTER.has(pathname)) return null;
  const room = ROOM_FOOTER.has(pathname);
  return (
    <footer
      style={{
        borderTop: room ? "1px solid rgba(255,255,255,0.14)" : "1px solid rgba(28,27,25,0.06)",
        background: room ? "#07141c" : "#FAF8F4",
        fontFamily: "var(--font-inter, ui-sans-serif, sans-serif)",
        color: room ? "#a9b7c2" : undefined,
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
        <span style={{ fontSize: "0.8125rem", color: room ? "#a9b7c2" : "#9A958F" }}>
          © 2026 Haveniq
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
          <Link
            href="/terms"
            style={{
              fontSize: "0.8125rem",
              color: room ? "#a9b7c2" : "#9A958F",
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
              color: room ? "#a9b7c2" : "#9A958F",
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
