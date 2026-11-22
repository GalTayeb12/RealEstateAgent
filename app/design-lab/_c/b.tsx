"use client";
import Link from "next/link";
import { useState } from "react";
import "./b.css";
import { IMG, UNITS, T, money, type Lang } from "./content";

const tx = (l: Lang, he: string, en: string) => (l === "he" ? he : en);
const q = (l: Lang) => `?lang=${l}`;
type Here = "home" | "results" | "developer";

function Shell({ lang, here, children }: { lang: Lang; here: Here; children: React.ReactNode }) {
  const other = lang === "he" ? "en" : "he";
  const base = "/design-lab/b";
  const path = here === "home" ? base : `${base}/${here}`;
  return (
    <div className="b" dir={lang === "he" ? "rtl" : "ltr"} lang={lang}>
      <nav className="b-nav"><div>
        <Link href={base + q(lang)}><img src="/images/brand/logo.svg" alt="Haveniq" /></Link>
        <ul>
          <li><Link href={base + q(lang)} aria-current={here === "home" ? "page" : undefined}>{T.nav[lang][0]}</Link></li>
          <li><Link href={`${base}/results${q(lang)}`} aria-current={here === "results" ? "page" : undefined}>{T.nav[lang][1]}</Link></li>
          <li><Link href={base + q(lang)}>{T.nav[lang][2]}</Link></li>
          <li><Link href={`${base}/developer${q(lang)}`} aria-current={here === "developer" ? "page" : undefined}>{T.nav[lang][3]}</Link></li>
        </ul>
        <div className="b-r"><Link className="b-lang" href={path + q(other)}>{other.toUpperCase()}</Link><Link className="b-btn" href="#">{T.login[lang]}</Link></div>
      </div></nav>
      {children}
      <div className="dl-proto">Concept B · prototype</div>
    </div>
  );
}

const ST = { av: "#4A9099", rs: "#B38B4D", sd: "#8A8F98" };

export function BHome({ lang }: { lang: Lang }) {
  const bars: [string, number][] = [[tx(lang, "תקציב", "Budget"), 96], [tx(lang, "אור", "Light"), 91], [tx(lang, "מיקום", "Location"), 88], [tx(lang, "גודל", "Size"), 94]];
  const hots = [[28, 30, ST.av], [30, 52, ST.rs], [26, 70, ST.sd], [70, 38, ST.av], [72, 58, ST.av], [69, 24, ST.rs]] as const;
  return (
    <Shell lang={lang} here="home">
      <div className="b-wrap">
        <header className="b-hero">
          <div className="l">
            <span className="b-pill" style={{ alignSelf: "flex-start" }}>{tx(lang, "יועץ AI · חי", "AI advisor · live")}</span>
            <h1>{lang === "he" ? <>מדברים. מקבלים <span>התאמה</span> שאפשר לראות.</> : <>Talk. Get a <span>match</span> you can see.</>}</h1>
            <p className="lede">{tx(lang, "היועץ מבין מה חשוב לך, מדרג בניינים ודירות לפי ציון שקוף, ומאפשר להיכנס לתוכם בתלת-ממד.", "The advisor learns what matters, ranks buildings and units with a transparent score, and lets you step inside in 3D.")}</p>
            <div className="b-chat">
              <div className="b-msg ai">{tx(lang, "כמה אנשים יגורו בבית, ומה הכי חשוב לכם בבוקר?", "How many people will live there, and what matters most in the morning?")}</div>
              <div className="b-msg me">{tx(lang, "ארבעה. אור מזרחי, מרפסת, ושקט.", "Four. East light, a balcony, and quiet.")}</div>
              <div className="b-tags"><span>{tx(lang, "4 נפשות", "4 people")}</span><span>{tx(lang, "אור מזרחי", "East light")}</span><span>{tx(lang, "מרפסת", "Balcony")}</span><span>{tx(lang, "שקט", "Quiet")}</span></div>
              <div className="b-typing"><i /><i /><i /></div>
            </div>
            <div className="b-r"><Link className="b-btn" href={`/design-lab/b/results${q(lang)}`}>{T.start[lang]}</Link><Link className="b-btn ghost" href={`/design-lab/b/developer${q(lang)}`}>{tx(lang, "ליזמים", "For developers")}</Link></div>
          </div>
          <div className="b-stage">
            <img src={IMG.on} alt="" />
            <div className="b-legend">{[[tx(lang, "פנויה", "Available"), ST.av], [tx(lang, "שמורה", "Reserved"), ST.rs], [tx(lang, "נמכרה", "Sold"), ST.sd]].map(([n, c]) => <span key={n}><i style={{ ["--c" as string]: c }} />{n}</span>)}</div>
            {hots.map(([x, y, c], i) => <span key={i} className="b-hot" style={{ left: `${x}%`, top: `${y}%`, ["--c" as string]: c }} />)}
            <div className="b-float">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h4>{tx(lang, "מגדל A · קומה 8", "Tower A · floor 8")}</h4><span className="mono" style={{ fontSize: 13 }}>94%</span></div>
              {bars.map(([n, v]) => <div className="b-bar" key={n}><span>{n}</span><span><i style={{ ["--w" as string]: v + "%" }} /></span><span className="mono">{v}</span></div>)}
            </div>
          </div>
        </header>
        <section className="b-bento">
          <div className="b-card c1"><span className="b-pill">01</span><h3>{tx(lang, "ציון שאפשר לפרק", "A score you can take apart")}</h3><p>{tx(lang, "כל התאמה מראה את הגורמים שלה, ואתה קובע את המשקל של כל אחד.", "Each match shows its factors, and you set the weight of each.")}</p>{bars.map(([n, v]) => <div className="b-bar" key={n}><span>{n}</span><span><i style={{ ["--w" as string]: v + "%" }} /></span><span className="mono">{v}</span></div>)}</div>
          <div className="b-card c2"><span className="b-pill">02</span><h3>{tx(lang, "בניין שאפשר ללחוץ עליו", "A building you can click")}</h3><p>{tx(lang, "מקומה לקומה, מדירה לדירה, עם סטטוס חי.", "Floor to floor, unit to unit, with live status.")}</p><img className="fill" src={IMG.off} alt="" /></div>
          <div className="b-card c3"><span className="b-pill">03</span><h3>{tx(lang, "תכנית, אקסונומטריה, סיור", "Plan, axonometric, walkthrough")}</h3><p>{tx(lang, "אותה דירה בשלוש עדשות, ללא צורך בהדמיה חיצונית.", "The same unit through three lenses, no external render needed.")}</p><div className="b-two"><img src={IMG.axo} alt="" /><img src={IMG.living} alt="" /></div></div>
          <div className="b-card c4"><span className="b-pill" style={{ background: "#1f5a58", color: "#bfe9e1" }}>04</span><h3>{tx(lang, "ליזמים: תאום דיגיטלי", "Developers: the digital twin")}</h3><p>{tx(lang, "מעלים תכניות, מקבלים בניין חי ומלאי מסונכרן.", "Upload plans, get a live building and synced inventory.")}</p><Link className="b-btn" style={{ background: "#e6f2ef", color: "#123F40", alignSelf: "flex-start" }} href={`/design-lab/b/developer${q(lang)}`}>{tx(lang, "לדשבורד", "Open dashboard")}</Link></div>
        </section>
      </div>
    </Shell>
  );
}

export function BResults({ lang }: { lang: Lang }) {
  const [sel, setSel] = useState(0);
  const u = UNITS[sel];
  const bars = (m: number): [string, number][] => [[tx(lang, "תקציב", "Budget"), Math.min(99, m + 3)], [tx(lang, "אור", "Light"), Math.max(40, m - 4)], [tx(lang, "מיקום", "Location"), Math.min(99, m - 1)], [tx(lang, "גודל", "Size"), Math.max(40, m + 1)]];
  return (
    <Shell lang={lang} here="results">
      <div className="b-wrap"><div className="b-app">
        <aside className="b-card b-side">
          <h4>{tx(lang, "משקלי התאמה", "Match weights")}</h4>
          {[[tx(lang, "תקציב", "Budget"), 80], [tx(lang, "אור", "Light"), 65], [tx(lang, "מיקום", "Location"), 50], [tx(lang, "גודל", "Size"), 40], [tx(lang, "שקט", "Quiet"), 70]].map(([n, v]) => (
            <div className="sl" key={n as string}><div><span>{n}</span><span className="mono">{v}</span></div><input type="range" defaultValue={v as number} aria-label={n as string} /></div>))}
          <h4>{tx(lang, "מסננים", "Filters")}</h4>
          <div className="b-tags"><span>4+ {tx(lang, "חדרים", "rooms")}</span><span>{tx(lang, "מרפסת", "Balcony")}</span><span>{tx(lang, "חניה", "Parking")}</span></div>
        </aside>
        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><h1 style={{ margin: 0, fontSize: 26, fontWeight: 500 }}>{tx(lang, "4 התאמות", "4 matches")}</h1><span className="b-pill">{tx(lang, "מתעדכן לפי המשקלים", "Updates with weights")}</span></div>
          <div className="b-list">{UNITS.map((x, i) => (
            <button key={x.id} className="b-unit" aria-pressed={i === sel} onClick={() => setSel(i)}>
              <img src={x.img} alt="" />
              <div><h3>{x.name[lang]}</h3><div className="m"><span className="mono">{x.id}</span><span>{x.rooms} {tx(lang, "חד׳", "rm")}</span><span>{x.sqm} {tx(lang, "מ״ר", "sqm")}</span><span>{tx(lang, "קומה", "fl.")} {x.floor}</span></div><div className="mono" style={{ marginTop: 8, fontSize: 15 }}>{money(x.price, lang)}</div></div>
              <div className="b-ring" style={{ ["--v" as string]: x.match }}><span>{x.match}</span></div>
            </button>))}</div>
          <p className="mono" style={{ fontSize: 11, color: "var(--mute)", marginTop: 16 }}>{T.protoNote[lang]}</p>
        </section>
        <aside className="b-card b-detail">
          <div className="b-tabs"><span className="on">{tx(lang, "סקירה", "Overview")}</span><span>{tx(lang, "תכנית", "Plan")}</span><span>{tx(lang, "סיור", "Tour")}</span></div>
          <img className="main" src={u.img} alt="" />
          <div className="b-two"><img src={IMG.axo} alt="" /><img src={IMG.top} alt="" /></div>
          <div style={{ display: "grid", gap: 8 }}>{bars(u.match).map(([n, v]) => <div className="b-bar" key={n}><span>{n}</span><span><i style={{ ["--w" as string]: v + "%" }} /></span><span className="mono">{v}</span></div>)}</div>
          <ul style={{ margin: 0, paddingInline: 18, color: "var(--mute)", fontSize: 13.5 }}>{u.why[lang].map((w) => <li key={w}>{w}</li>)}</ul>
          <div className="b-r"><button className="b-btn" style={{ flex: 1, justifyContent: "center" }}>{tx(lang, "סיור בדירה", "Walk the unit")}</button><button className="b-btn ghost">{tx(lang, "הצעה", "Offer")}</button></div>
        </aside>
      </div></div>
    </Shell>
  );
}

export function BDeveloper({ lang }: { lang: Lang }) {
  const floors = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  const cell = (f: number, k: number) => { const h = (f * 7 + k * 13) % 10; return h < 4 ? ST.sd : h < 6 ? ST.rs : ST.av; };
  return (
    <Shell lang={lang} here="developer">
      <div className="b-wrap"><div className="b-dash">
        <nav className="b-sb">
          {[[tx(lang, "סקירה", "Overview"), 1], [tx(lang, "מלאי", "Inventory"), 0], [tx(lang, "תאום דיגיטלי", "Digital twin"), 0], [tx(lang, "הצעות", "Offers"), 0], [tx(lang, "אישורים", "Approvals"), 0]].map(([n, on]) => <a key={n as string} className={on ? "on" : ""}>{n}<span className="mono">{on ? "" : ""}</span></a>)}
        </nav>
        <main>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12, flexWrap: "wrap" }}><h1 style={{ margin: 0, fontSize: 28, fontWeight: 500 }}>{tx(lang, "ירקון · סקירת פרויקט", "Yarkon · Project overview")}</h1><div className="b-r"><span className="b-pill">{tx(lang, "סנכרון חי", "Live sync")}</span><button className="b-btn">{tx(lang, "העלאת תכנית", "Upload plan")}</button></div></div>
          <div className="b-kpis">{[[tx(lang, "נמכר / שמור", "Sold / reserved"), "62%", "+4.1%"], [tx(lang, "שווי פנוי", "Available value"), "₪148M", ""], [tx(lang, "הצעות", "Offers"), "7", "+2"], [tx(lang, "תאום דיגיטלי", "Twin ready"), "5/6", ""]].map(([s, b, e]) => <div className="b-card b-kpi" key={s}><small>{s}</small><b>{b}</b><em dir="ltr" style={{ textAlign: "start" }}>{e || " "}</em></div>)}</div>
          <div className="b-grid2">
            <div className="b-card"><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}><b style={{ fontWeight: 500 }}>{tx(lang, "מפת מלאי · מגדל A", "Inventory map · Tower A")}</b><span className="b-legend" style={{ position: "static" }}>{[["#4A9099", tx(lang, "פנויה", "Avail.")], ["#B38B4D", tx(lang, "שמורה", "Rsvd")], ["#8A8F98", tx(lang, "נמכרה", "Sold")]].map(([c, n]) => <span key={n}><i style={{ ["--c" as string]: c }} />{n}</span>)}</span></div>
              <div className="b-heat">{floors.map((f) => <div className="b-hr" key={f}><span>F{f}</span>{[0, 1, 2, 3, 4, 5].map((k) => <i key={k} style={{ ["--c" as string]: cell(f, k) }} />)}</div>)}</div></div>
            <div style={{ display: "grid", gap: 12 }}>
              <div className="b-card"><b style={{ fontWeight: 500, display: "block", marginBottom: 12 }}>{tx(lang, "משפך קונים", "Buyer funnel")}</b><div className="b-fun">{[[tx(lang, "צפו בבניין", "Viewed building"), 100, "1,240"], [tx(lang, "סיור בדירה", "Walked a unit"), 46, "570"], [tx(lang, "הצעה", "Made offer"), 9, "112"]].map(([n, w, v]) => <div key={n as string}>{n}<span style={{ ["--w" as string]: w + "%" }}>{v}</span></div>)}</div></div>
              <div className="b-card"><b style={{ fontWeight: 500, display: "block", marginBottom: 12 }}>{tx(lang, "ממתין לאישור", "Awaiting approval")}</b><div className="b-q">{[["A-804", tx(lang, "הצעה ₪4.85M", "Offer ₪4.85M")], ["B-512", tx(lang, "שינוי מחיר", "Price change")]].map(([a, b]) => <div key={a}><span><b className="mono">{a}</b> · {b}</span><button className="b-btn ghost" style={{ height: 32, padding: "0 12px" }}>{tx(lang, "בדיקה", "Review")}</button></div>)}</div></div>
            </div>
          </div>
          <p className="mono" style={{ fontSize: 11, color: "var(--mute)", marginTop: 16 }}>{T.protoNote[lang]}</p>
        </main>
      </div></div>
    </Shell>
  );
}
