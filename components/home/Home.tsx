"use client";
/**
 * Marketing homepage — Concept C V3 (cinematic). Client component because of
 * the language toggle, nav state, parallax and count-up. All styles live in
 * ./home.css under the .hv scope.
 */
import { useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useI18n } from "@/components/LocaleProvider";
import { Logo } from "@/components/Logo";
import ThemeToggle from "@/components/theme/ThemeToggle";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useAudioUnlock } from "@/components/AudioUnlockProvider";
import { useCountUp, useParallax, useReveal, useScrolled } from "./hooks";
import "./home.css";

const IMG = {
  hero: "/images/hero-desktop.jpg",
  bedroom: "/buildings/yarkon-v2/room-bedroom.webp",
  plan: "/images/section-03-apartment.webp",
  cta: "/images/cta-living-room.jpg",
};

const Arrow = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden><path d="M2 8h12M9 3l5 5-5 5" /></svg>
);

function Rv({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useReveal<HTMLDivElement>();
  return <div ref={ref} className={`hv-rv ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}

export default function Home() {
  const { locale, setLocale, m } = useI18n();
  const { unlock } = useAudioUnlock();
  const router = useRouter();
  /** The interview needs a signed-in buyer: guests go to sign-in (login routes buyers on to the interview). */
  const startInterview = (e: MouseEvent) => {
    let signedIn = false;
    try { signedIn = !!localStorage.getItem("token"); } catch { /* storage blocked: treat as guest */ }
    if (!signedIn) { e.preventDefault(); router.push("/login"); return; }
    void unlock();
  };
  const he = locale === "he";
  const t = <T,>(h: T, e: T) => (he ? h : e);
  const dir = he ? "rtl" : "ltr";

  const [menu, setMenu] = useState(false);
  const solid = useScrolled();
  const { theme } = useTheme();
  /** Menu anchors glide down to their section instead of jumping (instant when reduced motion is on). */
  const glide = (e: MouseEvent<HTMLAnchorElement>, hash: string) => {
    const el = hash.startsWith("#") ? document.getElementById(hash.slice(1)) : null;
    if (!el) return;
    e.preventDefault();
    setMenu(false);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", hash);
  };
  const heroRef = useParallax<HTMLElement>();
  const [scoreRef, score] = useCountUp<HTMLSpanElement>(94, 1800);
  const [soldRef, sold] = useCountUp<HTMLDivElement>(62, 1600);

  const nav: [string, string][] = [
    [t("התאמה", "Matching"), "#advisor"],
    [t("הדירה", "The apartment"), "#apartment"],
    [t("יזמים", "Developers"), "#developers"],
  ];
  const bars: [string, number][] = [[t("תקציב", "Budget"), 96], [t("אור", "Light"), 91], [t("מיקום", "Location"), 88], [t("גודל", "Size"), 94]];

  return (
    <div className="hv" dir={dir} lang={locale}>
      <a className="hv-skip" href="#main">{t("דילוג לתוכן", "Skip to content")}</a>

      <nav className={`hv-nav${solid ? " solid" : ""}`} aria-label={m.home.how}>
        <Logo variant={theme === "light" && solid ? "default" : "light"} height={19} href="/" />
        <ul>{nav.map(([n, h]) => <li key={h}><a href={h} onClick={(e) => glide(e, h)}>{n}</a></li>)}</ul>
        <div className="r">
          <ThemeToggle />
          <div className="hv-lang" role="group" aria-label={m.lang.label}>
            {(["he", "en"] as const).map((c) => (
              <button key={c} type="button" aria-pressed={locale === c} onClick={() => void setLocale(c)}>{c === "he" ? "עב" : "EN"}</button>
            ))}
          </div>
          <Link className="hv-btn sm hv-signin" href="/login">{m.home.signIn}</Link>
          <button className="hv-burger" type="button" aria-label={menu ? m.nav.closeMenu : m.nav.openMenu} aria-expanded={menu} aria-controls="hv-menu" onClick={() => setMenu(!menu)}>
            <svg width="18" height="12" viewBox="0 0 18 12" stroke="currentColor" aria-hidden>{menu ? <path d="M3 1l12 10M15 1L3 11" /> : <path d="M0 1h18M0 11h18" />}</svg>
          </button>
        </div>
      </nav>
      <div id="hv-menu" className={`hv-menu${menu ? " on" : ""}`} onClick={() => setMenu(false)} inert={!menu}>
        {nav.map(([n, h]) => <a key={h} href={h} onClick={(e) => glide(e, h)}>{n}</a>)}
        <Link href="/login">{m.home.signIn}</Link>
      </div>

      <main id="main">
        <header ref={heroRef} className="hv-hero">
          <div className="hv-hero-img"><Image src={IMG.hero} alt="" fill priority sizes="100vw" /></div>
          <div className="hv-hero-shade" />
          <div className="hv-hero-in">
            <span className="eyebrow hv-in" style={{ ["--d" as string]: ".2s" }}>{t("נדל״ן שמותאם אליך", "Real estate, matched to you")}</span>
            <h1 className="hv-in" style={{ ["--d" as string]: ".35s" }}>{t("יש הרבה בתים.\nאחד מהם שלך.", "There are many homes.\nOne of them is yours.")}</h1>
            <p className="hv-in" style={{ ["--d" as string]: ".6s" }}>{t("שיחה אחת עם יועץ, והעיר מסתדרת סביב מה שחשוב לך.", "One conversation with an advisor, and the city arranges itself around what matters to you.")}</p>
            <div className="hv-cta hv-in" style={{ ["--d" as string]: ".8s" }}>
              <Link className="hv-btn gold" href="/register">{m.home.getStarted} <Arrow /></Link>
              <Link className="hv-btn" href="/dev/register">{t("ליזמים", "For developers")}</Link>
            </div>
          </div>
          <div className="hv-hero-foot">
            <span className="eyebrow">{t("הדמיה להמחשה · תל אביב", "Illustrative rendering · Tel Aviv")}</span>
            <a href="#advisor" className="hv-cue" aria-label={m.home.scrollCue}><i /></a>
          </div>
        </header>

        <section className="hv-sec hv-adv" id="advisor" aria-labelledby="hv-adv-t">
          <div className="bg"><Image src={IMG.bedroom} alt="" fill sizes="100vw" /></div>
          <div className="hv-split">
            <Rv>
              <span className="eyebrow">{t("התאמה חכמה", "Intelligent matching")}</span>
              <h2 id="hv-adv-t" className="hv-h2" style={{ margin: "22px 0 26px" }}>{t("מכיר אתכם, לא את המסננים שלכם.", "It learns you, not your filters.")}</h2>
              <p className="hv-lede">{t("שיחה טבעית על החיים, והתאמה שמסבירה את עצמה. כל ציון נפתח לגורמים שאפשר לבדוק ולשנות.", "A natural conversation about your life, and a match that explains itself. Every score opens into factors you can inspect and re-weigh.")}</p>
              <div style={{ marginTop: 28 }}>
                <Link className="hv-btn" href="/interview" onClick={startInterview}>{m.home.startInterview} <Arrow /></Link>
              </div>
            </Rv>
            <div className="hv-chat hv-glass" role="img" aria-label={t("דוגמה להמחשה: שיחה עם יועץ והתאמה של 94%", "Illustrative example: a conversation with an advisor and a 94% match")}>
              <Rv><div className="hv-bub ai">{t("מי גר בבית, ומה הכי חשוב לכם בבוקר?", "Who lives there, and what matters most in the morning?")}</div></Rv>
              <Rv delay={400}><div className="hv-bub me">{t("ארבעה. אור מזרחי, מרפסת, ושקט.", "Four of us. East light, a balcony, quiet.")}</div></Rv>
              <Rv delay={800}><div className="hv-chips"><span>{t("4 נפשות", "4 people")}</span><span>{t("אור מזרחי", "East light")}</span><span>{t("מרפסת", "Balcony")}</span><span>{t("שקט", "Quiet")}</span></div></Rv>
              <Rv delay={1200}>
                <div className="hv-bars">
                  <div className="hd"><span className="eyebrow">{t("התאמה לדוגמה", "Sample match")}</span><span ref={scoreRef} className="num score">{score}<small>%</small></span></div>
                  {bars.map(([n, v]) => <div className="hv-bar" key={n}><span>{n}</span><span><i style={{ ["--w" as string]: v + "%" }} /></span><b>{v}</b></div>)}
                  <span className="hv-note">{t("הדגמה בלבד. הציון האמיתי מחושב מהפרופיל שלכם.", "Demonstration only. Your real score is calculated from your own profile.")}</span>
                </div>
              </Rv>
            </div>
          </div>
        </section>

        <section className="hv-sec hv-apt" id="apartment" aria-labelledby="hv-apt-t">
          <div className="hv-apt-head">
            <Rv><span className="eyebrow">{t("הדירה", "The apartment")}</span></Rv>
            <Rv delay={100}><h2 id="hv-apt-t" className="hv-h2">{t("להרגיש בבית לפני שמבקרים.", "Feel at home before you visit.")}</h2></Rv>
            <Rv delay={200}><p className="hv-lede">{t("אור, חומרים ונפח, כפי שהם באמת. מספיק כדי להבין אם זה הבית שלכם, עוד לפני הביקור הראשון.", "Light, materials and volume, as they truly are. Enough to know whether it is your home before the first visit.")}</p></Rv>
          </div>
          <Rv delay={150}>
            <figure>
              <div className="im plan"><Image src={IMG.plan} alt={t("מבט איזומטרי על דירה לדוגמה: שלושה חדרי שינה, סלון, מטבח ומרפסת, הדמיה", "Isometric view of a sample apartment: three bedrooms, living area, kitchen and terrace, rendering")} fill sizes="(max-width:1000px) 100vw, 980px" /></div>
              <figcaption><span className="eyebrow">{t("מבט על · דירה לדוגמה", "Top view · sample apartment")}</span><span className="eyebrow">{t("הדמיה להמחשה", "Illustrative rendering")}</span></figcaption>
            </figure>
          </Rv>
        </section>

        <section className="hv-sec" id="developers" aria-labelledby="hv-dev-t">
          <div className="hv-split">
            <Rv>
              <div ref={soldRef} className="hv-peek hv-glass" dir="ltr" role="img" aria-label={t("תצוגה להמחשה של לוח הבקרה ליזמים, נתוני הדגמה", "Illustrative preview of the developer dashboard, demo data")}>
                <div className="top"><span className="eyebrow">{t("סקירת פרויקט", "Project overview")}</span><span className="hv-demo">{t("נתוני הדגמה", "Demo data")}</span></div>
                <div className="k"><div><b className="num">{sold}%</b><small>{t("נמכר / שמור", "Sold / reserved")}</small></div><div><b className="num">₪148M</b><small>{t("שווי פנוי", "Available value")}</small></div><div><b className="num">7</b><small>{t("הצעות", "Offers")}</small></div></div>
                <div className="grid" aria-hidden>{Array.from({ length: 54 }, (_, i) => { const v = (i * 37 + 11) % 10; return <i key={i} style={{ ["--c" as string]: v < 4 ? "#7A8087" : v < 6 ? "#C9A46A" : "#5FB3BE" }} />; })}</div>
                <div className="row"><span>A-804 · {t("הצעה ₪4.85M", "Offer ₪4.85M")}</span><span className="hv-btn sm" aria-hidden>{t("אישור", "Approve")}</span></div>
              </div>
            </Rv>
            <Rv delay={150}>
              <span className="eyebrow">{t("פלטפורמה ליזמים", "Developer platform")}</span>
              <h2 id="hv-dev-t" className="hv-h2" style={{ margin: "22px 0 24px" }}>{t("מלאי, תאום דיגיטלי ועסקאות. במקום אחד.", "Inventory, digital twin and deals. In one place.")}</h2>
              <p className="hv-lede">{t("מעלים תכנית, מקבלים בניין חי שקונים יכולים לחקור, ומנהלים הצעות ואישורים מאותו מסך.", "Upload a plan, get a living building buyers can explore, and run offers and approvals from the same screen.")}</p>
              <div style={{ marginTop: 28 }}><Link className="hv-btn" href="/dev/register">{m.home.section05Cta} <Arrow /></Link></div>
            </Rv>
          </div>
        </section>

        <section className="hv-final" aria-labelledby="hv-final-t">
          <div className="bgimg"><Image src={IMG.cta} alt="" fill sizes="100vw" /></div>
          <div className="in">
            <Rv><h2 id="hv-final-t">{t("הבית שלכם כבר מחכה.", "Your home is already waiting.")}</h2></Rv>
            <Rv delay={150}><div className="hv-cta"><Link className="hv-btn gold" href="/register">{m.home.getStarted} <Arrow /></Link><Link className="hv-btn" href="/dev/register">{t("ליזמים", "For developers")}</Link></div></Rv>
          </div>
        </section>
      </main>

      <footer className="hv-foot">
        <span className="eyebrow" dir="ltr">© 2026 Haveniq</span>
        <nav aria-label={t("קישורים", "Links")}>
          <Link href="/seller/register">{t("מוכרים דירה?", "Selling a home?")}</Link>
          <Link href="/terms">{m.footer.terms}</Link>
          <Link href="/privacy">{m.footer.privacy}</Link>
        </nav>
      </footer>
      <div className="hv-grain" aria-hidden />
    </div>
  );
}
