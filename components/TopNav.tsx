"use client";
/**
 * TopNav — global top navigation bar, role-aware.
 *
 * Rendered inside the root layout. Reads the logged-in user's role, email,
 * and name from localStorage on mount / route change, then renders the
 * appropriate links.
 *
 * For buyer role: fetches offer count on mount and shows a numeric badge on
 * the "My Offers" link. Refreshes count on every route change so the badge
 * stays current as the user navigates.
 *
 * Hidden on the marketing homepage (its own nav) and the transition sting.
 * Guest / pre-auth / interview pages get a slim bar with the language toggle.
 * Sign-out clears localStorage and redirects to /login from anywhere.
 *
 * Mobile: collapses to a hamburger menu at ≤640px.
 */
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/components/LocaleProvider";
import LanguageToggle from "@/components/LanguageToggle";

// Marketing homepage has its own sticky nav (with the language toggle inside it).
const HOME_PATH = "/";

// Guest / pre-auth / interview pages get a slim bar: logo + language toggle.
const GUEST_PATHS = new Set([
  "/login",
  "/register",
  "/dev/login",
  "/dev/register",
  "/dev/pending",
  "/dev/rejected",
  "/seller/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/terms",
  "/privacy",
  "/interview",
  "/transition",
  "/processing",
]);

interface NavUser {
  email: string;
  role: "buyer" | "developer" | "admin" | string;
  name?: string | null;
}

// ── Per-role link definitions ─────────────────────────────────────────────────

const NAV_HREFS: Record<string, { href: string; key: "results" | "offers" | "groups" | "dashboard" | "approvals"; badgeKey?: string }[]> = {
  buyer: [
    { key: "results", href: "/results" },
    { key: "offers", href: "/buyer/offers", badgeKey: "offers" },
    { key: "groups", href: "/buyer/leverage-groups" },
  ],
  developer: [
    { key: "dashboard", href: "/dev/dashboard" },
  ],
  seller: [
    { key: "dashboard", href: "/seller/dashboard" },
  ],
  admin: [
    { key: "approvals", href: "/dev/admin/approvals" },
  ],
};

const DASHBOARD_HREF: Record<string, string> = {
  buyer:     "/results",
  developer: "/dev/dashboard",
  seller:    "/seller/dashboard",
  admin:     "/dev/admin/approvals",
};

// ── Initials helper ───────────────────────────────────────────────────────────

function getInitials(user: NavUser): string {
  if (user.name && user.name.trim()) {
    const parts = user.name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0][0].toUpperCase();
  }
  return user.email.split("@")[0][0].toUpperCase();
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TopNav() {
  const pathname  = usePathname();
  const router    = useRouter();
  const { m } = useI18n();
  const [user, setUser]               = useState<NavUser | null>(null);
  const [offersCount, setOffersCount] = useState(0);
  const [menuOpen, setMenuOpen]       = useState(false);

  // Read user from localStorage on every route change; close mobile menu.
  useEffect(() => {
    setMenuOpen(false);
    try {
      const raw = localStorage.getItem("user");
      setUser(raw ? JSON.parse(raw) : null);
    } catch {
      setUser(null);
    }
  }, [pathname]);

  // Fetch offer count for buyer on every route change.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      const u: NavUser | null = raw ? JSON.parse(raw) : null;
      if (!u || u.role !== "buyer") { setOffersCount(0); return; }
      const token = localStorage.getItem("token") ?? "";
      if (!token) return;
      fetch("/api/offers", { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => setOffersCount((d.offers ?? []).length))
        .catch(() => {});
    } catch { /* ignore */ }
  }, [pathname]);

  if (pathname === HOME_PATH || pathname === "/transition") return null;

  const showAppNav = !!user && !GUEST_PATHS.has(pathname);
  const links    = user ? (NAV_HREFS[user.role] ?? []) : [];
  const dashHref = user ? (DASHBOARD_HREF[user.role] ?? "/") : "/";
  const initials = user ? getInitials(user) : "";

  function signOut() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("offersLastViewedAt");
    localStorage.removeItem("transcriptId");
    router.push("/login");
  }

  return (
    <nav style={{
      position: "sticky",
      top: 0,
      zIndex: 100,
      background: "#fff",
      borderBottom: "1px solid #DDD9D3",
      fontFamily: "var(--font-inter, sans-serif)",
    }}>
      <style>{`
        @media (max-width: 640px) {
          .hn-nav-divider { display: none !important; }
          .hn-nav-links   { display: none !important; }
          .hn-nav-right   { display: none !important; }
          .hn-hamburger   { display: flex !important; }
          .hn-nav-lang-mobile { display: flex !important; }
        }
        @media (max-width: 480px) {
          .hn-guest-extra { display: none !important; }
        }
        @media (min-width: 641px) {
          .hn-hamburger    { display: none !important; }
          .hn-mobile-menu  { display: none !important; }
          .hn-nav-lang-mobile { display: none !important; }
        }
      `}</style>

      {/* ── Main bar ─────────────────────────────────────────────────────────── */}
      <div style={{
        maxWidth: "72rem",
        margin: "0 auto",
        padding: "0 1.5rem",
        height: "3.25rem",
        display: "flex",
        alignItems: "center",
        gap: "1.5rem",
      }}>
        {/* Logo */}
        <Link href={showAppNav ? dashHref : "/"} style={{ textDecoration: "none", flexShrink: 0, display: "flex", alignItems: "center" }}>
          <img src="/haveniq_logo_horizontal.png" alt="Haveniq" style={{ height: 22, width: "auto" }} />
        </Link>

        {showAppNav && (
        <div className="hn-nav-divider" style={{ width: 1, height: "1.125rem", background: "#DDD9D3", flexShrink: 0 }} />
        )}

        {/* Nav links — desktop only */}
        <div className="hn-nav-links" style={{ display: showAppNav ? "flex" : "none", alignItems: "center", gap: "0.125rem", flex: 1 }}>
          {showAppNav && links.map(({ key, href, badgeKey }) => {
            const label = m.nav[key];
            const active = pathname === href || pathname.startsWith(href + "/");
            const count  = badgeKey === "offers" ? offersCount : 0;
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.375rem",
                  fontSize: "0.875rem",
                  fontWeight: active ? 700 : 500,
                  color: active ? "#1F4B4A" : "#6B6860",
                  textDecoration: "none",
                  padding: "0.3rem 0.75rem",
                  borderRadius: "0.375rem",
                  background: active ? "rgba(31,75,74,0.07)" : "transparent",
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                {label}
                {count > 0 && (
                  <span style={{
                    minWidth: "1.125rem",
                    height: "1.125rem",
                    borderRadius: 999,
                    background: "#1F4B4A",
                    color: "#fff",
                    fontSize: "0.5625rem",
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 0.25rem",
                    lineHeight: 1,
                  }}>
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Guest pages: keep the language toggle in the same bar */}
        {!showAppNav && (
          <div style={{ marginInlineStart: "auto", display: "flex", alignItems: "center", gap: "0.875rem", flexShrink: 0 }}>
            {pathname === "/login" && (
              <Link className="hn-guest-extra" href="/register" style={{ textDecoration: "none", fontSize: "0.875rem", fontWeight: 600, color: "#55534C", whiteSpace: "nowrap" }}>
                {m.auth.noAccount} <span style={{ color: "#1F4B4A" }}>{m.auth.registerCta}</span>
              </Link>
            )}
            {(pathname === "/register" || pathname === "/seller/register") && (
              <Link className="hn-guest-extra" href="/login" style={{ textDecoration: "none", fontSize: "0.875rem", fontWeight: 600, color: "#55534C", whiteSpace: "nowrap" }}>
                {m.auth.haveAccount} <span style={{ color: "#1F4B4A" }}>{m.auth.signIn}</span>
              </Link>
            )}
            <LanguageToggle />
          </div>
        )}

        {/* Right side: language + avatar + sign out — desktop only */}
        <div className="hn-nav-right" style={{ display: showAppNav ? "flex" : "none", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
          <LanguageToggle />
          {user && (
            <>
          <Link
            href="/profile"
            title={user.name ?? user.email}
            style={{
              width: "2rem",
              height: "2rem",
              borderRadius: "50%",
              background: "linear-gradient(135deg, #2F6664, #1F4B4A)",
              color: "#fff",
              fontSize: "0.6875rem",
              fontWeight: 700,
              letterSpacing: "0.04em",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              textDecoration: "none",
              flexShrink: 0,
              transition: "opacity 0.15s",
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.opacity = "0.8")}
            onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.opacity = "1")}
          >
            {initials}
          </Link>

          <button
            onClick={signOut}
            style={{
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: "#6B6860",
              background: "none",
              border: "1px solid #DDD9D3",
              borderRadius: "0.375rem",
              padding: "0.25rem 0.75rem",
              cursor: "pointer",
              transition: "border-color 0.15s, color 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#B04040";
              (e.currentTarget as HTMLButtonElement).style.color = "#B04040";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#DDD9D3";
              (e.currentTarget as HTMLButtonElement).style.color = "#6B6860";
            }}
          >
            {m.nav.signOut}
          </button>
            </>
          )}
        </div>

        {showAppNav && (
        <div className="hn-nav-lang-mobile" style={{ display: "none", marginInlineStart: "auto", alignItems: "center" }}>
          <LanguageToggle />
        </div>
        )}

        {/* Hamburger — mobile only */}
        {showAppNav && (
        <button
          className="hn-hamburger"
          onClick={() => setMenuOpen(o => !o)}
          aria-label={menuOpen ? m.nav.closeMenu : m.nav.openMenu}
          aria-expanded={menuOpen}
          style={{
            display: "none",       /* shown via CSS media query */
            marginInlineStart: showAppNav ? 0 : "auto",
            alignItems: "center",
            justifyContent: "center",
            width: "2.25rem",
            height: "2.25rem",
            background: menuOpen ? "rgba(28,27,25,0.06)" : "none",
            border: "none",
            cursor: "pointer",
            borderRadius: "0.375rem",
            padding: "0.3rem",
            color: "#55534C",
            flexShrink: 0,
            transition: "background 0.15s",
          }}
        >
          {menuOpen ? (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="3" x2="15" y2="15" />
              <line x1="15" y1="3" x2="3" y2="15" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="5" x2="15" y2="5" />
              <line x1="3" y1="9" x2="15" y2="9" />
              <line x1="3" y1="13" x2="15" y2="13" />
            </svg>
          )}
        </button>
        )}
      </div>

      {/* ── Mobile menu ──────────────────────────────────────────────────────── */}
      {showAppNav && menuOpen && user && (
        <div
          className="hn-mobile-menu"
          style={{
            display: "flex",
            flexDirection: "column",
            padding: "0.375rem 0.75rem 0.875rem",
            background: "#fff",
            borderTop: "1px solid #F0EDE8",
          }}
        >
          {/* Nav links */}
          {links.map(({ key, href, badgeKey }) => {
            const label = m.nav[key];
            const active = pathname === href || pathname.startsWith(href + "/");
            const count  = badgeKey === "offers" ? offersCount : 0;
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.75rem 0.75rem",
                  borderRadius: "0.5rem",
                  fontSize: "0.9375rem",
                  fontWeight: active ? 700 : 500,
                  color: active ? "#1F4B4A" : "#1C1B19",
                  background: active ? "rgba(31,75,74,0.06)" : "transparent",
                  textDecoration: "none",
                }}
              >
                {label}
                {count > 0 && (
                  <span style={{
                    minWidth: "1.25rem",
                    height: "1.25rem",
                    borderRadius: 999,
                    background: "#1F4B4A",
                    color: "#fff",
                    fontSize: "0.625rem",
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 0.3rem",
                  }}>
                    {count}
                  </span>
                )}
              </Link>
            );
          })}

          {/* Divider */}
          <div style={{ height: 1, background: "#F0EDE8", margin: "0.375rem 0.75rem" }} />

          {/* Profile link */}
          <Link
            href="/profile"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              padding: "0.75rem 0.75rem",
              borderRadius: "0.5rem",
              fontSize: "0.9375rem",
              fontWeight: 500,
              color: "#1C1B19",
              textDecoration: "none",
            }}
          >
            <span style={{
              width: "1.75rem",
              height: "1.75rem",
              borderRadius: "50%",
              background: "linear-gradient(135deg, #2F6664, #1F4B4A)",
              color: "#fff",
              fontSize: "0.625rem",
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}>
              {initials}
            </span>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user.name ?? user.email}
            </span>
          </Link>

          {/* Sign out */}
          <button
            onClick={signOut}
            style={{
              display: "flex",
              width: "100%",
              padding: "0.75rem 0.75rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "none",
              fontSize: "0.9375rem",
              fontWeight: 500,
              color: "#B04040",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            {m.nav.signOut}
          </button>
        </div>
      )}
    </nav>
  );
}
