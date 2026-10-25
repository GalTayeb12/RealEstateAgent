"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { useI18n } from "@/components/LocaleProvider";
import LanguageToggle from "@/components/LanguageToggle";

// ── Scoring demo constants (fixed seller range) ───────────────────────────────
const SELLER_EIL = 55;
const SELLER_AIL = 84;

// ── Animated counter (hero score) ─────────────────────────────────────────────
function useCountUp(target: number, duration = 1100) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(eased * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

// ── Scroll-reveal hook ────────────────────────────────────────────────────────
function useScrollReveal() {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const pending = useRef<Map<string, Element>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const key = (entry.target as HTMLElement).dataset.revealKey;
            if (key) {
              setRevealed((prev) => ({ ...prev, [key]: true }));
              obs.unobserve(entry.target);
            }
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    observerRef.current = obs;
    pending.current.forEach((el, key) => {
      (el as HTMLElement).dataset.revealKey = key;
      obs.observe(el);
    });
    pending.current.clear();
    return () => obs.disconnect();
  }, []);

  function revealRef(key: string) {
    return (el: Element | null) => {
      if (!el) return;
      (el as HTMLElement).dataset.revealKey = key;
      if (observerRef.current) {
        observerRef.current.observe(el);
      } else {
        pending.current.set(key, el);
      }
    };
  }

  function revealStyle(key: string, extra?: React.CSSProperties): React.CSSProperties {
    return {
      opacity: revealed[key] ? 1 : 0,
      transform: revealed[key] ? "translateY(0)" : "translateY(26px)",
      transition: "opacity 0.8s cubic-bezier(0.16,1,0.3,1), transform 0.8s cubic-bezier(0.16,1,0.3,1)",
      ...extra,
    };
  }

  return { revealStyle, revealRef };
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Home() {
  const heroScore = useCountUp(92);
  const [ej, setEj] = useState(88);
  const [aj, setAj] = useState(62);
  const { revealStyle, revealRef } = useScrollReveal();
  const { m } = useI18n();

  // Scoring math
  const lowerBound = Math.max(SELLER_EIL, aj);
  const upperBound = Math.min(ej, SELLER_AIL);
  const feasible = lowerBound <= upperBound;
  const zij = feasible ? (2 * upperBound - SELLER_EIL - ej).toFixed(1) : null;

  return (
    <main style={{ minHeight: "100vh", background: "#FAF8F4", fontFamily: "var(--font-inter), ui-sans-serif, sans-serif", color: "#1C1B19" }}>

      {/* ── Animations ──────────────────────────────────────────────────────── */}
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); }
          30%            { transform: translateY(-4px); }
        }
        @keyframes floatSlow {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-8px); }
        }
        .hp-step-card { transition: transform 0.35s cubic-bezier(0.16,1,0.3,1), box-shadow 0.35s; }
        .hp-step-card:hover { transform: translateY(-4px); box-shadow: 0 24px 40px -24px rgba(18,51,50,0.3) !important; }
        @media (max-width: 720px) {
          .hp-nav-anchors { display: none !important; }
        }
      `}</style>

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <div style={{ position: "sticky", top: 0, zIndex: 30, background: "rgba(250,248,244,0.85)", backdropFilter: "blur(16px) saturate(1.3)", borderBottom: "1px solid rgba(28,27,25,0.07)" }}>
        <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "1.375rem 2.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1.5rem", flexWrap: "wrap" }}>
          {/* Logo */}
          <div style={{ flexShrink: 0 }}>
            <img src="/haveniq_logo_horizontal.png" alt="Haveniq" style={{ height: 34, width: "auto" }} />
          </div>
          {/* Anchor nav — hidden on narrow screens so the language toggle stays in the bar */}
          <div className="hp-nav-anchors" style={{ display: "flex", alignItems: "center", gap: "2.25rem", flexWrap: "wrap" }}>
            <a href="#how-it-works" style={{ textDecoration: "none", color: "#55534C", fontSize: "0.9375rem", fontWeight: 600, whiteSpace: "nowrap" }}>{m.home.how}</a>
            <a href="#scoring"       style={{ textDecoration: "none", color: "#55534C", fontSize: "0.9375rem", fontWeight: 600, whiteSpace: "nowrap" }}>{m.home.scoring}</a>
            <a href="#group-buying"  style={{ textDecoration: "none", color: "#55534C", fontSize: "0.9375rem", fontWeight: 600, whiteSpace: "nowrap" }}>{m.home.groupBuying}</a>
          </div>
          {/* Auth */}
          <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", flexShrink: 0 }}>
            <LanguageToggle />
            <Link href="/login" style={{ textDecoration: "none", color: "#1C1B19", fontSize: "0.9375rem", fontWeight: 700, whiteSpace: "nowrap" }}>{m.home.signIn}</Link>
            <Link href="/register" style={{ textDecoration: "none", padding: "0.6875rem 1.5rem", borderRadius: 999, fontSize: "0.875rem", fontWeight: 700, color: "#fff", background: "linear-gradient(155deg, #2F6664, #123332)", boxShadow: "0 1px 0 rgba(255,255,255,0.18) inset, 0 10px 22px -10px rgba(18,51,50,0.65)", whiteSpace: "nowrap" }}>{m.home.getStarted}</Link>
          </div>
        </div>
      </div>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section style={{ position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(55% 45% at 84% 6%, rgba(47,102,100,0.12) 0%, rgba(47,102,100,0) 60%), radial-gradient(45% 38% at 6% 32%, rgba(200,155,60,0.10) 0%, rgba(200,155,60,0) 60%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", maxWidth: "80rem", margin: "0 auto", padding: "7.5rem 2.5rem 3rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: "3.5rem", alignItems: "center" }}>

          {/* Left: copy */}
          <div style={{ animation: "fadeUp 0.8s cubic-bezier(0.16,1,0.3,1) both" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.375rem 0.875rem 0.375rem 0.625rem", borderRadius: 999, background: "#fff", border: "1px solid rgba(31,75,74,0.16)", boxShadow: "0 1px 2px rgba(28,27,25,0.05)", marginBottom: "2rem", whiteSpace: "nowrap" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1F4B4A", display: "block", flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--font-jetbrains), monospace", fontSize: "0.6875rem", fontWeight: 500, letterSpacing: "0.06em", color: "#1F4B4A" }}>{m.home.badge}</span>
            </div>
            <h1 style={{ fontFamily: "var(--font-fraunces), serif", fontWeight: 800, fontSize: "clamp(2.5rem, 3.4vw + 1.25rem, 3.875rem)", lineHeight: 1.12, letterSpacing: "-0.02em", margin: "0 0 1.75rem", color: "#14130F" }}>
              {m.home.heroTitleA}<br /><span style={{ color: "#1F4B4A" }}>{m.home.heroTitleB}</span>
            </h1>
            <p style={{ fontSize: "1.1875rem", lineHeight: 1.65, color: "#565349", maxWidth: "29rem", margin: "0 0 2.5rem", fontWeight: 400 }}>
              {m.home.heroBody}
            </p>
            <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", alignItems: "center" }}>
              <Link href="/register" style={{ textDecoration: "none", padding: "1rem 2rem", borderRadius: 999, fontSize: "1rem", fontWeight: 700, color: "#fff", background: "linear-gradient(155deg, #2F6664, #123332)", boxShadow: "0 1px 0 rgba(255,255,255,0.18) inset, 0 14px 30px -12px rgba(18,51,50,0.55)", display: "inline-block" }}>{m.home.startInterview}</Link>
              <a href="#scoring" style={{ textDecoration: "none", padding: "1rem 0.5rem", fontSize: "1rem", fontWeight: 700, color: "#1C1B19", borderBottom: "1.5px solid rgba(28,27,25,0.25)" }}>{m.home.seeScoring}</a>
            </div>
          </div>

          {/* Right: visual stack */}
          <div style={{ animation: "fadeUp 0.9s cubic-bezier(0.16,1,0.3,1) 0.15s both" }}>
            <div style={{ position: "relative", aspectRatio: "4/5", maxWidth: "26rem", margin: "0 auto", width: "100%" }}>
              {/* Property photo */}
              <div style={{ position: "absolute", inset: 0, borderRadius: 28, overflow: "hidden", boxShadow: "0 2px 6px rgba(28,27,25,0.04), 0 40px 70px -30px rgba(18,51,50,0.28)" }}>
                <Image
                  src="/images/hero-property.png"
                  alt={m.home.heroAlt}
                  fill
                  style={{ objectFit: "cover" }}
                  priority
                />
              </div>

              {/* AI interview card */}
              <div style={{ position: "absolute", top: "1.25rem", left: "1.25rem", right: "4rem", background: "rgba(255,255,255,0.97)", backdropFilter: "blur(6px)", borderRadius: 14, padding: "1rem 1.125rem", boxShadow: "0 16px 32px -16px rgba(28,27,25,0.3)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#1F4B4A", display: "block" }} />
                  <span style={{ fontFamily: "var(--font-jetbrains), monospace", fontSize: "0.625rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#1F4B4A" }}>{m.home.aiInterview}</span>
                </div>
                <div style={{ background: "#F0EDE8", borderRadius: "10px 10px 10px 3px", padding: "0.5rem 0.75rem", fontSize: "0.8125rem", color: "#1C1B19", marginBottom: "0.5rem", maxWidth: "92%" }}>{m.home.aiQuestion}</div>
                <div style={{ background: "#1F4B4A", borderRadius: "10px 10px 3px 10px", padding: "0.5rem 0.75rem", fontSize: "0.8125rem", color: "#fff", marginInlineStart: "auto", maxWidth: "92%" }}>{m.home.aiAnswer}</div>
                <div style={{ display: "flex", gap: "0.25rem", marginTop: "0.625rem", paddingLeft: "0.25rem" }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#8C8A80", display: "block", animation: "typingBounce 1.2s ease-in-out infinite" }} />
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#8C8A80", display: "block", animation: "typingBounce 1.2s ease-in-out 0.15s infinite" }} />
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#8C8A80", display: "block", animation: "typingBounce 1.2s ease-in-out 0.3s infinite" }} />
                </div>
              </div>

              {/* Match score card */}
              <div style={{ position: "absolute", left: "1.25rem", bottom: "1.25rem", right: "1.25rem", background: "#fff", borderRadius: 14, padding: "1.125rem 1.25rem", boxShadow: "0 20px 40px -18px rgba(28,27,25,0.28)", animation: "floatSlow 6s ease-in-out infinite" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.5rem" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.9375rem", color: "#1C1B19" }}>{m.home.sampleName}</div>
                  <div style={{ fontFamily: "var(--font-jetbrains), monospace", fontSize: "1.375rem", fontWeight: 700, background: "linear-gradient(155deg, #2F6664, #123332)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", flexShrink: 0 }}>{heroScore}</div>
                </div>
                <p style={{ margin: 0, fontSize: "0.75rem", color: "#6B6860", lineHeight: 1.5 }}>{m.home.sampleWhy}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Quiet statement ──────────────────────────────────────────────────── */}
      <section style={{ maxWidth: "80rem", margin: "0 auto", padding: "8.5rem 2.5rem 6rem" }}>
        <p style={{ textAlign: "center", fontWeight: 600, fontSize: "1.625rem", lineHeight: 1.5, letterSpacing: "-0.01em", color: "#33322C", maxWidth: "42rem", margin: "0 auto" }}>
          {m.home.quiet}
        </p>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────────── */}
      <section
        id="how-it-works"
        ref={revealRef("howItWorks") as React.RefCallback<HTMLElement>}
        style={revealStyle("howItWorks", { maxWidth: "80rem", margin: "0 auto", padding: "2rem 2.5rem 8rem" })}
      >
        <div style={{ maxWidth: "34rem", margin: "0 0 3.75rem" }}>
          <div style={{ fontFamily: "var(--font-jetbrains), monospace", fontSize: "0.75rem", fontWeight: 500, letterSpacing: "0.08em", color: "#1F4B4A", marginBottom: "1rem" }}>{m.home.howKicker}</div>
          <h2 style={{ fontFamily: "var(--font-fraunces), serif", fontWeight: 800, fontSize: "2.375rem", lineHeight: 1.2, letterSpacing: "-0.015em", margin: 0, color: "#14130F" }}>{m.home.howTitle}</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.75rem" }}>
          {[
            {
              title: m.home.step1t,
              body: m.home.step1b,
              icon: <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2.5px solid #1F4B4A", display: "block" }} />,
            },
            {
              title: m.home.step2t,
              body: m.home.step2b,
              icon: <span style={{ width: 17, height: 11, border: "2.5px solid #1F4B4A", borderRadius: 2, display: "block" }} />,
            },
            {
              title: m.home.step3t,
              body: m.home.step3b,
              icon: <span style={{ width: 16, height: 16, border: "2.5px solid #1F4B4A", display: "block", transform: "rotate(45deg)" }} />,
            },
            {
              title: m.home.step4t,
              body: m.home.step4b,
              icon: (
                <span style={{ display: "flex", gap: 3 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#1F4B4A", display: "block" }} />
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#1F4B4A", display: "block", opacity: 0.55 }} />
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#1F4B4A", display: "block", opacity: 0.3 }} />
                </span>
              ),
            },
          ].map((card) => (
            <div key={card.title} className="hp-step-card" style={{ background: "#fff", borderRadius: 18, padding: "2rem 1.75rem", border: "1px solid rgba(28,27,25,0.06)", boxShadow: "0 1px 2px rgba(28,27,25,0.03)" }}>
              <div style={{ width: 46, height: 46, borderRadius: 12, background: "linear-gradient(155deg, #EEF4F3, #E1EBE9)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1.5rem" }}>
                {card.icon}
              </div>
              <h3 style={{ fontWeight: 700, fontSize: "1.1875rem", margin: "0 0 0.75rem", color: "#1C1B19", letterSpacing: "-0.01em" }}>{card.title}</h3>
              <p style={{ fontSize: "0.9375rem", lineHeight: 1.65, color: "#6B6860", margin: 0 }}>{card.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Scoring demo ─────────────────────────────────────────────────────── */}
      <section
        id="scoring"
        ref={revealRef("scoring") as React.RefCallback<HTMLElement>}
        style={revealStyle("scoring", { background: "linear-gradient(180deg, #F5F3EC 0%, #F1EFE6 100%)", borderTop: "1px solid rgba(28,27,25,0.06)", borderBottom: "1px solid rgba(28,27,25,0.06)" })}
      >
        <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "8rem 2.5rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: "4.5rem", alignItems: "center" }}>
          {/* Left: description + sliders */}
          <div>
            <div style={{ fontFamily: "var(--font-jetbrains), monospace", fontSize: "0.75rem", fontWeight: 500, letterSpacing: "0.08em", color: "#1F4B4A", marginBottom: "1rem" }}>{m.home.techKicker}</div>
            <h2 style={{ fontFamily: "var(--font-fraunces), serif", fontWeight: 800, fontSize: "2.375rem", lineHeight: 1.2, letterSpacing: "-0.015em", margin: "0 0 1.5rem", color: "#14130F" }}>{m.home.techTitle}</h2>
            <p style={{ fontSize: "1.0625rem", lineHeight: 1.7, color: "#565349", margin: "0 0 2.25rem", maxWidth: "29rem" }}>
              {m.home.techBody}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", maxWidth: "22rem" }}>
              <div>
                <label style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", fontWeight: 600, color: "#6B6860", marginBottom: "0.625rem" }}>
                  <span>{m.home.ideal}</span>
                  <span style={{ fontFamily: "var(--font-jetbrains), monospace", color: "#1F4B4A", fontWeight: 600 }}>{ej}</span>
                </label>
                <input type="range" min={60} max={100} value={ej} onChange={(e) => setEj(Number(e.target.value))} style={{ width: "100%", accentColor: "#1F4B4A" }} />
              </div>
              <div>
                <label style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", fontWeight: 600, color: "#6B6860", marginBottom: "0.625rem" }}>
                  <span>{m.home.floor}</span>
                  <span style={{ fontFamily: "var(--font-jetbrains), monospace", color: "#1F4B4A", fontWeight: 600 }}>{aj}</span>
                </label>
                <input type="range" min={40} max={80} value={aj} onChange={(e) => setAj(Number(e.target.value))} style={{ width: "100%", accentColor: "#1F4B4A" }} />
              </div>
            </div>
          </div>

          {/* Right: live match card */}
          <div style={{ background: "#FFFFFF", borderRadius: 20, border: "1px solid rgba(28,27,25,0.06)", boxShadow: "0 2px 4px rgba(28,27,25,0.03), 0 40px 70px -36px rgba(28,27,25,0.25)", padding: "2rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", marginBottom: "1.5rem", paddingBottom: "1.5rem", borderBottom: "1px solid rgba(28,27,25,0.07)" }}>
              <div style={{ width: 52, height: 52, borderRadius: 10, overflow: "hidden", flexShrink: 0, position: "relative" }}>
                <Image src="https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=120&q=80" alt="Sample property" fill style={{ objectFit: "cover" }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-jetbrains), monospace", fontSize: "0.625rem", fontWeight: 500, letterSpacing: "0.06em", color: "#1F4B4A" }}>{m.home.sampleMatch}</div>
                <div style={{ fontWeight: 700, fontSize: "1.0625rem", color: "#1C1B19", letterSpacing: "-0.01em" }}>{m.home.sampleName}</div>
              </div>
              {feasible ? (
                <div style={{ background: "linear-gradient(155deg, #EEF4F3, #E1EBE9)", borderRadius: 12, padding: "0.625rem 1rem", textAlign: "right", whiteSpace: "nowrap" }}>
                  <div style={{ fontSize: "0.625rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "#1F4B4A" }}>{m.home.surplus}</div>
                  <div style={{ fontFamily: "var(--font-jetbrains), monospace", fontWeight: 600, fontSize: "1.375rem", color: "#123332" }}>{zij}</div>
                </div>
              ) : (
                <div style={{ background: "#FAE8E8", borderRadius: 12, padding: "0.625rem 1rem", textAlign: "right", whiteSpace: "nowrap" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#B04040" }}>{m.home.noOverlap}</div>
                </div>
              )}
            </div>
            {/* Score bar */}
            <div style={{ position: "relative", height: "1.5rem", background: "#EFEDE6", borderRadius: 7, overflow: "hidden" }}>
              {/* Seller range */}
              <div style={{ position: "absolute", top: 0, bottom: 0, left: "55%", width: "29%", background: "#B7CCCA" }} />
              {/* Buyer range */}
              <div style={{ position: "absolute", top: 0, bottom: 0, background: "#C89B3C", opacity: 0.4, left: `${Math.max(0, Math.min(100, aj))}%`, width: `${Math.max(0, ej - aj)}%` }} />
              {/* Overlap */}
              {feasible && (
                <div style={{ position: "absolute", top: 0, bottom: 0, background: "linear-gradient(90deg, #123332, #2F6664)", left: `${Math.max(0, Math.min(100, lowerBound))}%`, width: `${Math.max(0, upperBound - lowerBound)}%` }} />
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.625rem", fontFamily: "var(--font-jetbrains), monospace", fontSize: "0.6875rem", color: "#B0AC9F" }}>
              <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
            </div>
            <div style={{ display: "flex", gap: "1.25rem", marginTop: "1.375rem", fontSize: "0.75rem", color: "#6B6860" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "#B7CCCA", display: "inline-block" }} />{m.home.sellerRange}</span>
              <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "#C89B3C", display: "inline-block", opacity: 0.7 }} />{m.home.yourRange}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────────────────────── */}
      <section
        ref={revealRef("stats") as React.RefCallback<HTMLElement>}
        style={revealStyle("stats", { maxWidth: "80rem", margin: "0 auto", padding: "8rem 2.5rem" })}
      >
        <div style={{ maxWidth: "34rem", margin: "0 0 3.75rem" }}>
          <div style={{ fontFamily: "var(--font-jetbrains), monospace", fontSize: "0.75rem", fontWeight: 500, letterSpacing: "0.08em", color: "#1F4B4A", marginBottom: "1rem" }}>{m.home.numbersKicker}</div>
          <h2 style={{ fontFamily: "var(--font-fraunces), serif", fontWeight: 800, fontSize: "2.375rem", lineHeight: 1.2, letterSpacing: "-0.015em", margin: 0, color: "#14130F" }}>{m.home.numbersTitle}</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "2.5rem", marginBottom: "4rem", borderBottom: "1px solid rgba(28,27,25,0.08)", paddingBottom: "4rem" }}>
          {[
            { value: "12,400+", label: m.home.stat1 },
            { value: "38%",     label: m.home.stat2 },
            { value: "500+",    label: m.home.stat3 },
            { value: "100%",    label: m.home.stat4 },
          ].map((s) => (
            <div key={s.label}>
              <div style={{ fontWeight: 800, fontSize: "2.75rem", letterSpacing: "-0.02em", background: "linear-gradient(155deg, #1C1B19, #2F6664)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{s.value}</div>
              <div style={{ fontSize: "0.9375rem", color: "#6B6860", marginTop: "0.5rem", fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ maxWidth: "34rem", margin: "0 0 2.5rem" }}>
          <div style={{ fontFamily: "var(--font-jetbrains), monospace", fontSize: "0.75rem", fontWeight: 500, letterSpacing: "0.08em", color: "#1F4B4A", marginBottom: "1rem" }}>{m.home.verifiedKicker}</div>
          <h2 style={{ fontFamily: "var(--font-fraunces), serif", fontWeight: 800, fontSize: "2.375rem", lineHeight: 1.2, letterSpacing: "-0.015em", margin: 0, color: "#14130F" }}>{m.home.verifiedTitle}</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "2.5rem" }}>
          {[
            { title: m.home.v1t, body: m.home.v1b },
            { title: m.home.v2t, body: m.home.v2b },
            { title: m.home.v3t, body: m.home.v3b },
          ].map((c) => (
            <div key={c.title} style={{ background: "#fff", borderRadius: 16, padding: "1.75rem", border: "1px solid rgba(28,27,25,0.06)", boxShadow: "0 1px 2px rgba(28,27,25,0.03)" }}>
              <h3 style={{ fontWeight: 700, fontSize: "1.0625rem", margin: "0 0 0.75rem", color: "#14130F" }}>{c.title}</h3>
              <p style={{ fontSize: "0.9375rem", lineHeight: 1.7, color: "#6B6860", margin: 0 }}>{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Group buying ─────────────────────────────────────────────────────── */}
      <section
        id="group-buying"
        ref={revealRef("groupBuying") as React.RefCallback<HTMLElement>}
        style={revealStyle("groupBuying", { background: "linear-gradient(180deg, #F5F3EC 0%, #F1EFE6 100%)", borderTop: "1px solid rgba(28,27,25,0.06)", borderBottom: "1px solid rgba(28,27,25,0.06)" })}
      >
        <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "8rem 2.5rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: "4.5rem", alignItems: "center" }}>
            <div>
              <div style={{ fontFamily: "var(--font-jetbrains), monospace", fontSize: "0.75rem", fontWeight: 500, letterSpacing: "0.08em", color: "#1F4B4A", marginBottom: "1rem" }}>{m.home.groupKicker}</div>
              <h2 style={{ fontFamily: "var(--font-fraunces), serif", fontWeight: 800, fontSize: "2.375rem", lineHeight: 1.2, letterSpacing: "-0.015em", margin: "0 0 1.5rem", color: "#14130F" }}>{m.home.groupTitle}</h2>
              <p style={{ fontSize: "1.0625rem", lineHeight: 1.7, color: "#565349", margin: "0 0 2rem", maxWidth: "29rem" }}>
                {m.home.groupBody}
              </p>
              <Link href="/buyer/leverage-groups" style={{ textDecoration: "none", padding: "1rem 0.5rem", fontSize: "1rem", fontWeight: 700, color: "#1C1B19", borderBottom: "1.5px solid rgba(28,27,25,0.25)" }}>{m.home.findGroup}</Link>
            </div>

            {/* Group visual */}
            <div style={{ background: "#fff", borderRadius: 22, padding: "2.5rem", border: "1px solid rgba(28,27,25,0.05)", boxShadow: "0 30px 60px -32px rgba(18,51,50,0.2)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1rem", marginBottom: "1.75rem" }}>
                {["B1", "B2", "B3"].map((b) => (
                  <span key={b} style={{ width: 46, height: 46, borderRadius: "50%", background: "#fff", border: "1.5px solid #C89B3C", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-jetbrains), monospace", fontSize: "0.6875rem", color: "#C89B3C", fontWeight: 700, boxShadow: "0 4px 10px -4px rgba(200,155,60,0.4)" }}>{b}</span>
                ))}
              </div>
              <div style={{ height: 1, background: "rgba(28,27,25,0.1)", margin: "0 2rem 1.75rem", position: "relative" }}>
                <span style={{ position: "absolute", left: "50%", top: -4, transform: "translateX(-50%)", width: 9, height: 9, borderRadius: "50%", background: "#1F4B4A", display: "block" }} />
              </div>
              <div style={{ background: "#F5F3EC", borderRadius: 14, padding: "1.5rem", textAlign: "center", boxShadow: "0 1px 2px rgba(28,27,25,0.04)" }}>
                <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#6B6860", marginBottom: "0.5rem" }}>{m.home.requested}</div>
                <div style={{ fontWeight: 700, fontSize: "1.25rem", color: "#1C1B19" }}>{m.home.groupSample}</div>
                <div style={{ fontFamily: "var(--font-jetbrains), monospace", fontSize: "0.9375rem", color: "#1F4B4A", fontWeight: 700, marginTop: "0.5rem" }}>{m.home.groupDiscount}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────────── */}
      <section
        ref={revealRef("cta") as React.RefCallback<HTMLElement>}
        style={revealStyle("cta", { position: "relative", overflow: "hidden", background: "linear-gradient(165deg, #0F2624 0%, #17332F 55%, #0B1D1B 100%)" })}
      >
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(50% 60% at 50% 0%, rgba(94,168,164,0.22) 0%, rgba(94,168,164,0) 65%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", maxWidth: "44rem", margin: "0 auto", padding: "7.5rem 2.5rem", textAlign: "center" }}>
          <h2 style={{ fontFamily: "var(--font-fraunces), serif", fontWeight: 800, fontSize: "2.625rem", lineHeight: 1.2, letterSpacing: "-0.015em", margin: "0 0 1.5rem", color: "#fff" }}>{m.home.ctaTitleA}<br />{m.home.ctaTitleB}</h2>
          <p style={{ fontSize: "1.0625rem", color: "rgba(255,255,255,0.62)", lineHeight: 1.65, margin: "0 0 2.5rem" }}>{m.home.ctaBody}</p>
          <Link href="/register" style={{ textDecoration: "none", padding: "1.0625rem 2.25rem", borderRadius: 999, fontSize: "1rem", fontWeight: 700, color: "#17332F", background: "#fff", display: "inline-block", boxShadow: "0 20px 40px -16px rgba(0,0,0,0.4)" }}>{m.home.getStarted}</Link>
        </div>
      </section>

    </main>
  );
}
