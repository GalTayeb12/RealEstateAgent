"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import "../_c2/c2.css";
import "./c3.css";
import { IMG, T, type Lang } from "../_c/content";
import { Arrow, Rv, Shell, q, tx, useCount, useInView } from "../_c2/parts";
import Apartment from "./Apartment";

const HOME = "/design-lab/c3";

function Hero({ lang }: { lang: Lang }) {
  const el = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = el.current; const root = node?.closest(".dl-root") as HTMLElement | null; if (!node || !root) return;
    let raf = 0;
    const tick = () => { raf = 0; const y = Math.min(root.scrollTop, window.innerHeight * 1.2); node.style.setProperty("--sy", String(y)); };
    const on = () => { if (!raf) raf = requestAnimationFrame(tick); };
    root.addEventListener("scroll", on, { passive: true }); tick();
    return () => root.removeEventListener("scroll", on);
  }, []);
  return (
    <header ref={el} className="c3-hero">
      <div className="c3-hero-img"><img src={IMG.hero} alt="" /></div>
      <div className="c3-hero-shade" />
      <div className="c3-hero-in" dir={lang === "he" ? "rtl" : "ltr"}>
        <span className="eyebrow c2-in" style={{ ["--d" as string]: ".2s" }}>{T.brandTag[lang]}</span>
        <h1 className="c2-in" style={{ ["--d" as string]: ".35s" }}>{tx(lang, "יש הרבה בתים.\nאחד מהם שלך.", "There are many homes.\nOne of them is yours.")}</h1>
        <p className="c2-in" style={{ ["--d" as string]: ".6s" }}>{tx(lang, "שיחה אחת עם יועץ, והעיר מסתדרת סביב מה שחשוב לך.", "One conversation with an advisor, and the city arranges itself around what matters to you.")}</p>
        <div className="cta c2-in" style={{ ["--d" as string]: ".8s" }}><Link className="c2-btn gold" href={`/design-lab/c2/results${q(lang)}`}>{T.start[lang]} <Arrow /></Link><Link className="c2-btn" href={`/design-lab/c2/developer${q(lang)}`}>{tx(lang, "ליזמים", "For developers")}</Link></div>
      </div>
      <div className="c3-hero-foot" dir={lang === "he" ? "rtl" : "ltr"}><span className="eyebrow">{tx(lang, "הדמיה להמחשה · תל אביב", "Illustrative rendering · Tel Aviv")}</span><a href="#advisor" className="c3-cue" aria-label={tx(lang, "המשך", "Continue")}><i /></a></div>
    </header>
  );
}

export function C3Home({ lang }: { lang: Lang }) {
  const [chatRef, chatOn] = useInView<HTMLDivElement>(0.3);
  const score = useCount(94, chatOn, 1800);
  const [devRef, devOn] = useInView<HTMLDivElement>(0.3);
  const sold = useCount(62, devOn, 1600);
  const bars: [string, number][] = [[tx(lang, "תקציב", "Budget"), 96], [tx(lang, "אור", "Light"), 91], [tx(lang, "מיקום", "Location"), 88], [tx(lang, "גודל", "Size"), 94]];
  const dir = lang === "he" ? "rtl" : "ltr";
  return (
    <Shell lang={lang} here="home" home={HOME} anchor="apartment">
      <Hero lang={lang} />

      <section className="c2-sec c2-adv" id="advisor">
        <div className="bg"><img src={IMG.bedroom} alt="" /></div>
        <div className="c2-split">
          <Rv><span className="eyebrow">{tx(lang, "התאמה חכמה", "Intelligent matching")}</span><h2 className="c2-h2" style={{ margin: "22px 0 26px" }}>{tx(lang, "מכיר אתכם, לא את המסננים שלכם.", "It learns you, not your filters.")}</h2><p className="c2-lede">{tx(lang, "שיחה טבעית על החיים, והתאמה שמסבירה את עצמה. כל ציון נפתח לגורמים שאפשר לבדוק ולשנות.", "A natural conversation about your life, and a match that explains itself. Every score opens into factors you can inspect and re-weigh.")}</p></Rv>
          <div ref={chatRef} className="c2-chat c2-glass">
            <Rv><div className="c2-bub ai">{tx(lang, "מי גר בבית, ומה הכי חשוב לכם בבוקר?", "Who lives there, and what matters most in the morning?")}</div></Rv>
            <Rv delay={500}><div className="c2-bub me">{tx(lang, "ארבעה. אור מזרחי, מרפסת, ושקט.", "Four of us. East light, a balcony, quiet.")}</div></Rv>
            <Rv delay={1000}><div className="c2-chips"><span>{tx(lang, "4 נפשות", "4 people")}</span><span>{tx(lang, "אור מזרחי", "East light")}</span><span>{tx(lang, "מרפסת", "Balcony")}</span><span>{tx(lang, "שקט", "Quiet")}</span></div></Rv>
            <Rv delay={1500}>
              <div className="c2-bars">
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}><span className="eyebrow">{tx(lang, "התאמה לדוגמה", "Sample match")}</span><span className="num" style={{ fontSize: 40, fontWeight: 200, direction: "ltr" }}>{score}<small style={{ fontSize: 16, color: "var(--gold)" }}>%</small></span></div>
                {bars.map(([n, v]) => <div className="c2-bar" key={n}><span>{n}</span><span><i style={{ ["--w" as string]: chatOn ? v + "%" : "0%" }} /></span><b>{v}</b></div>)}
              </div>
            </Rv>
          </div>
        </div>
      </section>

      <Apartment lang={lang} />

      <section className="c2-sec c3-devsec">
        <div className="c2-split">
          <Rv>
            <div ref={devRef} className="c3-peek c2-glass" dir="ltr" aria-hidden>
              <div className="top"><span className="eyebrow" style={{ ["--x" as string]: 0 }}>{tx(lang, "סקירת פרויקט · הדגמה", "Project overview · demo")}</span><span className="c2-live">LIVE</span></div>
              <div className="k"><div><b className="num">{sold}%</b><small>{tx(lang, "נמכר / שמור", "Sold / reserved")}</small></div><div><b className="num">₪148M</b><small>{tx(lang, "שווי פנוי", "Available value")}</small></div><div><b className="num">7</b><small>{tx(lang, "הצעות", "Offers")}</small></div></div>
              <div className="grid">{Array.from({ length: 54 }, (_, i) => { const v = (i * 37 + 11) % 10; return <i key={i} style={{ ["--c" as string]: v < 4 ? "#7A8087" : v < 6 ? "#C9A46A" : "#5FB3BE" }} />; })}</div>
              <div className="row"><span>A-804 · {tx(lang, "הצעה ₪4.85M", "Offer ₪4.85M")}</span><span className="c2-btn sm">{tx(lang, "אישור", "Approve")}</span></div>
            </div>
          </Rv>
          <Rv delay={150}><span className="eyebrow">{tx(lang, "פלטפורמה ליזמים", "Developer platform")}</span><h2 className="c2-h2" style={{ margin: "22px 0 24px" }}>{tx(lang, "מלאי, תאום דיגיטלי ועסקאות. במקום אחד.", "Inventory, digital twin and deals. In one place.")}</h2><p className="c2-lede">{tx(lang, "מעלים תכנית, מקבלים בניין חי שקונים יכולים לחקור, ומנהלים הצעות ואישורים מאותו מסך.", "Upload a plan, get a living building buyers can explore, and run offers and approvals from the same screen.")}</p><div style={{ marginTop: 28 }}><Link className="c2-btn" href={`/design-lab/c2/developer${q(lang)}`}>{tx(lang, "לדשבורד", "Open dashboard")} <Arrow /></Link></div></Rv>
        </div>
      </section>

      <section className="c2-cta"><img src={IMG.cta} alt="" /><div className="in" dir={dir}><Rv><h2>{tx(lang, "הבית שלכם כבר מחכה.", "Your home is already waiting.")}</h2></Rv><Rv delay={150}><div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}><Link className="c2-btn gold" href={`/design-lab/c2/results${q(lang)}`}>{T.start[lang]} <Arrow /></Link><Link className="c2-btn" href={`/design-lab/c2/developer${q(lang)}`}>{tx(lang, "ליזמים", "For developers")}</Link></div></Rv></div></section>
      <footer className="c2-foot"><span className="eyebrow">Haveniq © 2026</span><span className="eyebrow">{T.protoNote[lang]}</span></footer>
    </Shell>
  );
}
