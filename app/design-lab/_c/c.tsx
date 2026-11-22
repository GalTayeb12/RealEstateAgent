"use client";
import Link from "next/link";
import { useState } from "react";
import "./c.css";
import { IMG, UNITS, T, money, type Lang } from "./content";
import { Reveal, ScrollScene } from "./reveal";

const tx = (l: Lang, he: string, en: string) => (l === "he" ? he : en);
const q = (l: Lang) => `?lang=${l}`;
type Here = "home" | "results" | "developer";

function Shell({ lang, here, children }: { lang: Lang; here: Here; children: React.ReactNode }) {
  const other = lang === "he" ? "en" : "he";
  const base = "/design-lab/c";
  const path = here === "home" ? base : `${base}/${here}`;
  return (
    <div className="c" dir={lang === "he" ? "rtl" : "ltr"} lang={lang}>
      <nav className="c-nav">
        <Link href={base + q(lang)}><img src="/images/brand/logo-light.svg" alt="Haveniq" /></Link>
        <ul>
          <li><Link href={base + q(lang)} aria-current={here === "home" ? "page" : undefined}>{T.nav[lang][0]}</Link></li>
          <li><Link href={`${base}/results${q(lang)}`} aria-current={here === "results" ? "page" : undefined}>{T.nav[lang][1]}</Link></li>
          <li><Link href={base + q(lang)}>{T.nav[lang][2]}</Link></li>
          <li><Link href={`${base}/developer${q(lang)}`} aria-current={here === "developer" ? "page" : undefined}>{T.nav[lang][3]}</Link></li>
        </ul>
        <div className="r"><Link href={path + q(other)} className="lab">{other.toUpperCase()}</Link><Link className="c-btn" href="#">{T.login[lang]}</Link></div>
      </nav>
      {children}
      <div className="dl-proto">Concept C · prototype</div>
    </div>
  );
}

export function CHome({ lang }: { lang: Lang }) {
  const caps = [
    { at: 0, k: 4.5, first: true, l: tx(lang, "01 · הגעה", "01 · Arrive"), h: tx(lang, "יש הרבה בתים. אחד מהם שלך.", "Many homes. One is yours."), p: tx(lang, "שיחה אחת, והעיר מסתדרת סביב מה שחשוב לך.", "One conversation, and the city arranges itself around what matters to you.") },
    { at: 0.34, l: tx(lang, "02 · דמדומים", "02 · Dusk"), h: tx(lang, "הבניין מתעורר.", "The building wakes."), p: tx(lang, "מגדלים אמיתיים, קומה אחר קומה, עם סטטוס חי.", "Real towers, floor by floor, with live status.") },
    { at: 0.64, l: tx(lang, "03 · ערב", "03 · Evening"), h: tx(lang, "האורות נדלקים.", "The lights come on."), p: tx(lang, "בוחרים קומה. רואים מי שכן, מה פנוי, ומה מתאים.", "Pick a floor. See neighbours, what is open, what fits.") },
    { at: 0.93, k: 12, l: tx(lang, "04 · בפנים", "04 · Inside"), h: tx(lang, "נכנסים הביתה.", "Step inside."), p: tx(lang, "סיור בדירה לפני שחותמים על משהו.", "Walk the apartment before you sign anything.") },
  ];
  return (
    <Shell lang={lang} here="home">
      <ScrollScene className="c-scene" height="480vh">
        <div className="c-sticky">
          <div className="c-layer c-l1"><img src={IMG.hero} alt="" /></div>
          <div className="c-layer c-l2"><img src={IMG.off} alt="" /></div>
          <div className="c-layer c-l3"><img src={IMG.on} alt="" /></div>
          <div className="c-layer c-l4"><img src={IMG.living} alt="" /></div>
          <div className="c-vig" />
          {caps.map((c) => (
            <div key={c.at} className={`c-cap${c.first ? " first" : ""}`} style={{ ["--at" as string]: c.at, ["--k" as string]: c.k ?? 4.5 }}>
              <span className="lab">{c.l}</span>
              {c.first ? <h1>{c.h}</h1> : <h2>{c.h}</h2>}
              <p>{c.p}</p>
              {c.first && <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap" }}><Link className="c-btn gold" href={`/design-lab/c/results${q(lang)}`}>{T.start[lang]}</Link><Link className="c-btn" href={`/design-lab/c/developer${q(lang)}`}>{tx(lang, "ליזמים", "For developers")}</Link></div>}
            </div>))}
          <div className="c-prog">{[0.05, 0.3, 0.6, 0.88].map((a) => <i key={a} style={{ ["--a" as string]: a }} />)}</div>
          <div className="c-hint lab">{tx(lang, "גללו", "Scroll")}</div>
        </div>
      </ScrollScene>
      <section className="c-sec c-split">
        <Reveal className="c-rv"><span className="lab">{tx(lang, "היועץ", "The advisor")}</span><h2 style={{ margin: "16px 0 24px" }}>{tx(lang, "מכירים אתכם, לא את המסננים שלכם.", "It learns you, not your filters.")}</h2><p>{tx(lang, "שיחה טבעית על החיים, והתאמה שמסבירה את עצמה. כל ציון נפתח לגורמים שאפשר לבדוק.", "A natural conversation about your life, and a match that explains itself. Every score opens into factors you can inspect.")}</p></Reveal>
        <Reveal className="c-rv c-split" delay={150}><div className="im"><img src={IMG.facade} alt="" /></div></Reveal>
      </section>
      <section className="c-sec c-split" style={{ paddingTop: 0 }}>
        <Reveal className="c-rv"><div className="im" style={{ aspectRatio: "4/3" }}><img src={IMG.cta} alt="" /></div></Reveal>
        <Reveal className="c-rv" delay={150}><span className="lab">{tx(lang, "ליזמים", "For developers")}</span><h2 style={{ margin: "16px 0 24px" }}>{tx(lang, "הבניין שלכם, בשיא יופיו.", "Your building, at its most beautiful.")}</h2><p>{tx(lang, "תאום דיגיטלי, מלאי ותצוגה קולנועית לקונים, ממקור אחד.", "A digital twin, inventory and a cinematic buyer presentation from one source.")}</p><Link className="c-btn gold" style={{ marginTop: 20 }} href={`/design-lab/c/developer${q(lang)}`}>{tx(lang, "לדשבורד", "Open dashboard")}</Link></Reveal>
      </section>
      <footer className="c-foot"><span className="lab">Haveniq © 2026</span><span className="lab">{T.protoNote[lang]}</span></footer>
    </Shell>
  );
}

export function CResults({ lang }: { lang: Lang }) {
  const [sel, setSel] = useState(0);
  const u = UNITS[sel];
  return (
    <Shell lang={lang} here="results">
      <div className="c-res">
        <div className="bgs">{UNITS.map((x, i) => <img key={x.id} className={i === sel ? "on" : ""} src={x.img} alt="" />)}</div>
        <div className="shade" />
        <div className="hd"><span className="lab">{tx(lang, "ההתאמות שלך · 4", "Your matches · 4")}</span><h1>{tx(lang, "הבית שמרגיש כמו שאמרת.", "The home that feels like you said.")}</h1></div>
        <div className="c-info">
          <div className="score">{u.match}<small>%</small></div>
          <div style={{ display: "grid", gap: 6 }}><span className="lab">{u.loc[lang]} · {u.id}</span><h2 style={{ fontSize: "clamp(26px,3vw,44px)" }}>{u.name[lang]}</h2><span style={{ color: "var(--mute)" }}>{u.why[lang].join(" · ")}</span></div>
          <div className="c-facts"><div><b>{u.rooms}</b><span className="lab">{tx(lang, "חדרים", "Rooms")}</span></div><div><b>{u.sqm}</b><span className="lab">{tx(lang, "מ״ר", "sqm")}</span></div><div><b>{u.floor}</b><span className="lab">{tx(lang, "קומה", "Floor")}</span></div><div><b>{money(u.price, lang)}</b><span className="lab">{tx(lang, "מחיר", "Price")}</span></div></div>
          <button className="c-btn gold">{tx(lang, "כניסה לסיור", "Enter the tour")}</button>
        </div>
        <div className="c-rail">{UNITS.map((x, i) => (
          <button key={x.id} className="c-card" aria-pressed={i === sel} onClick={() => setSel(i)}><img src={x.img} alt="" /><div><b>{x.name[lang]}</b><span>{x.match}% · {money(x.price, lang)}</span></div></button>))}</div>
        <p className="lab" style={{ position: "relative", padding: "0 clamp(20px,6vw,96px) 20px", margin: 0 }}>{T.protoNote[lang]}</p>
      </div>
    </Shell>
  );
}

export function CDeveloper({ lang }: { lang: Lang }) {
  const stages = [[tx(lang, "תכניות", "Plans"), "done", tx(lang, "6/6 הועלו", "6/6 uploaded")], [tx(lang, "תאום דיגיטלי", "Digital twin"), "done", tx(lang, "5/6 מוכנים", "5/6 ready")], [tx(lang, "הדמיות וסיורים", "Renders & tours"), "now", tx(lang, "בעבודה", "In progress")], [tx(lang, "השקה", "Launch"), "", tx(lang, "מתוכננת 01.12", "Planned 1 Dec")]];
  const types = [[IMG.living, "A · 4 " + tx(lang, "חדרים", "rooms"), tx(lang, "מוכן", "Ready")], [IMG.balcony, "B · 4 " + tx(lang, "חדרים", "rooms"), tx(lang, "מוכן", "Ready")], [IMG.kitchen, "C · 5 " + tx(lang, "חדרים", "rooms"), tx(lang, "בעבודה", "Building")]];
  return (
    <Shell lang={lang} here="developer">
      <div className="c-dev-hero"><img src={IMG.on} alt="" /><div className="shade" />
        <div className="in"><span className="lab">{tx(lang, "פרויקט · ירקון", "Project · Yarkon")}</span><h1>{tx(lang, "62% מהמלאי כבר נמצא בבית.", "62% of the inventory has found a home.")}</h1>
          <div className="c-kp"><div><b>₪148M</b><span className="lab">{tx(lang, "שווי פנוי", "Available value")}</span></div><div><b>7</b><span className="lab">{tx(lang, "הצעות", "Offers")}</span></div><div><b>1,240</b><span className="lab">{tx(lang, "צפיות החודש", "Views this month")}</span></div></div></div></div>
      <div className="c-tl">{stages.map(([n, s, d]) => <div key={n} className={s}><span className="lab">{d}</span><b>{n}</b></div>)}</div>
      <div className="c-types">{types.map(([im, n, s]) => <div className="c-type" key={n}><img src={im} alt="" /><div className="cap"><b>{n}</b><span className="c-pillc">{s}</span></div></div>)}</div>
      <p className="lab" style={{ padding: "0 clamp(20px,6vw,96px) 40px", margin: 0 }}>{T.protoNote[lang]}</p>
    </Shell>
  );
}
