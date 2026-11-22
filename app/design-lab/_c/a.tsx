import Link from "next/link";
import "./a.css";
import { IMG, UNITS, T, money, type Lang } from "./content";
import { Reveal } from "./reveal";

const tx = (l: Lang, he: string, en: string) => (l === "he" ? he : en);
const q = (l: Lang) => `?lang=${l}`;

function Shell({ lang, here, children }: { lang: Lang; here: "home" | "results" | "developer"; children: React.ReactNode }) {
  const other = lang === "he" ? "en" : "he";
  const base = "/design-lab/a";
  const path = here === "home" ? base : `${base}/${here}`;
  return (
    <div className="a" dir={lang === "he" ? "rtl" : "ltr"} lang={lang}>
      <nav className="a-nav"><div className="a-wrap">
        <Link href={base + q(lang)}><img src="/images/brand/logo.svg" alt="Haveniq" /></Link>
        <ul>
          <li><Link href={base + q(lang)} aria-current={here === "home" ? "page" : undefined}>{T.nav[lang][0]}</Link></li>
          <li><Link href={`${base}/results${q(lang)}`} aria-current={here === "results" ? "page" : undefined}>{T.nav[lang][1]}</Link></li>
          <li><Link href={base + q(lang)}>{T.nav[lang][2]}</Link></li>
          <li><Link href={`${base}/developer${q(lang)}`} aria-current={here === "developer" ? "page" : undefined}>{T.nav[lang][3]}</Link></li>
        </ul>
        <div className="r"><Link className="a-lang" href={path + q(other)}>{other.toUpperCase()}</Link><Link className="a-btn" href="#">{T.login[lang]}</Link></div>
      </div></nav>
      {children}
      <footer className="a-wrap"><div className="a-foot"><span className="mono">Haveniq © 2026</span><span className="mono">{T.protoNote[lang]}</span></div></footer>
      <div className="dl-proto">Concept A · prototype</div>
    </div>
  );
}

export function AHome({ lang }: { lang: Lang }) {
  const steps = [
    { n: "01", h: tx(lang, "שיחה, לא טופס", "A conversation, not a form"), p: tx(lang, "היועץ שואל על החיים שלך: מי גר, מה חשוב, מה בלתי מתפשר. בלי מסננים, בלי ניחושים.", "The advisor asks about your life: who lives there, what matters, what is non-negotiable. No filters, no guessing."), im: IMG.facade },
    { n: "02", h: tx(lang, "התאמה שאפשר לבדוק", "A match you can audit"), p: tx(lang, "כל ציון מפורק לגורמים שקופים: תקציב, אור, מיקום, גודל. אתה רואה למה, לא רק כמה.", "Every score breaks down into transparent factors: budget, light, location, size. You see why, not just how much."), im: IMG.axo },
    { n: "03", h: tx(lang, "להיכנס לפני שנכנסים", "Walk in before you walk in"), p: tx(lang, "בניין תלת-ממדי, קומה אחר קומה, ואז דירה שאפשר להסתובב בה. החלטה עם הגוף, לא רק עם הנתונים.", "A 3D building, floor by floor, then an apartment you can walk through. Decide with your body, not only with data."), im: IMG.living },
  ];
  return (
    <Shell lang={lang} here="home">
      <header className="a-wrap a-hero">
        <div className="txt">
          <span className="mono">Nº 01 — {T.brandTag[lang]}</span>
          <h1 className="serif">{lang === "he" ? <>יש הרבה בתים.<em>אחד מהם שלך.</em></> : <>Many homes.<em>One is yours.</em></>}</h1>
          <p className="lede">{tx(lang, "שיחה אחת עם יועץ AI, והתאמה לבית שמתאים לחיים שלך. בניינים אמיתיים, ציון שקוף, סיור לפני החתימה.", "One conversation with an AI advisor, matched to a home that fits how you live. Real buildings, transparent scoring, a walkthrough before you sign.")}</p>
          <div className="cta"><Link className="a-btn fill" href={`/design-lab/a/results${q(lang)}`}>{T.start[lang]} <span aria-hidden>{lang === "he" ? "←" : "→"}</span></Link><Link href={`/design-lab/a/developer${q(lang)}`} className="a-act">{tx(lang, "ליזמים ולמוכרים", "For developers & sellers")}</Link></div>
        </div>
        <figure className="a-fig now"><div className="ph"><img src={IMG.hero} alt="" /></div>
          <figcaption><span className="mono">Fig. 01 — {tx(lang, "מגדלי ירקון, הדמיה", "Yarkon Residences, rendering")}</span><span className="mono">32.10°N 34.80°E</span></figcaption></figure>
      </header>
      <div className="a-wrap"><div className="a-stats">
        {[["94%", tx(lang, "ציון התאמה ממוצע בשורה הראשונה", "Average top-match score")], ["12", tx(lang, "גורמי התאמה שקופים", "Transparent match factors")], ["3D", tx(lang, "בניין ודירה, בדפדפן", "Building and unit, in the browser")]].map(([b, s]) => (
          <Reveal key={s}><b>{b}</b><span className="mono">{s}</span></Reveal>))}
      </div></div>
      <section className="a-wrap a-sec">
        <div className="a-sec-h"><span className="mono">{tx(lang, "דרך העבודה", "How it works")}</span><h2 className="serif">{tx(lang, "שלושה צעדים, בלי רעש.", "Three steps, no noise.")}</h2></div>
        {steps.map((s) => (
          <Reveal key={s.n} className="a-row"><span className="n">{s.n}</span><h3 className="serif">{s.h}</h3><p>{s.p}</p><div className="im"><img src={s.im} alt="" /></div></Reveal>))}
      </section>
      <section className="a-wrap a-sec" style={{ paddingTop: 0 }}>
        <div className="a-plates">
          <Reveal as="figure" className="a-fig" ><div className="ph" style={{ aspectRatio: "3/4" }}><img src={IMG.terrace} alt="" /></div><figcaption><span className="mono">Fig. 02</span><span className="mono">{tx(lang, "חזית ירוקה", "Planted facade")}</span></figcaption></Reveal>
          <Reveal as="figure" className="a-fig" delay={150}><div className="ph" style={{ aspectRatio: "4/3" }}><img src={IMG.cta} alt="" /></div><figcaption><span className="mono">Fig. 03</span><span className="mono">{tx(lang, "מרפסת, שעת זהב", "Terrace, golden hour")}</span></figcaption></Reveal>
        </div>
        <style>{`.a-plates figure:nth-child(1){grid-column:1/span 5}.a-plates figure:nth-child(2){grid-column:7/span 6}@media(max-width:900px){.a-plates figure{grid-column:auto!important}}`}</style>
      </section>
      <section className="a-dev"><div className="bg"><img src={IMG.on} alt="" /></div><div className="a-wrap">
        <h2 className="serif">{tx(lang, "ליזמים: הבניין שלכם, מוצג כמו שהוא ראוי.", "For developers: your building, presented as it deserves.")}</h2>
        <div className="side"><span className="mono">{tx(lang, "תאום דיגיטלי · מלאי · אישורים", "Digital twin · inventory · approvals")}</span><p style={{ margin: 0 }}>{tx(lang, "מעלים תכנית, מקבלים בניין חי שקונים יכולים לחקור. מנהלים מלאי ועסקאות במקום אחד.", "Upload a plan, get a living building buyers can explore. Manage inventory and deals in one place.")}</p><Link className="a-btn" href={`/design-lab/a/developer${q(lang)}`}>{tx(lang, "לכניסת יזמים", "Developer access")}</Link></div>
      </div></section>
    </Shell>
  );
}

export function AResults({ lang }: { lang: Lang }) {
  return (
    <Shell lang={lang} here="results">
      <div className="a-wrap">
        <div className="a-ph"><h1 className="serif">{tx(lang, "ארבע דירות, לפי הסדר שלך.", "Four homes, in your order.")}</h1><span className="mono">{tx(lang, "מבוסס על השיחה מה-14.11 · תקציב ₪4.6–5.2M · 4 חדרים", "From your 14 Nov interview · ₪4.6–5.2M · 4 rooms")}</span></div>
        <div className="a-filters">{[tx(lang, "הכול", "All"), tx(lang, "בתקציב", "In budget"), tx(lang, "מרפסת", "Balcony"), tx(lang, "קומה גבוהה", "High floor"), tx(lang, "חניה כפולה", "Double parking")].map((c, i) => <span key={c} className={`a-chip${i === 0 ? " on" : ""}`}>{c}</span>)}</div>
        <div>
          {UNITS.map((u, i) => (
            <Reveal key={u.id} className="a-match" delay={i * 60}>
              <span className="idx">{String(i + 1).padStart(2, "0")}</span>
              <div className="im"><img src={u.img} alt="" /></div>
              <div><h3 className="serif">{u.name[lang]}</h3><span className="mono">{u.loc[lang]} · {u.id}</span></div>
              <div className="a-spec"><div><b>{u.rooms}</b><span className="mono">{tx(lang, "חדרים", "Rooms")}</span></div><div><b>{u.sqm}</b><span className="mono">{tx(lang, "מ״ר", "sqm")}</span></div><div><b>{u.floor}</b><span className="mono">{tx(lang, "קומה", "Floor")}</span></div></div>
              <ul className="a-why why-c">{u.why[lang].map((w) => <li key={w}>{w}</li>)}<li className="a-price" style={{ marginTop: 6 }}>{money(u.price, lang)}</li></ul>
              <div className="a-score"><b>{u.match}<small>%</small></b></div>
            </Reveal>))}
        </div>
        <p className="mono" style={{ padding: "24px 0 64px" }}>{T.protoNote[lang]}</p>
      </div>
    </Shell>
  );
}

export function ADeveloper({ lang }: { lang: Lang }) {
  const rows = [
    ["A-804", 4, 118, 4950000, "available"], ["A-805", 3, 92, 3890000, "reserved"], ["A-306", 5, 132, 5290000, "sold"],
    ["B-512", 4, 106, 4380000, "available"], ["B-513", 3, 88, 3610000, "available"], ["B-1101", 5, 164, 7900000, "reserved"],
  ] as const;
  const stl = { available: tx(lang, "פנויה", "Available"), reserved: tx(lang, "שמורה", "Reserved"), sold: tx(lang, "נמכרה", "Sold") };
  const col = { available: "#4A9099", reserved: "#B38B4D", sold: "#8A8F98" };
  return (
    <Shell lang={lang} here="developer">
      <div className="a-wrap">
        <div className="a-ph"><h1 className="serif">{tx(lang, "ירקון · פרויקט", "Yarkon · Project")}</h1><span className="mono">{tx(lang, "יומן מלאי · עודכן היום 09:41", "Inventory ledger · updated today 09:41")}</span></div>
        <div className="a-stats" style={{ marginBottom: 48 }}>
          {[["62%", tx(lang, "מכירות", "Sold or reserved")], ["₪148M", tx(lang, "שווי מלאי פנוי", "Available inventory value")], ["7", tx(lang, "הצעות ממתינות", "Offers pending")]].map(([b, s]) => <div key={s}><b>{b}</b><span className="mono">{s}</span></div>)}
        </div>
        <div className="a-dgrid">
          <aside className="side">
            <figure className="a-fig2"><img src={IMG.off} alt="" /><figcaption className="mono" style={{ paddingTop: 10 }}>Fig. 01 — {tx(lang, "מגדל A / B", "Tower A / B")}</figcaption></figure>
            <div><span className="mono">{tx(lang, "התקדמות תאום דיגיטלי", "Digital twin progress")}</span><div className="a-bar"><i style={{ width: "78%" }} /></div><span className="mono">78% · 5/6 {tx(lang, "סוגי דירות", "unit types")}</span></div>
            <Link className="a-btn" href="#">{tx(lang, "העלאת תכנית", "Upload floor plan")}</Link>
          </aside>
          <section className="main">
            <table className="a-tab"><thead><tr><th>{tx(lang, "יחידה", "Unit")}</th><th>{tx(lang, "תכנית", "Plan")}</th><th className="hide-m">{tx(lang, "חדרים", "Rooms")}</th><th className="hide-m">{tx(lang, "מ״ר", "sqm")}</th><th>{tx(lang, "מחיר", "Price")}</th><th>{tx(lang, "סטטוס", "Status")}</th><th /></tr></thead>
              <tbody>{rows.map(([id, r, s, p, st]) => (
                <tr key={id}><td className="n">{id}</td><td><img className="pl" src={IMG.top} alt="" /></td><td className="hide-m">{r}</td><td className="hide-m">{s}</td><td>{money(p, lang)}</td><td><span className="a-st" style={{ ["--c" as string]: col[st] }}>{stl[st]}</span></td><td><span className="a-act">{tx(lang, "פתיחה", "Open")}</span></td></tr>))}</tbody></table>
            <p className="mono" style={{ paddingTop: 20 }}>{T.protoNote[lang]}</p>
          </section>
        </div>
      </div>
    </Shell>
  );
}
