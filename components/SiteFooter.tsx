import Link from "next/link";

/**
 * SiteFooter — minimal one-line footer rendered on every page via RootLayout.
 *
 * Full marketing footer lives in app/page.tsx (homepage only).
 * This component provides the legal links on authenticated app pages
 * (results, offers, profile, etc.) without duplicating the elaborate
 * multi-column homepage layout.
 */
export default function SiteFooter() {
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
            onMouseEnter={undefined}
          >
            Terms of Service
          </Link>
          <Link
            href="/privacy"
            style={{
              fontSize: "0.8125rem",
              color: "#9A958F",
              textDecoration: "none",
            }}
          >
            Privacy Policy
          </Link>
        </div>
      </div>
    </footer>
  );
}
