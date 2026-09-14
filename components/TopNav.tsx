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
 * Hidden on public / pre-auth pages (see PUBLIC_PATHS).
 * Sign-out clears localStorage and redirects to /login from anywhere.
 *
 * Mobile: collapses to a hamburger menu at ≤640px.
 */
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";

// Pages where the nav must NOT appear
const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/register",
  "/dev/login",
  "/dev/register",
  "/dev/pending",
  "/dev/rejected",
]);

interface NavUser {
  email: string;
  role: "buyer" | "developer" | "admin" | string;
  name?: string | null;
}

// ── Per-role link definitions ─────────────────────────────────────────────────

const NAV_LINKS: Record<string, { label: string; href: string; badgeKey?: string }[]> = {
  buyer: [
    { label: "Results",   href: "/results" },
    { label: "My Offers", href: "/buyer/offers", badgeKey: "offers" },
    { label: "Groups",    href: "/buyer/leverage-groups" },
  ],
  developer: [
    { label: "Dashboard", href: "/dev/dashboard" },
  ],
  admin: [
    { label: "Approvals", href: "/dev/admin/approvals" },
  ],
};

const DASHBOARD_HREF: Record<string, string> = {
  buyer:     "/results",
  developer: "/dev/dashboard",
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

  if (PUBLIC_PATHS.has(pathname) || !user) return null;

  const links    = NAV_LINKS[user.role] ?? [];
  const dashHref = DASHBOARD_HREF[user.role] ?? "/";
  const initials = getInitials(user);

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
        }
        @media (min-width: 641px) {
          .hn-hamburger    { display: none !important; }
          .hn-mobile-menu  { display: none !important; }
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
        <Link href={dashHref} style={{ textDecoration: "none", flexShrink: 0, display: "flex", alignItems: "center" }}>
          <img src="/haveniq_logo_horizontal.png" alt="Haveniq" style={{ height: 22, width: "auto" }} />
        </Link>

        {/* Divider — desktop only */}
        <div className="hn-nav-divider" style={{ width: 1, height: "1.125rem", background: "#DDD9D3", flexShrink: 0 }} />

        {/* Nav links — desktop only */}
        <div className="hn-nav-links" style={{ display: "flex", alignItems: "center", gap: "0.125rem", flex: 1 }}>
          {links.map(({ label, href, badgeKey }) => {
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

        {/* Right side: avatar + sign out — desktop only */}
        <div className="hn-nav-right" style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
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
            Sign out
          </button>
        </div>

        {/* Hamburger — mobile only */}
        <button
          className="hn-hamburger"
          onClick={() => setMenuOpen(o => !o)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          style={{
            display: "none",       /* shown via CSS media query */
            marginLeft: "auto",
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
      </div>

      {/* ── Mobile menu ──────────────────────────────────────────────────────── */}
      {menuOpen && (
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
          {links.map(({ label, href, badgeKey }) => {
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
            Sign out
          </button>
        </div>
      )}
    </nav>
  );
}
