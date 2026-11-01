"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/LocaleProvider";
import { Ambient, Brand, Card, CountUp, GlassPanel, HqLang } from "@/components/ui";
import "@/components/ui/haven.css";

const SELLER_EIL = 55;
const SELLER_AIL = 84;

export default function Home() {
  const [ej, setEj] = useState(88);
  const [aj, setAj] = useState(62);
  const { m } = useI18n();

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

  return (
    <main className="hq">
      <Ambient />
      <header className="hq-nav">
        <Brand />
        <nav className="hq-nav__links" aria-label={m.home.how}>
          <a href="#how-it-works">{m.home.how}</a>
          <a href="#scoring">{m.home.scoring}</a>
          <a href="#group-buying">{m.home.groupBuying}</a>
        </nav>
        <div className="hq-nav__actions">
          <HqLang />
          <Link href="/login" className="hq-btn hq-btn--ghost">{m.home.signIn}</Link>
          <Link href="/register" className="hq-btn hq-btn--primary hq-nav__start">{m.home.getStarted}</Link>
        </div>
      </header>

      <div className="hq-page">
        <section className="hq-hero">
          <div className="hq-rise">
            <div className="hq-kicker">{m.home.badge}</div>
            <h1>
              {m.home.heroTitleA}<br />
              <span className="hq-accent">{m.home.heroTitleB}</span>
            </h1>
            <p className="hq-lead">{m.home.heroBody}</p>
            <div className="hq-row" style={{ marginTop: "1.75rem" }}>
              <Link href="/register" className="hq-btn hq-btn--primary">{m.home.startInterview}</Link>
              <a href="#scoring" className="hq-btn hq-btn--ghost">{m.home.seeScoring}</a>
            </div>
          </div>

          <GlassPanel className="hq-rise hq-d2" >
            <div style={{ padding: "1.25rem" }}>
              <div className="hq-kicker">{m.home.aiInterview}</div>
              <div className="hq-chat">
                <div className="hq-bubble hq-bubble--ai">{m.home.aiQuestion}</div>
                <div className="hq-bubble hq-bubble--user">{m.home.aiAnswer}</div>
                <div className="hq-dots" aria-hidden><span /><span /><span /></div>
              </div>
              <div className="hq-split" style={{ marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid var(--hq-line)" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{m.home.sampleName}</div>
                  <p className="hq-lead" style={{ marginTop: "0.25rem", fontSize: "0.8125rem" }}>{m.home.sampleWhy}</p>
                </div>
                <div className="hq-score"><CountUp value={92} /></div>
              </div>
            </div>
          </GlassPanel>
        </section>

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
                    <div style={{ fontWeight: 700 }}>{m.home.sampleName}</div>
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
                    <span style={{ left: "55%", width: "29%", background: "rgba(143,217,212,0.4)" }} />
                    <span style={{ left: `${Math.max(0, Math.min(100, aj))}%`, width: `${Math.max(0, ej - aj)}%`, background: "rgba(228,194,122,0.35)" }} />
                    {feasible && (
                      <span style={{ left: `${Math.max(0, Math.min(100, lowerBound))}%`, width: `${Math.max(0, upperBound - lowerBound)}%`, background: "var(--hq-gold)" }} />
                    )}
                  </div>
                  <div className="hq-ticks hq-num">
                    <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
                  </div>
                </div>
                <div className="hq-legend">
                  <span><i style={{ background: "rgba(143,217,212,0.7)" }} />{m.home.sellerRange}</span>
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
                  <div style={{ fontWeight: 700, fontSize: "1.15rem" }}>{m.home.groupSample}</div>
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
