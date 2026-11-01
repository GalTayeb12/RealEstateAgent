"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/LocaleProvider";
import { Money } from "@/components/Money";
import { visionFontClass } from "@/components/vision/fonts";
import {
  Skyline,
  Theme,
  VButton,
  VCard,
  VCount,
  VEmpty,
  VGlass,
  VInput,
  VOverlay,
  VPill,
  VSkeleton,
  VStepper,
  VToast,
  type DisplayFace,
  type VisionTheme,
} from "@/components/vision";

function roleOf(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

export default function DesignSystemPage() {
  const router = useRouter();
  const { locale, setLocale, m } = useI18n();
  const d = m.design;
  const [ready, setReady] = useState(false);
  const [face, setFace] = useState<DisplayFace>("frank");
  const [step, setStep] = useState(1);
  const [overlay, setOverlay] = useState<{ mode: "modal" | "sheet"; theme: VisionTheme } | null>(null);
  const [toast, setToast] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const dawnRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const token = localStorage.getItem("token") ?? "";
    const role = token ? roleOf(token) : null;
    if (role === "admin") {
      setReady(true);
      return;
    }
    if (role === "developer") router.replace("/dev/dashboard");
    else if (role === "seller") router.replace("/seller/dashboard");
    else if (role === "buyer") router.replace("/results");
    else router.replace("/login");
  }, [router]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(false), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!ready) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const narrow = window.matchMedia("(max-width: 800px)").matches;
    if (reduce) return;
    let frame = 0;
    const tick = () => {
      const dawn = dawnRef.current;
      if (dawn) {
        const rect = dawn.getBoundingClientRect();
        const total = dawn.offsetHeight - window.innerHeight;
        const passed = Math.min(Math.max(-rect.top, 0), Math.max(total, 1));
        dawn.style.setProperty("--vx-mix", total > 0 ? String(passed / total) : "0");
      }
      const hero = heroRef.current;
      if (hero && !narrow) {
        hero.style.setProperty("--vx-parallax", `${Math.min(window.scrollY, 420) * 0.16}px`);
      }
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    };
    tick();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [ready]);

  if (!ready) return <main className="vx-wait" />;

  const faces: Array<{ id: DisplayFace; name: string; note: string }> = [
    { id: "bellefair", name: "Bellefair", note: d.fontBellefairNote },
    { id: "frank", name: "Frank Ruhl Libre", note: d.fontFrankNote },
    { id: "noto", name: "Noto Serif Hebrew", note: d.fontNotoNote },
  ];

  return (
    <main className={`vx-root ${visionFontClass}`} data-display={face}>
      <header className="vx-bar">
        <Link href="/dev/admin/approvals">{d.back}</Link>
        <div className="vx-lang" role="group" aria-label={m.lang.label}>
          {(["he", "en"] as const).map((code) => (
            <button key={code} type="button" aria-pressed={locale === code} onClick={() => { void setLocale(code); }}>
              {code === "he" ? "עב" : "EN"}
            </button>
          ))}
        </div>
      </header>

      <section className="vx-hero" ref={heroRef}>
        <div className="vx-hero__city">
          <Skyline />
        </div>
        <div className="vx-haze" />
        <div className="vx-hero__copy">
          <div>
            <p className="vx-kicker" style={{ color: "#e4c48a" }}>{d.nightWorld}</p>
            <h1>{d.heroTitle}</h1>
            <Theme theme="night">
              <VGlass className="vx-hud">
                <div className="vx-hud__row">
                  <div>
                    <div className="vx-kicker">{d.matchLabel}</div>
                    <div className="vx-hud__score"><VCount value={92} /></div>
                  </div>
                  <div style={{ textAlign: "end" }}>
                    <div className="vx-kicker">{d.priceLabel}</div>
                    <div className="vx-num" style={{ fontSize: "1.15rem", color: "var(--vx-gold)" }}>
                      <Money amount={2450000} />
                    </div>
                  </div>
                </div>
                <div className="vx-rule" />
                <div>{d.projectName} · {d.roomsLabel}</div>
              </VGlass>
            </Theme>
          </div>
        </div>
      </section>

      <section className="vx-dawn" ref={dawnRef}>
        <div className="vx-dawn__sticky">
          <div className="vx-dawn__sky" />
          <div className="vx-dawn__city"><Skyline /></div>
          <Theme theme="day">
            <VGlass className="vx-dawn__caption">
              <h2>{d.dawnTitle}</h2>
              <p className="vx-muted">{d.dawnBody}</p>
            </VGlass>
          </Theme>
        </div>
      </section>

      <div className="vx-sheet">
        <p className="vx-kicker" style={{ color: "#8a6430" }}>{d.kicker}</p>
        <h2>{d.concept}</h2>
        <p className="vx-lead">{d.conceptLead}</p>

        <section className="vx-block">
          <h2>{d.fontsTitle}</h2>
          <p className="vx-lead">{d.chooseFont}</p>
          <div className="vx-fonts">
            {faces.map((item) => (
              <button
                key={item.id}
                type="button"
                className="vx-glass vx-lift vx-font"
                aria-pressed={face === item.id}
                onClick={() => setFace(item.id)}
              >
                <strong>{item.name}</strong>
                <span className="vx-display" style={{ fontFamily: faceFamily(item.id) }}>{d.fontSampleHe}</span>
                <span className="vx-display" style={{ fontFamily: faceFamily(item.id), fontSize: "1.15rem" }}>{d.fontSampleEn}</span>
                <em>{item.note}</em>
              </button>
            ))}
          </div>
        </section>

        <section className="vx-block">
          <h2>{d.tokens}</h2>
          <div className="vx-pair">
            <Stage theme="night" title={d.nightWorld} lead={d.nightLead} d={d} step={step} setStep={setStep} onOverlay={(mode) => setOverlay({ mode, theme: "night" })} onToast={() => setToast(true)} locale={locale} />
            <Stage theme="day" title={d.dayWorld} lead={d.dayLead} d={d} step={step} setStep={setStep} onOverlay={(mode) => setOverlay({ mode, theme: "day" })} onToast={() => setToast(true)} locale={locale} />
          </div>
        </section>

        <section className="vx-block">
          <h2>{d.resultsTitle}</h2>
          <div className="vx-split">
            <Theme theme="day">
              <div className="vx-results">
                <MatchCard name={d.projectName} score={92} amount={2450000} why={d.whySample} rooms={d.roomsLabel} match={d.matchLabel} overlap={d.overlap} />
                <MatchCard name={d.projectNameB} score={78} amount={1980000} why={d.whySample} rooms={d.roomsLabel} match={d.matchLabel} overlap={d.overlap} />
              </div>
            </Theme>
            <Theme theme="day">
              <article className="vx-glass vx-lift vx-home">
                <div className="vx-photo">
                  <Image src="/images/hero-property.png" alt={d.projectName} fill sizes="(max-width: 800px) 100vw, 360px" />
                </div>
                <div className="vx-home__body">
                  <div className="vx-kicker">{d.propertyTitle}</div>
                  <h3 className="vx-display" style={{ fontSize: "1.7rem", margin: "0.15rem 0 0.35rem" }}>{d.projectName}</h3>
                  <div className="vx-num" style={{ color: "var(--vx-gold)", fontSize: "1.25rem" }}><Money amount={2450000} /></div>
                  <p className="vx-muted" style={{ marginTop: "0.45rem" }}>{d.roomsLabel}. {d.whySample}</p>
                </div>
              </article>
            </Theme>
          </div>
        </section>
      </div>

      {overlay && (
        <VOverlay theme={overlay.theme} mode={overlay.mode} title={d.modalTitle} closeLabel={d.close} onClose={() => setOverlay(null)}>
          {d.modalBody}
        </VOverlay>
      )}
      {toast && <VToast message={d.toastBody} />}
    </main>
  );
}

function faceFamily(id: DisplayFace) {
  if (id === "bellefair") return "var(--font-bellefair), Bellefair, serif";
  if (id === "noto") return "var(--font-noto-serif-he), 'Noto Serif Hebrew', serif";
  return "var(--font-frank), 'Frank Ruhl Libre', serif";
}

function Stage({
  theme,
  title,
  lead,
  d,
  step,
  setStep,
  onOverlay,
  onToast,
  locale,
}: {
  theme: VisionTheme;
  title: string;
  lead: string;
  d: ReturnType<typeof useI18n>["m"]["design"];
  step: number;
  setStep: (value: number | ((n: number) => number)) => void;
  onOverlay: (mode: "modal" | "sheet") => void;
  onToast: () => void;
  locale: string;
}) {
  return (
    <div className={theme === "night" ? "vx-stage vx-stage--night" : "vx-stage vx-stage--day"}>
      <Theme theme={theme}>
        <p className="vx-kicker">{title}</p>
        <p className="vx-muted" style={{ marginBottom: "1rem" }}>{lead}</p>
        <div className="vx-stack">
          <div className="vx-row">
            <VButton>{d.primary}</VButton>
            <VButton variant="secondary">{d.secondary}</VButton>
            <VButton variant="ghost">{d.ghost}</VButton>
            <VButton disabled>{d.primary}</VButton>
          </div>
          <div className="vx-row">
            <VPill tone="available">{d.available}</VPill>
            <VPill tone="reserved">{d.reserved}</VPill>
            <VPill tone="sold">{d.sold}</VPill>
            <VPill tone="pending">{d.pending}</VPill>
          </div>
          <VCard kicker={d.matchLabel} title={d.cardTitle}>{d.cardBody}</VCard>
          <VInput label={d.name} defaultValue={locale === "he" ? "דנה לוי" : "Dana Levi"} />
          <VInput label={d.email} type="email" defaultValue="buyer@haveniq.demo" />
          <VInput label={d.name} error={d.fieldError} />
          <VStepper steps={[d.stepListen, d.stepUnderstand, d.stepScore]} current={step} />
          <div className="vx-row">
            <VButton variant="ghost" onClick={() => setStep((n) => Math.max(0, n - 1))}>−</VButton>
            <VButton variant="secondary" onClick={() => setStep((n) => Math.min(2, n + 1))}>+</VButton>
          </div>
          <div className="vx-stack" style={{ maxWidth: "16rem" }}>
            <VSkeleton width="42%" />
            <VSkeleton />
            <VSkeleton width="70%" />
          </div>
          <div className="vx-row">
            <VButton onClick={() => onOverlay("modal")}>{d.openModal}</VButton>
            <VButton variant="secondary" onClick={() => onOverlay("sheet")}>{d.openSheet}</VButton>
            <VButton variant="ghost" onClick={onToast}>{d.showToast}</VButton>
          </div>
          <VEmpty title={d.emptyTitle} body={d.emptyBody} action={<VButton>{d.emptyAction}</VButton>} />
        </div>
      </Theme>
    </div>
  );
}

function MatchCard({
  name,
  score,
  amount,
  why,
  rooms,
  match,
  overlap,
}: {
  name: string;
  score: number;
  amount: number;
  why: string;
  rooms: string;
  match: string;
  overlap: string;
}) {
  return (
    <article className="vx-glass vx-lift vx-match">
      <div>
        <div className="vx-kicker">{match}</div>
        <div className="vx-match__score vx-num">{score}</div>
      </div>
      <div>
        <strong className="vx-display" style={{ fontSize: "1.25rem" }}>{name}</strong>
        <p className="vx-muted">{rooms}. {why}</p>
        <div className="vx-axis">
          <div className="vx-meter" aria-hidden>
            <span style={{ left: "40%", width: `${Math.max(18, score - 50)}%` }} />
          </div>
        </div>
      </div>
      <div style={{ textAlign: "end" }}>
        <div className="vx-kicker">{overlap}</div>
        <div className="vx-num" style={{ color: "var(--vx-gold)" }}><Money amount={amount} /></div>
      </div>
    </article>
  );
}
