"use client";

import { useState, useEffect, useRef, useId } from "react";
import Link from "next/link";
import Image from "next/image";
import { useI18n } from "@/components/LocaleProvider";
import { Logo } from "@/components/Logo";
import LanguageToggle from "@/components/LanguageToggle";
import "@/components/quiet/quiet.css";

/* ─── Gold checkmark icon ───────────────────────────────────────────────────── */
function GoldCheck() {
  return (
    <span className="qp-checklist__icon" aria-hidden>
      <svg viewBox="0 0 10 10" fill="none" aria-hidden>
        <path d="M2 5l2.5 2.5L8 3" stroke="var(--qp-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────────── */
export default function Home() {
  const { m, locale } = useI18n();
  const isHe = locale === "he";

  /* Hero menu */
  const [menuOpen, setMenuOpen]   = useState(false);
  const [prosOpen, setProsOpen]   = useState(false);
  const prosRef       = useRef<HTMLDivElement>(null);
  const prosButtonRef = useRef<HTMLButtonElement>(null);
  const prosMenuId    = useId();

  /* Close pros menu on outside click */
  useEffect(() => {
    if (!prosOpen) return;
    function onPointer(e: PointerEvent) {
      if (!prosRef.current?.contains(e.target as Node)) setProsOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setProsOpen(false); prosButtonRef.current?.focus(); }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [prosOpen]);

  return (
    <main style={{ fontFamily: "var(--font-heebo), 'Heebo', sans-serif" }}>

      {/* ── Hero ──────────────────────────────────────────────────────────────── */}
      <section className="qp-home-hero" aria-label={m.quiet.heroNav}>
        {/* Background image */}
        <div className="qp-home-hero__media">
          <Image
            src="/images/hero-desktop.jpg"
            alt={m.quiet.heroAlt}
            fill
            priority
            sizes="100vw"
            className="qp-home-hero__img"
          />
          {/* Ivory-to-transparent gradient toward the text side for legibility.
              In RTL the text is on the right so gradient runs left→right (to left = away from text).
              In LTR the text is on the left so gradient runs right→left. */}
          <div style={{
            position: "absolute", inset: 0, zIndex: 1,
            background: isHe
              ? "linear-gradient(to left, rgba(245,242,236,0.78) 0%, rgba(245,242,236,0.52) 38%, rgba(245,242,236,0) 65%)"
              : "linear-gradient(to right, rgba(245,242,236,0.78) 0%, rgba(245,242,236,0.52) 38%, rgba(245,242,236,0) 65%)",
          }} />
        </div>

        {/* Glassmorphism nav */}
        <header className="qp-home-nav">
          <Logo href="/" height={22} />
          <nav
            className={`qp-home-nav__links${menuOpen ? " is-open" : ""}`}
            aria-label={m.home.how}
          >
            <a href="#s01-title"  onClick={() => setMenuOpen(false)}>{isHe ? "פתרון" : "Solution"}</a>
            <a href="#match"      onClick={() => setMenuOpen(false)}>{isHe ? "התאמה" : "Matching"}</a>
            <a href="#developers" onClick={() => setMenuOpen(false)}>{isHe ? "יזמים" : "Developers"}</a>
          </nav>
          <div className="qp-home-nav__tools">
            <LanguageToggle />
            <Link href="/login" className="qp-home-login">{m.home.signIn}</Link>
            <button
              type="button"
              className="qp-home-menu-btn"
              aria-expanded={menuOpen}
              aria-label={menuOpen ? m.nav.closeMenu : m.nav.openMenu}
              onClick={() => setMenuOpen(o => !o)}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                {menuOpen ? <path d="M4 4l10 10M14 4L4 14" /> : <path d="M3 5h12M3 9h12M3 13h12" />}
              </svg>
            </button>
          </div>
        </header>

        {/* Hero copy — inline-start (right in RTL) */}
        <div className="qp-home-hero__copy" style={{ zIndex: 2 }}>
          <h1 className="qp-home-hero__title">
            <span className="qp-home-hero__line">{isHe ? "יש הרבה בתים." : "There are many homes."}</span>
            <span className="qp-home-hero__line">{isHe ? "אחד מהם שלך." : "One of them is yours."}</span>
          </h1>
          <p className="qp-home-hero__body">
            {isHe
              ? "שיחה אחת עם AI, התאמה לבית שמתאים לחייך."
              : "One AI conversation. A match for the home that fits your life."}
          </p>
          <Link href="/register" className="qp-home-hero__cta">
            <span>{m.home.getStarted}</span>
            <span aria-hidden>{isHe ? "←" : "→"}</span>
          </Link>
          <div className="qp-home-hero__pros" ref={prosRef}>
            <button
              ref={prosButtonRef}
              type="button"
              className="qp-home-hero__pros-btn"
              aria-expanded={prosOpen}
              aria-controls={prosMenuId}
              onClick={() => setProsOpen(o => !o)}
            >
              {m.home.forPros}
            </button>
            {prosOpen && (
              <ul id={prosMenuId} className="qp-home-hero__menu" role="menu" aria-label={m.home.openPros}>
                <li role="none">
                  <Link role="menuitem" href="/dev/register" onClick={() => setProsOpen(false)}>{m.nav.roleDeveloper}</Link>
                </li>
                <li role="none">
                  <Link role="menuitem" href="/seller/register" onClick={() => setProsOpen(false)}>{m.nav.roleSeller}</Link>
                </li>
              </ul>
            )}
          </div>
        </div>

        {/* Scroll cue */}
        <a className="qp-home-hero__cue" href="#s01-title" style={{ zIndex: 2 }}>
          <span>{m.home.scrollCue}</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
            <path d="M3 6l5 5 5-5" />
          </svg>
        </a>
      </section>

      {/* ── Section 01: City ─────────────────────────────────────────────────── */}
      <section className="qp-section" aria-labelledby="s01-title">
        <div className="qp-wrap">
          <div className="qp-cols">
            {/* Copy */}
            <div className="qp-stack">
              <div className="qp-section-num" aria-hidden>
                <span className="qp-section-num__digit">01</span>
                <hr className="qp-section-num__line" />
              </div>
              <h2 id="s01-title" className="qp-h2">{m.home.section01Title}</h2>
              <p className="qp-body">{m.home.section01Body}</p>
              <div>
                <Link href="/register" className="qp-btn qp-btn--primary" style={{ marginTop: 8 }}>
                  {m.home.getStarted}
                </Link>
              </div>
            </div>
            {/* Image */}
            <div style={{ position: "relative", borderRadius: 20, overflow: "hidden", aspectRatio: "4/3", background: "var(--qp-soft)" }}>
              <Image
                src="/images/section-01-city.jpg"
                alt={isHe ? "נוף עירוני של פרויקטים חדשים" : "City view of new developments"}
                fill
                loading="eager"
                sizes="(max-width:768px) 100vw, 50vw"
                style={{ objectFit: "cover" }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 02: Advisor ──────────────────────────────────────────────── */}
      <section className="qp-section" style={{ background: "var(--qp-soft)" }} aria-labelledby="s02-title">
        <div className="qp-wrap">
          <div className="qp-cols" style={{ direction: "ltr" }}>
            {/* Image with floating card */}
            <div style={{ position: "relative", borderRadius: 20, overflow: "hidden", aspectRatio: "4/3", background: "var(--qp-bg)", direction: "rtl" }}>
              <Image
                src="/images/section-02-advisor.jpg"
                alt={isHe ? "פורטרט של יועצת" : "Advisor portrait"}
                fill
                loading="eager"
                sizes="(max-width:768px) 100vw, 50vw"
                style={{ objectFit: "cover", objectPosition: "top center" }}
              />
              {/* Floating advisor card */}
              <div
                className="qp-float-caption"
                style={{ position: "absolute", bottom: 20, insetInlineStart: 20, zIndex: 2 }}
                aria-label={m.home.section02AI}
              >
                <div className="qp-float-caption__dot" style={{ background: "var(--qp-accent)" }} />
                <div>
                  <div className="qp-float-caption__value" style={{ fontSize: 16, fontWeight: 600 }}>
                    {isHe ? "דנה" : "Dana"}
                  </div>
                  <div className="qp-float-caption__label">{m.home.section02AI}</div>
                </div>
                {/* Mic button */}
                <button
                  type="button"
                  aria-label={isHe ? "התחלת ראיון קולי" : "Start voice interview"}
                  style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: "var(--qp-ink)", border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", marginInlineStart: 4,
                  }}
                  onClick={() => window.location.href = "/interview"}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                    <rect x="4.5" y="1" width="5" height="8" rx="2.5" fill="currentColor" />
                    <path d="M2 7c0 2.761 2.239 5 5 5s5-2.239 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                    <line x1="7" y1="12" x2="7" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>
            {/* Copy */}
            <div className="qp-stack" style={{ direction: isHe ? "rtl" : "ltr" }}>
              <div className="qp-section-num" aria-hidden>
                <span className="qp-section-num__digit">02</span>
                <hr className="qp-section-num__line" />
              </div>
              <div className="qp-kicker">{m.home.section02Kicker}</div>
              <h2 id="s02-title" className="qp-h2">{m.home.section02Title}</h2>
              <p className="qp-body">{m.home.section02Body}</p>
              <div>
                <Link href="/interview" className="qp-btn qp-btn--primary" style={{ marginTop: 8 }}>
                  {m.home.startInterview}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 03: Match ────────────────────────────────────────────────── */}
      <section id="match" className="qp-section" aria-labelledby="s03-title">
        <div className="qp-wrap">
          <div style={{ marginBottom: 48 }}>
            <div className="qp-section-num" aria-hidden>
              <span className="qp-section-num__digit">03</span>
              <hr className="qp-section-num__line" />
            </div>
            <div className="qp-kicker" style={{ marginBottom: 8 }}>{m.home.section03Kicker}</div>
            <h2 id="s03-title" className="qp-h2">{m.home.section03Title}</h2>
          </div>

          <div className="qp-cols">
            {/* Image with 92% badge */}
            <div style={{ position: "relative" }}>
              <div style={{ position: "relative", borderRadius: 20, overflow: "hidden", aspectRatio: "4/5", background: "var(--qp-soft)" }}>
                <Image
                  src="/images/section-03-apartment.png"
                  alt={isHe ? "הדמיית דירה" : "Apartment rendering"}
                  fill
                  sizes="(max-width:768px) 100vw, 46vw"
                  style={{ objectFit: "cover" }}
                />
              </div>
              {/* 92% float badge */}
              <div
                className="qp-float-caption"
                style={{ position: "absolute", bottom: 20, insetInlineEnd: -16, zIndex: 2 }}
                aria-label={`92% ${m.home.section03CaptionLabel}`}
              >
                <div className="qp-float-caption__dot" />
                <div>
                  <div className="qp-float-caption__value">92%</div>
                  <div className="qp-float-caption__label">{m.home.section03CaptionLabel}</div>
                </div>
              </div>
            </div>

            {/* Checklist + details */}
            <div className="qp-stack" style={{ gap: 28 }}>
              <ul className="qp-checklist" style={{ gap: 16 }}>
                {[m.home.section03Check1, m.home.section03Check2, m.home.section03Check3].map(text => (
                  <li key={text}>
                    <GoldCheck />
                    <span style={{ fontSize: 16, lineHeight: 1.5 }}>{text}</span>
                  </li>
                ))}
              </ul>

              <p className="qp-body">{m.home.section03Body}</p>

              {/* Price + contract strip */}
              <div style={{
                display: "flex", alignItems: "center", gap: 16,
                padding: "16px 20px", borderRadius: 12,
                background: "var(--qp-soft)", border: "1px solid var(--qp-border)",
              }}>
                <div>
                  <div style={{ fontSize: 12, color: "var(--qp-muted)", marginBottom: 2 }}>
                    {isHe ? "מחיר מבוקש · המחשה" : "Asking price · illustrative"}
                  </div>
                  <div className="qp-num" style={{ fontSize: 24, fontWeight: 300, color: "var(--qp-ink)" }}>
                    ₪2,450,000
                  </div>
                </div>
                <div style={{ marginInlineStart: "auto", position: "relative", width: 72, height: 56, flexShrink: 0 }}>
                  <Image
                    src="/images/section-03-contract.png"
                    alt={isHe ? "חוזה מכירה" : "Sale contract"}
                    fill
                    style={{ objectFit: "contain", objectPosition: "center" }}
                  />
                </div>
              </div>

              <Link href="/register" className="qp-btn qp-btn--secondary" style={{ alignSelf: "flex-start" }}>
                {isHe ? "מציאת ההתאמה שלי ←" : "Find my match →"}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ────────────────────────────────────────────────────────── */}
      <section style={{ background: "var(--qp-soft)" }} aria-label={isHe ? "נתונים" : "Statistics"}>
        <div className="qp-wrap">
          <div className="qp-data-row">
            {[
              { value: "12,000+", label: m.home.stat1 },
              { value: "3×",      label: m.home.stat2 },
              { value: "40+",     label: m.home.stat3 },
              { value: "100%",    label: m.home.stat4 },
            ].map(({ value, label }) => (
              <div key={label} className="qp-data-row__item">
                <div className="qp-data-row__value qp-num">{value}</div>
                <div className="qp-data-row__label">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 05: Developers ───────────────────────────────────────────── */}
      <section
        id="developers"
        className="qp-section"
        aria-labelledby="s05-title"
        style={{ position: "relative", overflow: "hidden", color: "#fff" }}
      >
        {/* Background image with teal overlay */}
        <div style={{ position: "absolute", inset: 0 }}>
          <Image
            src="/images/section-05-developers.jpg"
            alt=""
            fill
            sizes="100vw"
            style={{ objectFit: "cover" }}
          />
          <div style={{ position: "absolute", inset: 0, background: "rgba(18,63,64,0.72)" }} />
        </div>
        <div className="qp-wrap" style={{ position: "relative", zIndex: 1 }}>
          <div className="qp-cols">
            <div className="qp-stack">
              <div className="qp-section-num" aria-hidden>
                <span className="qp-section-num__digit" style={{ color: "var(--qp-accent)" }}>05</span>
                <hr className="qp-section-num__line" />
              </div>
              <div className="qp-kicker" style={{ color: "var(--qp-accent)" }}>{m.home.section05Kicker}</div>
              <h2 id="s05-title" className="qp-h2" style={{ color: "#fff" }}>{m.home.section05Title}</h2>
              <p className="qp-body" style={{ color: "rgba(255,255,255,0.78)" }}>{m.home.section05Body}</p>
              <div>
                <Link href="/dev/register" className="qp-btn qp-btn--light" style={{ marginTop: 8 }}>
                  {m.home.section05Cta}
                </Link>
              </div>
            </div>
            {/* Right: checklist on dark */}
            <div>
              <ul className="qp-checklist" style={{ gap: 16 }}>
                {[
                  isHe ? "אימות מול הרשם הרשמי" : "Verified against the official registry",
                  isHe ? "חשיפה לרוכשים עם פרופיל מתאים" : "Surfaced to matched buyer profiles",
                  isHe ? "פורטל ניהול פרויקטים מלא"  : "Full project management portal",
                ].map(text => (
                  <li key={text}>
                    <span className="qp-checklist__icon" style={{ borderColor: "var(--qp-accent)" }} aria-hidden>
                      <svg viewBox="0 0 10 10" fill="none" aria-hidden>
                        <path d="M2 5l2.5 2.5L8 3" stroke="var(--qp-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span style={{ color: "rgba(255,255,255,0.88)" }}>{text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA section ──────────────────────────────────────────────────────── */}
      <section
        style={{ position: "relative", overflow: "hidden", minHeight: 440 }}
        aria-label={isHe ? "התחלה" : "Get started"}
      >
        <Image
          src="/images/cta-living-room.jpg"
          alt=""
          fill
          sizes="100vw"
          style={{ objectFit: "cover" }}
        />
        <div style={{ position: "absolute", inset: 0, background: "rgba(18,63,64,0.58)" }} />
        <div
          style={{
            position: "relative", zIndex: 1,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            minHeight: 440, textAlign: "center",
            padding: "5rem 2rem",
          }}
        >
          <h2 style={{ margin: 0, color: "#fff", fontWeight: 300, fontSize: "clamp(36px,4vw,60px)", lineHeight: 1.15 }}>
            {m.home.ctaTitleA}<br />{m.home.ctaTitleB}
          </h2>
          <p style={{ marginTop: 20, color: "rgba(255,255,255,0.78)", fontSize: 18, maxWidth: 480 }}>
            {m.home.ctaBody}
          </p>
          <Link href="/register" className="qp-btn qp-btn--light" style={{ marginTop: 32, fontSize: 17 }}>
            {m.home.getStarted}
            <span aria-hidden style={{ marginInlineStart: 6 }}>{isHe ? "←" : "→"}</span>
          </Link>
        </div>
      </section>

    </main>
  );
}
