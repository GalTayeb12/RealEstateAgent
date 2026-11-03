"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useI18n } from "@/components/LocaleProvider";
import { Brand, Card, GlassPanel, HqLang } from "@/components/ui";
import "@/components/ui/haven.css";
import "./home-hero.css";

const SELLER_EIL = 55;
const SELLER_AIL = 84;

export default function Home() {
  const [ej, setEj] = useState(88);
  const [aj, setAj] = useState(62);
  const [menuOpen, setMenuOpen] = useState(false);
  const [prosOpen, setProsOpen] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const prosRef = useRef<HTMLDivElement>(null);
  const prosButtonRef = useRef<HTMLButtonElement>(null);
  const prosMenuId = useId();
  const { m, locale } = useI18n();

  const lowerBound = Math.max(SELLER_EIL, aj);
  const upperBound = Math.min(ej, SELLER_AIL);
  const feasible = lowerBound <= upperBound;
  const zij = feasible ? (2 * upperBound - SELLER_EIL - ej).toFixed(1) : null;

  const steps = [
    { title: m.home.step1t, body: m.home.step1b },
    { title: m.home.step2t, body: m.home.step2b },
    { title: m.home.step3t, body: m.home.step3b },
    { title: m.home.step4t, body: m.home.step4b },
  ];

  const navLinks = [
    { href: "/", label: m.home.navHome },
    { href: "/results", label: m.nav.results },
    { href: "#how-it-works", label: m.home.how },
    { href: "#scoring", label: m.home.scoring },
    { href: "#group-buying", label: m.home.groupBuying },
  ];

  useEffect(() => {
    if (!prosOpen) return;
    function onPointer(event: PointerEvent) {
      if (!prosRef.current?.contains(event.target as Node)) setProsOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setProsOpen(false);
        prosButtonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [prosOpen]);

  const hebrewTitle = locale === "he";

  return (
    <main className="hq">
      <section className="hh" aria-label={m.quiet.heroNav}>
        <div className="hh__media">
          {photoFailed ? (
            <p className="hh__missing">{m.quiet.missingPhoto}</p>
          ) : (
            <Image
              src="/images/haveniq-hero-v2.jpg"
              alt={m.quiet.heroAlt}
              fill
              priority
              unoptimized
              sizes="100vw"
              className="hh__img"
              onError={() => setPhotoFailed(true)}
            />
          )}
        </div>

        <header className="hh__bar">
          <div className="hh__brand">
            <Brand />
          </div>
          <nav className={`hh__links${menuOpen ? " is-open" : ""}`} aria-label={m.home.how}>
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} onClick={() => setMenuOpen(false)}>{link.label}</a>
            ))}
          </nav>
          <div className="hh__tools">
            <HqLang />
            <Link href="/login" className="hh__login">{m.home.signIn}</Link>
            <button
              type="button"
              className="hh__menu-btn"
              aria-expanded={menuOpen}
              aria-label={menuOpen ? m.nav.closeMenu : m.nav.openMenu}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                {menuOpen ? (
                  <path d="M4 4l10 10M14 4L4 14" />
                ) : (
                  <path d="M3 5h12M3 9h12M3 13h12" />
                )}
              </svg>
            </button>
          </div>
        </header>

        <div className="hh__copy">
          <h1 className="hh__title">
            {hebrewTitle ? (
              <>
                <span className="hh__line">יש הרבה בתים.</span>
                <span className="hh__line">אחד מהם שלך.</span>
              </>
            ) : (
              m.quiet.heroTitle
            )}
          </h1>
          <p className="hh__body">{m.quiet.heroBody}</p>
          <Link href="/register" className="hh__cta">
            <span>{m.quiet.heroCta}</span>
            <span aria-hidden>{hebrewTitle ? "←" : "→"}</span>
          </Link>
          <div className="hh__pros" ref={prosRef}>
            <button
              ref={prosButtonRef}
              type="button"
              className="hh__pros-btn"
              aria-expanded={prosOpen}
              aria-controls={prosMenuId}
              onClick={() => setProsOpen((open) => !open)}
            >
              {m.home.forPros}
            </button>
            {prosOpen && (
              <ul id={prosMenuId} className="hh__menu" role="menu" aria-label={m.home.openPros}>
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

        <a className="hh__cue" href="#how-it-works">
          <span>{m.home.scrollCue}</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
            <path d="M3 6l5 5 5-5" />
          </svg>
        </a>
      </section>

      <div className="hq-page">

        <p className="hq-quiet">{m.home.quiet}</p>

        <section id="how-it-works" className="hq-block">
          <div className="hq-kicker">{m.home.howKicker}</div>
          <h2>{m.home.howTitle}</h2>
          <div className="hq-grid" style={{ marginTop: "1.25rem" }}>
            {steps.map((step, index) => (
              <Card key={step.title} kicker={`0${index + 1}`} title={step.title}>{step.body}</Card>
            ))}
          </div>
        </section>

        <section id="scoring" className="hq-block">
          <div className="hq-grid" style={{ alignItems: "center" }}>
            <div>
              <div className="hq-kicker">{m.home.techKicker}</div>
              <h2>{m.home.techTitle}</h2>
              <p className="hq-lead">{m.home.techBody}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem", maxWidth: "22rem", marginTop: "1.5rem" }}>
                <label>
                  <span className="hq-split" style={{ fontSize: "0.8125rem", color: "var(--hq-muted)", marginBottom: "0.4rem" }}>
                    <span>{m.home.ideal}</span>
                    <span className="hq-num" style={{ color: "var(--hq-gold)" }}>{ej}</span>
                  </span>
                  <input className="hq-range" type="range" min={60} max={100} value={ej} onChange={(e) => setEj(Number(e.target.value))} />
                </label>
                <label>
                  <span className="hq-split" style={{ fontSize: "0.8125rem", color: "var(--hq-muted)", marginBottom: "0.4rem" }}>
                    <span>{m.home.floor}</span>
                    <span className="hq-num" style={{ color: "var(--hq-gold)" }}>{aj}</span>
                  </span>
                  <input className="hq-range" type="range" min={40} max={80} value={aj} onChange={(e) => setAj(Number(e.target.value))} />
                </label>
              </div>
            </div>

            <GlassPanel>
              <div style={{ padding: "1.35rem" }}>
                <div className="hq-split" style={{ marginBottom: "1.1rem" }}>
                  <div>
                    <div className="hq-kicker">{m.home.sampleMatch}</div>
                    <div style={{ fontWeight: 600 }}>{m.home.sampleName}</div>
                  </div>
                  {feasible ? (
                    <div style={{ textAlign: "end" }}>
                      <div className="hq-kicker">{m.home.surplus}</div>
                      <div className="hq-num hq-score" style={{ fontSize: "1.6rem" }}>{zij}</div>
                    </div>
                  ) : (
                    <span className="hq-pill hq-pill--danger">{m.home.noOverlap}</span>
                  )}
                </div>
                <div className="hq-axis">
                  <div className="hq-bar" aria-hidden>
                    <span style={{ left: "55%", width: "29%", background: "rgba(18,63,64,0.28)" }} />
                    <span style={{ left: `${Math.max(0, Math.min(100, aj))}%`, width: `${Math.max(0, ej - aj)}%`, background: "rgba(181,160,120,0.55)" }} />
                    {feasible && (
                      <span style={{ left: `${Math.max(0, Math.min(100, lowerBound))}%`, width: `${Math.max(0, upperBound - lowerBound)}%`, background: "var(--hq-gold)" }} />
                    )}
                  </div>
                  <div className="hq-ticks hq-num">
                    <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
                  </div>
                </div>
                <div className="hq-legend">
                  <span><i style={{ background: "rgba(18,63,64,0.45)" }} />{m.home.sellerRange}</span>
                  <span><i style={{ background: "var(--hq-gold)" }} />{m.home.yourRange}</span>
                </div>
              </div>
            </GlassPanel>
          </div>
        </section>

        <section className="hq-block">
          <div className="hq-kicker">{m.home.verifiedKicker}</div>
          <h2>{m.home.verifiedTitle}</h2>
          <div className="hq-grid" style={{ marginTop: "1.25rem" }}>
            <Card title={m.home.v1t}>{m.home.v1b}</Card>
            <Card title={m.home.v2t}>{m.home.v2b}</Card>
            <Card title={m.home.v3t}>{m.home.v3b}</Card>
          </div>
        </section>

        <section id="group-buying" className="hq-block">
          <div className="hq-grid" style={{ alignItems: "center" }}>
            <div>
              <div className="hq-kicker">{m.home.groupKicker}</div>
              <h2>{m.home.groupTitle}</h2>
              <p className="hq-lead">{m.home.groupBody}</p>
              <Link href="/buyer/leverage-groups" className="hq-btn hq-btn--ghost" style={{ marginTop: "1.25rem" }}>{m.home.findGroup}</Link>
            </div>
            <GlassPanel>
              <div style={{ padding: "1.5rem", textAlign: "center" }}>
                <div className="hq-people hq-num">
                  <span>1</span><span>2</span><span>3</span>
                </div>
                <div style={{ marginTop: "1.25rem" }}>
                  <div className="hq-kicker">{m.home.requested}</div>
                  <div style={{ fontWeight: 600, fontSize: "1.15rem" }}>{m.home.groupSample}</div>
                  <div className="hq-num" style={{ color: "var(--hq-gold)", marginTop: "0.4rem" }}>{m.home.groupDiscount}</div>
                </div>
              </div>
            </GlassPanel>
          </div>
        </section>

        <section className="hq-block">
          <GlassPanel>
            <div style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
              <h2 style={{ fontSize: "clamp(1.8rem, 3vw, 2.4rem)" }}>{m.home.ctaTitleA}<br />{m.home.ctaTitleB}</h2>
              <p className="hq-lead" style={{ margin: "0.8rem auto 1.5rem" }}>{m.home.ctaBody}</p>
              <Link href="/register" className="hq-btn hq-btn--primary">{m.home.getStarted}</Link>
            </div>
          </GlassPanel>
        </section>
      </div>
    </main>
  );
}
