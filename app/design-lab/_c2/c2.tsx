"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { IMG, UNITS, money, T, type Lang } from "../_c/content";
import { Arrow, Facade, Rv, Scene, Shell, Tour, q, tx, useCount, useInView, unitsOf, SC, type FUnit } from "./parts";

const CLOSE = () => null;
void CLOSE;

/* ============================== HOME ============================== */
export function C2Home({ lang }: { lang: Lang }) {
  const [mins, setMins] = useState(17 * 60 + 40);
  const [tour, setTour] = useState<FUnit | null>(null);
  const onP = useCallback((p: number) => setMins(Math.round((17 * 60 + 40 + p * 230) / 2) * 2), []);
  const clock = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  const phase = mins < 18 * 60 + 30 ? tx(lang, "שעת זהב", "Golden hour") : mins < 19 * 60 + 45 ? tx(lang, "דמדומים", "Dusk") : mins < 21 * 60 ? tx(lang, "ערב", "Evening") : tx(lang, "בפנים", "Inside");
  const ch = [
    { at: 0, k: 6, first: true, ix: "01", h: tx(lang, "יש הרבה בתים.\nאחד מהם שלך.", "There are many homes.\nOne of them is yours."), p: tx(lang, "שיחה אחת עם יועץ, והעיר מסתדרת סביב מה שחשוב לך.", "One conversation with an advisor, and the city arranges itself around what matters to you.") },
    { at: 0.33, ix: "02", h: tx(lang, "הבניין מתעורר.", "The building wakes."), p: tx(lang, "מגדלים אמיתיים, קומה אחר קומה, עם סטטוס חי.", "Real towers, floor by floor, with live status.") },
    { at: 0.64, ix: "03", h: tx(lang, "האורות נדלקים.", "The lights come on."), p: tx(lang, "בוחרים קומה, רואים מה פנוי ומה מתאים לכם.", "Pick a floor. See what is open and what fits you.") },
    { at: 0.95, k: 9, ix: "04", h: tx(lang, "נכנסים הביתה.", "You step inside."), p: tx(lang, "סיור בדירה לפני שחותמים על משהו.", "Walk the apartment before you sign anything.") },
  ];
  const [chatRef, chatOn] = useInView<HTMLDivElement>(0.3);
  const score = useCount(94, chatOn, 1800);
  const bars: [string, number][] = [[tx(lang, "תקציב", "Budget"), 96], [tx(lang, "אור", "Light"), 91], [tx(lang, "מיקום", "Location"), 88], [tx(lang, "גודל", "Size"), 94]];
  const plates = [[IMG.living, tx(lang, "סלון", "Living"), "01", 0], [IMG.kitchen, tx(lang, "מטבח", "Kitchen"), "02", 1], [IMG.bedroom, tx(lang, "שינה", "Bedroom"), "03", 2], [IMG.balcony, tx(lang, "מרפסת", "Balcony"), "04", 4]] as const;
  const [start, setStart] = useState(0);
  const openRoom = (n: number) => { setStart(n); setTour(unitsOf("A", 8)[3]); };
  return (
    <Shell lang={lang} here="home">
      <Scene height="520vh" onP={onP}>
        <div className="c2-sticky">
          <div className="c2-ly l1"><img src={IMG.hero} alt="" /></div>
          <div className="c2-ly l2"><img src={IMG.off} alt="" /></div>
          <div className="c2-ly l3"><img src={IMG.on} alt="" /></div>
          <div className="c2-ly l4"><img src={IMG.living} alt="" /></div>
          <div className="c2-vig" />
          {ch.map((c) => (
            <div key={c.at} className={`c2-ch${c.first ? " first" : ""}`} style={{ ["--at" as string]: c.at, ["--k" as string]: c.k ?? 5 }}>
              <span className="eyebrow"><span className="ix">{c.ix} / 04</span></span>
              {c.first ? <h1 className="c2-in" style={{ ["--d" as string]: ".3s" }}>{c.h}</h1> : <h2>{c.h}</h2>}
              <p className={c.first ? "c2-in" : ""} style={{ ["--d" as string]: ".7s" }}>{c.p}</p>
              {c.first && <div className="cta c2-in" style={{ ["--d" as string]: "1s" }}><Link className="c2-btn gold" href={`/design-lab/c2/results${q(lang)}`}>{T.start[lang]} <Arrow /></Link><Link className="c2-btn" href={`/design-lab/c2/developer${q(lang)}`}>{tx(lang, "ליזמים", "For developers")}</Link></div>}
            </div>))}
          <div className="c2-hint"><span>{tx(lang, "גללו", "Scroll")}</span><i /></div>
          <div className="c2-hud"><div className="c2-clock"><b>{clock}</b><span>{phase}</span></div><div className="c2-track"><i /></div><span className="eyebrow" style={{ whiteSpace: "nowrap" }}>{tx(lang, "ירקון · תל אביב", "Yarkon · Tel Aviv")}</span></div>
        </div>
      </Scene>

      <section className="c2-sec c2-adv" id="advisor">
        <div className="bg"><img src={IMG.bedroom} alt="" /></div>
        <div className="c2-split">
          <Rv><span className="eyebrow">{tx(lang, "היועץ", "The advisor")}</span><h2 className="c2-h2" style={{ margin: "22px 0 26px" }}>{tx(lang, "מכיר אתכם, לא את המסננים שלכם.", "It learns you, not your filters.")}</h2><p className="c2-lede">{tx(lang, "שיחה טבעית על החיים, והתאמה שמסבירה את עצמה. כל ציון נפתח לגורמים שאפשר לבדוק ולשנות.", "A natural conversation about your life, and a match that explains itself. Every score opens into factors you can inspect and re-weigh.")}</p></Rv>
          <div ref={chatRef} className="c2-chat c2-glass">
            <Rv><div className="c2-bub ai">{tx(lang, "מי גר בבית, ומה הכי חשוב לכם בבוקר?", "Who lives there, and what matters most in the morning?")}</div></Rv>
            <Rv delay={500}><div className="c2-bub me">{tx(lang, "ארבעה. אור מזרחי, מרפסת, ושקט.", "Four of us. East light, a balcony, quiet.")}</div></Rv>
            <Rv delay={1000}><div className="c2-chips"><span>{tx(lang, "4 נפשות", "4 people")}</span><span>{tx(lang, "אור מזרחי", "East light")}</span><span>{tx(lang, "מרפסת", "Balcony")}</span><span>{tx(lang, "שקט", "Quiet")}</span></div></Rv>
            <Rv delay={1500}>
              <div className="c2-bars">
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}><span className="eyebrow">{tx(lang, "מגדל A · קומה 8", "Tower A · floor 8")}</span><span className="num" style={{ fontSize: 40, fontWeight: 200, direction: "ltr" }}>{score}<small style={{ fontSize: 16, color: "var(--gold)" }}>%</small></span></div>
                {bars.map(([n, v]) => <div className="c2-bar" key={n}><span>{n}</span><span><i style={{ ["--w" as string]: chatOn ? v + "%" : "0%" }} /></span><b>{v}</b></div>)}
              </div>
            </Rv>
          </div>
        </div>
      </section>

      <section className="c2-sec" style={{ paddingTop: 0 }}>
        <Rv><span className="eyebrow">{tx(lang, "הבניין", "The building")}</span><h2 className="c2-h2" style={{ margin: "22px 0 16px", maxWidth: "16ch" }}>{tx(lang, "בחרו קומה. האורות עונים.", "Choose a floor. The lights answer.")}</h2><p className="c2-lede">{tx(lang, "הבניין האמיתי, לא איור. כל קומה נדלקת, וכל יחידה מובילה פנימה.", "The real building, not an illustration. Every floor lights up, every unit leads inside.")}</p></Rv>
        <Facade lang={lang} mode="buyer" onEnter={(u) => { setStart(0); setTour(u); }} />
      </section>

      <section className="c2-sec" style={{ paddingTop: 0 }}>
        <Rv><span className="eyebrow">{tx(lang, "בפנים", "Inside")}</span><h2 className="c2-h2" style={{ margin: "22px 0 0", maxWidth: "18ch" }}>{tx(lang, "חמישה חדרים. סיור אחד.", "Five rooms. One walkthrough.")}</h2></Rv>
        <div className="c2-plates">{plates.map(([im, n, no, ri], i) => (
          <Rv key={no} delay={i * 120}><button className="c2-plate" onClick={() => openRoom(ri)} aria-label={n}><div className="im"><img src={im} alt="" /></div><div className="meta"><span>{n}</span><b>{no}</b></div></button></Rv>))}</div>
      </section>

      <section className="c2-sec" style={{ paddingTop: 0 }}>
        <div className="c2-split">
          <Rv><div className="c2-twin"><img src={IMG.axo} alt="" style={{ objectFit: "contain", background: "#0f1817" }} /><div className="pipe c2-glass"><div className="c2-pipe"><div className="d"><i />{tx(lang, "תכנית", "Plan")}</div><div className="d"><i />{tx(lang, "תאום", "Twin")}</div><div className="n"><i />{tx(lang, "הדמיות", "Renders")}</div><div><i />{tx(lang, "השקה", "Launch")}</div></div></div></div></Rv>
          <Rv delay={150}><span className="eyebrow">{tx(lang, "ליזמים", "For developers")}</span><h2 className="c2-h2" style={{ margin: "22px 0 24px" }}>{tx(lang, "הבניין שלכם, בשיא יופיו.", "Your building, at its most beautiful.")}</h2><p className="c2-lede">{tx(lang, "מעלים תכנית, מקבלים בניין חי שקונים יכולים לחקור, ומנהלים מלאי, הצעות ואישורים מאותו מקום.", "Upload a plan, get a living building buyers can explore, and run inventory, offers and approvals from the same place.")}</p><div style={{ marginTop: 28 }}><Link className="c2-btn" href={`/design-lab/c2/developer${q(lang)}`}>{tx(lang, "לדשבורד", "Open dashboard")} <Arrow /></Link></div></Rv>
        </div>
      </section>

      <section className="c2-cta"><img src={IMG.cta} alt="" /><div className="in"><Rv><h2>{tx(lang, "הבית שלכם כבר מחכה.", "Your home is already waiting.")}</h2></Rv><Rv delay={150}><div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}><Link className="c2-btn gold" href={`/design-lab/c2/results${q(lang)}`}>{T.start[lang]} <Arrow /></Link><Link className="c2-btn" href={`/design-lab/c2/developer${q(lang)}`}>{tx(lang, "ליזמים", "For developers")}</Link></div></Rv></div></section>
      <footer className="c2-foot"><span className="eyebrow">Haveniq © 2026</span><span className="eyebrow">{T.protoNote[lang]}</span></footer>
      <Tour key={(tour?.id ?? "x") + start} lang={lang} unit={tour} start={start} onClose={() => setTour(null)} />
    </Shell>
  );
}

/* ============================== RESULTS ============================== */
const FACT: Record<string, number[]> = { "A-804": [97, 92, 90, 95, 93], "B-512": [99, 84, 88, 90, 95], "A-306": [82, 86, 80, 94, 72], "B-1101": [44, 90, 80, 96, 70] };
export function C2Results({ lang }: { lang: Lang }) {
  const [sel, setSel] = useState(0);
  const [tune, setTune] = useState(false);
  const [w, setW] = useState([80, 65, 50, 40, 70]);
  const [tour, setTour] = useState<FUnit | null>(null);
  const names = [tx(lang, "תקציב", "Budget"), tx(lang, "אור", "Light"), tx(lang, "מיקום", "Location"), tx(lang, "גודל", "Size"), tx(lang, "שקט", "Quiet")];
  const score = (id: string) => { const f = FACT[id]; const s = w.reduce((a, b) => a + b, 0) || 1; return Math.round(f.reduce((a, v, i) => a + v * w[i], 0) / s); };
  const u = UNITS[sel]; const f = FACT[u.id]; const sc = score(u.id);
  const [ref, on] = useInView<HTMLDivElement>(0.1); void ref; void on;
  const key = (e: React.KeyboardEvent) => { if (e.key === "ArrowRight") setSel((s) => Math.min(UNITS.length - 1, s + 1)); if (e.key === "ArrowLeft") setSel((s) => Math.max(0, s - 1)); };
  return (
    <Shell lang={lang} here="results">
      <div className="c2-res" onKeyDown={key}>
        <div className="bgs">{UNITS.map((x, i) => <img key={x.id} className={i === sel ? "on" : ""} src={x.img} alt="" />)}</div>
        <div className="shade" />
        <div className="hd"><div style={{ display: "grid", gap: 16 }}><span className="eyebrow">{tx(lang, "ההתאמות שלך", "Your matches")}</span><h1>{tx(lang, "הבית שמרגיש כמו שאמרת.", "The home that feels like you said.")}</h1></div><span className="c2-ctr"><b>{String(sel + 1).padStart(2, "0")}</b> / {String(UNITS.length).padStart(2, "0")}</span></div>
        <div className="c2-main">
          <div key={u.id}>
            <div className="c2-score c2-in" style={{ ["--d" as string]: "0s" }}>{sc}<small>%</small></div>
            <span className="eyebrow c2-in" style={{ marginTop: 22, ["--d" as string]: ".1s" }}>{u.loc[lang]} · {u.id}</span>
            <h2 className="c2-in" style={{ ["--d" as string]: ".15s" }}>{u.name[lang]}</h2>
            <div className="c2-facts c2-in" style={{ ["--d" as string]: ".25s" }}><div><b>{u.rooms}</b><span>{tx(lang, "חדרים", "Rooms")}</span></div><div><b>{u.sqm}</b><span>{tx(lang, "מ״ר", "sqm")}</span></div><div><b>{u.floor}</b><span>{tx(lang, "קומה", "Floor")}</span></div><div><b>{money(u.price, lang)}</b><span>{tx(lang, "מחיר", "Price")}</span></div></div>
            <div className="c2-act"><button className="c2-btn gold" onClick={() => setTour(unitsOf(u.id.startsWith("A") ? "A" : "B", Math.min(8, u.floor))[0])}>{tx(lang, "כניסה לסיור", "Enter the tour")} <Arrow /></button><button className="c2-btn">{tx(lang, "הצעה", "Make an offer")}</button><button className="c2-btn" aria-expanded={tune} onClick={() => setTune(!tune)}>{tx(lang, "כוונון משקלים", "Tune weights")}</button></div>
          </div>
          <aside className="c2-side c2-glass">
            <span className="eyebrow">{tx(lang, "למה זו התאמה", "Why it matches")}</span>
            <div className="c2-bars" style={{ borderTop: 0, paddingTop: 0 }}>{names.map((n, i) => <div className="c2-bar" key={n}><span>{n}</span><span><i style={{ ["--w" as string]: f[i] + "%" }} /></span><b>{f[i]}</b></div>)}</div>
            <ul className="c2-why">{u.why[lang].map((x) => <li key={x}>{x}</li>)}</ul>
            <div className="c2-plan"><img src={IMG.axo} alt="" /><span style={{ fontSize: 13, color: "var(--mute)" }}>{tx(lang, "תכנית אקסונומטרית. הסיור מתחיל בסלון.", "Axonometric plan. The tour starts in the living room.")}</span></div>
            {tune && <div className="c2-tune">{names.map((n, i) => <label key={n}><span>{n}</span><input type="range" min={0} max={100} value={w[i]} onChange={(e) => setW(w.map((x, j) => (j === i ? +e.target.value : x)))} aria-label={n} /><b className="num" style={{ color: "var(--ink)" }}>{w[i]}</b></label>)}</div>}
          </aside>
        </div>
        <div className="c2-rail" role="listbox" aria-label={tx(lang, "התאמות", "Matches")}>{UNITS.map((x, i) => (
          <button key={x.id} className="c2-card" role="option" aria-selected={i === sel} aria-pressed={i === sel} onClick={() => setSel(i)}><img src={x.img} alt="" /><div><b>{x.name[lang]}</b><em>{score(x.id)}%</em><span className="num">{money(x.price, lang)}</span></div></button>))}</div>
        <p className="eyebrow" style={{ position: "relative", padding: "0 clamp(20px,6vw,96px) 22px", margin: 0 }}>{T.protoNote[lang]}</p>
      </div>
      <Tour key={tour?.id ?? "x"} lang={lang} unit={tour} onClose={() => setTour(null)} />
    </Shell>
  );
}

/* ============================== DEVELOPER ============================== */
export function C2Developer({ lang }: { lang: Lang }) {
  const [tour, setTour] = useState<FUnit | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const [kRef, kOn] = useInView<HTMLDivElement>(0.2);
  const pct = useCount(62, kOn); const val = useCount(148, kOn); const off = useCount(7, kOn); const tw = useCount(5, kOn);
  const kpis: [string, string, string][] = [[tx(lang, "נמכר / שמור", "Sold / reserved"), pct + "%", "+4.1%"], [tx(lang, "שווי מלאי פנוי", "Available value"), "₪" + val + "M", "−₪6M"], [tx(lang, "הצעות פתוחות", "Open offers"), String(off), "+2"], [tx(lang, "תאום דיגיטלי", "Twin ready"), tw + "/6", ""]];
  const approvals = [["A-804", tx(lang, "הצעה ₪4.85M", "Offer ₪4.85M"), tx(lang, "לפני 12 דק׳", "12 min ago")], ["B-512", tx(lang, "שינוי מחיר −2%", "Price change −2%"), tx(lang, "לפני שעה", "1 h ago")], ["A-306", tx(lang, "הארכת שמירה", "Hold extension"), tx(lang, "אתמול", "Yesterday")]];
  const funnel: [string, number, string][] = [[tx(lang, "צפו בבניין", "Viewed building"), 100, "1,240"], [tx(lang, "סיור בדירה", "Walked a unit"), 46, "570"], [tx(lang, "פנו ליועץ", "Spoke to advisor"), 21, "262"], [tx(lang, "הגישו הצעה", "Made an offer"), 9, "112"]];
  const steps: [string, string, string][] = [[tx(lang, "תכניות הועלו", "Plans uploaded"), "d", "6/6"], [tx(lang, "תאום דיגיטלי", "Digital twin"), "d", "5/6"], [tx(lang, "הדמיות וסיורים", "Renders & tours"), "n", "72%"], [tx(lang, "השקה לקונים", "Buyer launch"), "", "01.12"]];
  const nav = [tx(lang, "סקירה", "Overview"), tx(lang, "מלאי", "Inventory"), tx(lang, "תאום דיגיטלי", "Digital twin"), tx(lang, "הצעות", "Offers"), tx(lang, "אישורים", "Approvals")];
  return (
    <Shell lang={lang} here="developer">
      <div className="c2-dev">
        <nav className="c2-rail2" aria-label="dashboard">{nav.map((n, i) => <a key={n} className={i === 0 ? "on" : ""} href="#">{n}</a>)}</nav>
        <main className="c2-dmain">
          <div className="c2-dcover"><img src={IMG.on} alt="" />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}><div style={{ display: "grid", gap: 16 }}><span className="eyebrow">{tx(lang, "פרויקט", "Project")} · {tx(lang, "ירקון", "Yarkon")}</span><h1>{tx(lang, "62% מהמלאי כבר מצא בית.", "62% of the inventory has found a home.")}</h1></div><div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}><span className="c2-live">{tx(lang, "סנכרון חי", "Live sync")}</span><button className="c2-btn gold sm">{tx(lang, "העלאת תכנית", "Upload plan")}</button></div></div>
            <div ref={kRef} className="c2-kpis">{kpis.map(([s, b, e]) => <div className="c2-kpi" key={s}><small>{s}</small><b>{b}</b><em>{e || " "}</em></div>)}</div>
          </div>
          <div className="c2-dgrid">
            <div className="col">
              <section className="c2-card2 c2-glass" style={{ padding: 18 }}><h3 style={{ padding: "4px 4px 0" }}>{tx(lang, "מפת מלאי", "Inventory map")}<small>{tx(lang, "נקודות = סטטוס יחידות בקומה", "Dots = unit status per floor")}</small></h3><Facade lang={lang} mode="dev" onEnter={setTour} /></section>
              <section className="c2-card2 c2-glass"><h3>{tx(lang, "סוגי דירות", "Unit types")}<small>{tx(lang, "תאום דיגיטלי", "Digital twin")}</small></h3><div className="c2-types">{[[IMG.living, "A · 4", tx(lang, "מוכן", "Ready")], [IMG.balcony, "B · 4", tx(lang, "מוכן", "Ready")], [IMG.kitchen, "C · 5", tx(lang, "בבנייה", "Building")]].map(([im, n, s]) => <div className="c2-ty" key={n}><img src={im} alt="" /><div className="cap"><b>{n} {tx(lang, "חד׳", "rm")}</b><small>{s}</small></div></div>)}</div></section>
            </div>
            <div className="col">
              <section className="c2-card2 c2-glass"><h3>{tx(lang, "ממתין לאישור", "Awaiting approval")}<small className="num">{approvals.length - done.length}</small></h3><div className="c2-q">{approvals.filter(([id]) => !done.includes(id)).map(([id, a, t]) => <div key={id}><b><span className="num">{id}</span> · {a}</b><small>{t}</small><span className="acts"><button className="c2-btn sm" onClick={() => setDone([...done, id])}>{tx(lang, "אישור", "Approve")}</button></span></div>)}{done.length === approvals.length && <span style={{ color: "var(--mute)", fontSize: 14 }}>{tx(lang, "הכול טופל.", "All caught up.")}</span>}</div></section>
              <section className="c2-card2 c2-glass"><h3>{tx(lang, "משפך קונים", "Buyer funnel")}<small>30 {tx(lang, "ימים", "days")}</small></h3><div className="c2-fun">{funnel.map(([n, w, v]) => <div key={n}><span>{n}<b>{v}</b></span><i style={{ ["--w" as string]: w + "%" }} /></div>)}</div></section>
              <section className="c2-card2 c2-glass"><h3>{tx(lang, "מסלול ההשקה", "Launch path")}</h3><div className="c2-tl">{steps.map(([n, s, v]) => <div key={n} className={s}><span style={{ display: "none" }} /><b style={{ fontWeight: 300 }}>{n}</b><span>{v}</span></div>)}</div></section>
            </div>
          </div>
          <p className="eyebrow" style={{ padding: "0 clamp(20px,4vw,56px) 32px", margin: 0 }}>{T.protoNote[lang]} · {Object.keys(SC).length && ""}</p>
        </main>
      </div>
      <Tour key={tour?.id ?? "x"} lang={lang} unit={tour} onClose={() => setTour(null)} />
    </Shell>
  );
}
