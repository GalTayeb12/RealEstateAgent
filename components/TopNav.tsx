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
import { useEffect, useState, type CSSProperties } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/components/LocaleProvider";
import LanguageToggle from "@/components/LanguageToggle";
import { Logo } from "@/components/Logo";

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

function firstLetter(user: NavUser): string {
  const source = (user.name && user.name.trim()) || user.email;
  const letter = source.trim().charAt(0);
  return letter ? letter.toLocaleUpperCase() : "?";
}

function roleLabel(role: string, m: ReturnType<typeof useI18n>["m"]): string {
  if (role === "buyer") return m.nav.roleBuyer;
  if (role === "developer") return m.nav.roleDeveloper;
  if (role === "seller") return m.nav.roleSeller;
  if (role === "admin") return m.nav.roleAdmin;
  return role;
}

function accountLinks(role: string, m: ReturnType<typeof useI18n>["m"]): { href: string; label: string }[] {
  if (role === "buyer") {
    return [
      { href: "/results", label: m.nav.myResults },
      { href: "/buyer/offers", label: m.nav.offers },
      { href: "/buyer/leverage-groups", label: m.nav.groups },
    ];
  }
  if (role === "developer") {
    return [
      { href: "/dev/dashboard", label: m.nav.devDashboard },
      { href: "/dev/dashboard?tab=reservations", label: m.nav.reservations },
    ];
  }
  if (role === "seller") return [{ href: "/seller/dashboard", label: m.nav.myDashboard }];
  if (role === "admin") return [{ href: "/dev/admin/approvals", label: m.nav.approvals }];
  return [];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TopNav() {
  const pathname  = usePathname();
  const router    = useRouter();
  const { m } = useI18n();
  const [user, setUser]               = useState<NavUser | null>(null);
  const [offersCount, setOffersCount] = useState(0);
  const [menuOpen, setMenuOpen]       = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [narrow, setNarrow]           = useState(false);

  // Read user from localStorage on every route change; close mobile menu.
  useEffect(() => {
    setMenuOpen(false);
    setAccountOpen(false);
    try {
      const raw = localStorage.getItem("user");
      setUser(raw ? JSON.parse(raw) : null);
    } catch {
      setUser(null);
    }
  }, [pathname]);

  useEffect(() => {
    if (!user || user.name) return;
    const token = localStorage.getItem("token") ?? "";
    if (!token) return;
    let cancelled = false;
    fetch("/api/profile", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((profile: { name?: string | null } | null) => {
        if (cancelled || !profile?.name) return;
        const raw = localStorage.getItem("user");
        if (!raw) return;
        const next = { ...JSON.parse(raw), name: profile.name };
        localStorage.setItem("user", JSON.stringify(next));
        setUser(next);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!accountOpen) return;
    function onPointer(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-account]")) return;
      setAccountOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [accountOpen]);

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

  if (pathname === HOME_PATH || pathname === "/design-system" || pathname === "/login" || pathname === "/register") return null;

  const showAppNav = !!user && !GUEST_PATHS.has(pathname);
  const links    = user ? (NAV_HREFS[user.role] ?? []) : [];
  const dashHref = user ? (DASHBOARD_HREF[user.role] ?? "/") : "/";
  const letter = user ? firstLetter(user) : "";
  const linksForMenu = user ? accountLinks(user.role, m) : [];

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
      background: "var(--qp-surface)",
      borderBottom: "1px solid var(--qp-border)",
      fontFamily: "var(--font-heebo, sans-serif)",
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
        <Logo href={showAppNav ? dashHref : "/"} height={22} />

        {showAppNav && (
        <div className="hn-nav-divider" style={{ width: 1, height: "1.125rem", background: "var(--qp-border)", flexShrink: 0 }} />
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
                  color: active ? "var(--qp-ink)" : "var(--qp-muted)",
                  textDecoration: "none",
                  padding: "0.3rem 0.75rem",
                  borderRadius: "0.375rem",
                  background: active ? "rgba(18,63,64,0.07)" : "transparent",
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                {label}
                {count > 0 && (
                  <span style={{
                    minWidth: "1.125rem",
                    height: "1.125rem",
                    borderRadius: 999,
                    background: "var(--qp-ink)",
                    color: "#fff",
                    fontSize: "0.5625rem",
                    fontWeight: 600,
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
              <Link className="hn-guest-extra" href="/register" style={{ textDecoration: "none", fontSize: "0.875rem", fontWeight: 600, color: "var(--qp-muted)", whiteSpace: "nowrap" }}>
                {m.auth.noAccount} <span style={{ color: "var(--qp-ink)" }}>{m.auth.registerCta}</span>
              </Link>
            )}
            {(pathname === "/register" || pathname === "/seller/register") && (
              <Link className="hn-guest-extra" href="/login" style={{ textDecoration: "none", fontSize: "0.875rem", fontWeight: 600, color: "var(--qp-muted)", whiteSpace: "nowrap" }}>
                {m.auth.haveAccount} <span style={{ color: "var(--qp-ink)" }}>{m.auth.signIn}</span>
              </Link>
            )}
            <LanguageToggle />
            {user && (
              <AccountButton
                letter={letter}
                open={accountOpen}
                onToggle={() => setAccountOpen((open) => !open)}
                showMenu={accountOpen && !narrow}
                user={user}
                links={linksForMenu}
                role={roleLabel(user.role, m)}
                profileLabel={m.nav.myProfile}
                signOutLabel={m.nav.signOut}
                onNavigate={() => setAccountOpen(false)}
                onSignOut={signOut}
              />
            )}
          </div>
        )}

        {/* Right side: language + avatar + sign out — desktop only */}
        <div className="hn-nav-right" style={{ display: showAppNav ? "flex" : "none", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
          <LanguageToggle />
          {user && (
            <span className="hn-account-desktop">
              <AccountButton
                letter={letter}
                open={accountOpen}
                onToggle={() => setAccountOpen((open) => !open)}
                showMenu={accountOpen && !narrow}
                user={user}
                links={linksForMenu}
                role={roleLabel(user.role, m)}
                profileLabel={m.nav.myProfile}
                signOutLabel={m.nav.signOut}
                onNavigate={() => setAccountOpen(false)}
                onSignOut={signOut}
              />
            </span>
          )}
        </div>

        {showAppNav && (
        <div className="hn-nav-lang-mobile" style={{ display: "none", marginInlineStart: "auto", alignItems: "center", gap: "0.5rem" }}>
          <LanguageToggle />
          {user && (
            <AccountButton
              letter={letter}
              open={accountOpen}
              onToggle={() => setAccountOpen((open) => !open)}
              showMenu={false}
              user={user}
              links={linksForMenu}
              role={roleLabel(user.role, m)}
              profileLabel={m.nav.myProfile}
              signOutLabel={m.nav.signOut}
              onNavigate={() => setAccountOpen(false)}
              onSignOut={signOut}
            />
          )}
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
            background: menuOpen ? "rgba(18,63,64,0.06)" : "none",
            border: "none",
            cursor: "pointer",
            borderRadius: "0.375rem",
            padding: "0.3rem",
            color: "var(--qp-muted)",
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
            background: "var(--qp-surface)",
            borderTop: "1px solid var(--qp-soft)",
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
                  color: "var(--qp-ink)",
                  background: active ? "rgba(18,63,64,0.06)" : "transparent",
                  textDecoration: "none",
                }}
              >
                {label}
                {count > 0 && (
                  <span style={{
                    minWidth: "1.25rem",
                    height: "1.25rem",
                    borderRadius: 999,
                    background: "var(--qp-ink)",
                    color: "#fff",
                    fontSize: "0.625rem",
                    fontWeight: 600,
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
          <div style={{ height: 1, background: "var(--qp-soft)", margin: "0.375rem 0.75rem" }} />

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
              color: "var(--qp-ink)",
              textDecoration: "none",
            }}
          >
            <span style={{
              width: "1.75rem",
              height: "1.75rem",
              borderRadius: "50%",
              background: "linear-gradient(135deg, #0C3031, var(--qp-ink))",
              color: "#fff",
              fontSize: "0.625rem",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}>
              {letter}
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
              color: "var(--qp-error, #9E3434)",
              cursor: "pointer",
              textAlign: "start",
            }}
          >
            {m.nav.signOut}
          </button>
        </div>
      )}

      {user && accountOpen && narrow && (
        <div data-account style={{ position: "fixed", inset: 0, zIndex: 200 }}>
          <button
            type="button"
            aria-label={m.nav.closeMenu}
            onClick={() => setAccountOpen(false)}
            style={{ position: "absolute", inset: 0, background: "rgba(4,10,16,0.55)", border: "none", padding: 0 }}
          />
          <div style={{ position: "absolute", insetInline: 0, bottom: 0 }}>
            <AccountPanel
              sheet
              user={user}
              role={roleLabel(user.role, m)}
              links={linksForMenu}
              profileLabel={m.nav.myProfile}
              signOutLabel={m.nav.signOut}
              onNavigate={() => setAccountOpen(false)}
              onSignOut={signOut}
            />
          </div>
        </div>
      )}
    </nav>
  );
}

function AccountButton({
  letter,
  open,
  onToggle,
  showMenu,
  user,
  links,
  role,
  profileLabel,
  signOutLabel,
  onNavigate,
  onSignOut,
}: {
  letter: string;
  open: boolean;
  onToggle: () => void;
  showMenu: boolean;
  user: NavUser;
  links: { href: string; label: string }[];
  role: string;
  profileLabel: string;
  signOutLabel: string;
  onNavigate: () => void;
  onSignOut: () => void;
}) {
  return (
    <div data-account style={{ position: "relative" }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={user.name ?? user.email}
        style={{
          width: "2rem",
          height: "2rem",
          borderRadius: "50%",
          background: "linear-gradient(135deg, #0C3031, var(--qp-ink))",
          color: "#fff",
          fontSize: "0.8125rem",
          fontWeight: 600,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          border: open ? "2px solid var(--qp-accent-text)" : "2px solid transparent",
          cursor: "pointer",
          padding: 0,
          flexShrink: 0,
        }}
      >
        {letter}
      </button>
      {showMenu && (
        <div style={{ position: "absolute", top: "calc(100% + 0.55rem)", insetInlineEnd: 0, width: "17.5rem", zIndex: 30 }}>
          <AccountPanel
            user={user}
            role={role}
            links={links}
            profileLabel={profileLabel}
            signOutLabel={signOutLabel}
            onNavigate={onNavigate}
            onSignOut={onSignOut}
          />
        </div>
      )}
    </div>
  );
}

function AccountPanel({
  user,
  role,
  links,
  profileLabel,
  signOutLabel,
  onNavigate,
  onSignOut,
  sheet = false,
}: {
  user: NavUser;
  role: string;
  links: { href: string; label: string }[];
  profileLabel: string;
  signOutLabel: string;
  onNavigate: () => void;
  onSignOut: () => void;
  sheet?: boolean;
}) {
  const item: CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "start",
    textDecoration: "none",
    background: "transparent",
    border: "none",
    color: "var(--qp-ink)",
    fontSize: "0.9375rem",
    fontWeight: 600,
    padding: "0.7rem 0.85rem",
    borderRadius: 12,
    cursor: "pointer",
    fontFamily: "inherit",
  };
  return (
    <div style={{
      background: "var(--qp-surface)",
      border: "1px solid var(--qp-border)",
      borderRadius: sheet ? "24px 24px 0 0" : 16,
      padding: sheet ? "0.45rem 0.45rem 1.1rem" : "0.45rem",
      boxShadow: "var(--qp-shadow-lg)",
      color: "var(--qp-ink)",
    }}>
      <div style={{ padding: "0.7rem 0.85rem 0.55rem" }}>
        <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{user.name || user.email}</div>
        {user.name && (
          <div style={{ color: "var(--qp-muted)", fontSize: "0.8125rem", marginTop: "0.15rem", overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</div>
        )}
        <span style={{
          display: "inline-flex",
          marginTop: "0.45rem",
          padding: "0.12rem 0.55rem",
          borderRadius: 999,
          background: "#F5EDD8",
          color: "var(--qp-accent-text)",
          fontSize: "0.75rem",
          fontWeight: 600,
        }}>{role}</span>
      </div>
      <Link href="/profile" onClick={onNavigate} style={item}>{profileLabel}</Link>
      {links.map((link) => (
        <Link key={link.href} href={link.href} onClick={onNavigate} style={item}>{link.label}</Link>
      ))}
      <button type="button" onClick={onSignOut} style={{ ...item, color: "var(--qp-error, #9E3434)" }}>{signOutLabel}</button>
    </div>
  );
}
