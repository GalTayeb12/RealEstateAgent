"use client";

import { useId, useState, type CSSProperties } from "react";

/* Stage 1 of docs/HAVENIQ-REDESIGN-PROMPT.md: three worlds for the same content.
   Every hero uses the same copy and the same building so only the world changes.
   The day state is a filtered dusk render (illustration); final day frames come from Blender. */

const OFF = "/buildings/yarkon-v2/off.webp";
const ON = "/buildings/yarkon-v2/on.webp";

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Hour shown on the slider: 06:00 → 22:00. */
const hourLabel = (t: number) => {
  const h = 6 + t * 16;
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60 / 15) * 15;
  return `${String(hh + (mm === 60 ? 1 : 0)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`;
};

/** Sky wash over the render: morning sand → noon white → sunset terracotta → none at night. */
function skyWash(t: number): { color: string; alpha: number } {
  if (t < 0.3) return { color: "247, 226, 190", alpha: 0.5 - t * 0.6 };
  if (t < 0.55) return { color: "236, 244, 247", alpha: 0.32 };
  if (t < 0.78) return { color: "236, 133, 84", alpha: 0.3 * (1 - smooth(0.6, 0.78, t)) + 0.08 };
  return { color: "20, 30, 60", alpha: 0.12 };
}

function timeVars(t: number): CSSProperties {
  const wash = skyWash(t);
  return {
    "--t": t,
    "--day": 1 - smooth(0.62, 0.86, t),
    "--lit": smooth(0.74, 0.96, t),
    "--night": smooth(0.7, 0.95, t),
    "--wash": `rgba(${wash.color}, ${wash.alpha})`,
    "--sun": `${-60 + t * 120}deg`,
  } as CSSProperties;
}

function Render({ className }: { className?: string }) {
  return (
    <div className={`dx-render ${className ?? ""}`} aria-hidden>
      <img className="dx-render__day" src={OFF} alt="" />
      <img className="dx-render__lit" src={ON} alt="" />
      <span className="dx-render__wash" />
    </div>
  );
}

function TimeSlider({ t, setT, label }: { t: number; setT: (v: number) => void; label: string }) {
  const id = useId();
  return (
    <div className="dx-time">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range"
        min={0}
        max={1}
        step={0.005}
        value={t}
        onChange={(e) => setT(Number(e.target.value))}
        aria-valuetext={hourLabel(t)}
      />
      <output htmlFor={id} className="dx-time__clock">{hourLabel(t)}</output>
    </div>
  );
}

type Spec = {
  palette: { name: string; hex: string; night?: boolean }[];
  type: { display: string; text: string; extra?: string };
  signature: string;
  path: string;
  reach: string;
  risk: string;
};

function SpecSheet({ spec }: { spec: Spec }) {
  return (
    <dl className="dx-spec">
      <div className="dx-spec__row dx-spec__row--palette">
        <dt>פלטה</dt>
        <dd>
          <ul className="dx-chips">
            {spec.palette.map((c) => (
              <li key={c.hex} className={c.night ? "is-night" : undefined}>
                <span className="dx-chip" style={{ background: c.hex }} />
                <span className="dx-chip__name">{c.name}</span>
                <span className="dx-chip__hex">{c.hex}</span>
              </li>
            ))}
          </ul>
        </dd>
      </div>
      <div className="dx-spec__row">
        <dt>טיפוגרפיה</dt>
        <dd>
          {spec.type.display} לכותרות · {spec.type.text} לגוף
          {spec.type.extra ? ` · ${spec.type.extra}` : ""}
        </dd>
      </div>
      <div className="dx-spec__row">
        <dt>תנועת החתימה</dt>
        <dd>{spec.signature}</dd>
      </div>
      <div className="dx-spec__row">
        <dt>המסלול בדף הבית</dt>
        <dd>{spec.path}</dd>
      </div>
      <div className="dx-spec__row">
        <dt>במסכי האפליקציה</dt>
        <dd>{spec.reach}</dd>
      </div>
      <div className="dx-spec__row dx-spec__row--risk">
        <dt>הסיכון</dt>
        <dd>{spec.risk}</dd>
      </div>
    </dl>
  );
}

/* ───────────── A · White City ───────────── */

const SPEC_A: Spec = {
  palette: [
    { name: "טיח", hex: "#F3EFE6" },
    { name: "צל", hex: "#5E7E93" },
    { name: "ים", hex: "#1E5F7A" },
    { name: "טרקוטה", hex: "#C2552F" },
    { name: "דיו לילה", hex: "#0F1B26", night: true },
    { name: "אור חלון", hex: "#F4B95A", night: true },
  ],
  type: { display: "Rubik 800", text: "IBM Plex Sans Hebrew" },
  signature:
    "צללי המרפסות של העיר הלבנה עוברים על כל הדף ומסתובבים עם השמש. בגלילה הצל זז על הכותרות, על הכרטיסים ועל הבניין, ובלילה הוא נעלם והחלונות נדלקים.",
  path: "פס אופקי אחד, כמו חלון סרט באוהאוס, מחזיק את שני השערים. כל מערכה בדף היא \"קומה\" עם מעקה דק.",
  reach: "כרטיסים לבנים עם קו מעקה עליון, ומספרים גדולים ב־Rubik. הצל מופיע רק במצבי טעינה ומעבר.",
  risk: "לבן על לבן עלול להיראות ריק אם הצילום חלש. מחייב רינדור יום אמיתי מ־Blender.",
};

function DirectionA() {
  const [t, setT] = useState(0.18);
  return (
    <section className="dx dx--a" style={timeVars(t)} aria-labelledby="dx-a-title">
      <header className="dx-head">
        <p className="dx-head__meta">כיוון א׳ · הכיוון שהוקצה</p>
        <h2 id="dx-a-title" className="dx-head__name">עיר לבנה</h2>
        <p className="dx-head__thesis">
          באוהאוס תל־אביבי: טיח לבן, מרפסות אופקיות וצל חד. הבית מוגדר דרך האור שנכנס אליו.
        </p>
      </header>

      <div className="dx-stage dx-stage--a">
        <Render />
        <span className="dx-a__shade" aria-hidden />
        <div className="dx-a__copy">
          <h3 className="dx-a__title">
            יש הרבה בתים.
            <br />
            אחד מהם שלך.
          </h3>
        </div>
        <div className="dx-a__ribbon">
          <a className="dx-a__gate" href="/interview">
            <span className="dx-a__gate-who">קונים</span>
            אני מחפש בית
          </a>
          <a className="dx-a__gate dx-a__gate--dev" href="/dev/register">
            <span className="dx-a__gate-who">יזמים</span>
            אני בונה פרויקט
          </a>
        </div>
      </div>

      <TimeSlider t={t} setT={setT} label="שעה ביום" />
      <SpecSheet spec={SPEC_A} />
    </section>
  );
}

/* ───────────── B · Permit Sheet ───────────── */

const SPEC_B: Spec = {
  palette: [
    { name: "נייר שרטוט", hex: "#ECEEE8" },
    { name: "גרפיט", hex: "#23282C" },
    { name: "קו כחול", hex: "#2D6A8F" },
    { name: "תיקון אדום", hex: "#C8402B" },
    { name: "תכלת לילה", hex: "#0E2740", night: true },
    { name: "אור חלון", hex: "#F2BE62", night: true },
  ],
  type: { display: "Karantina 700", text: "IBM Plex Sans Hebrew", extra: "IBM Plex Mono למידות בלבד" },
  signature:
    "הבניין מצויר קו אחרי קו כמו גיליון היתר. בגלילה השרטוט מתמלא ברינדור, ובלילה הגיליון הופך לכחול־שרטוט והקומה שלך נדלקת. זה בדיוק מה שהמוצר עושה: מתוכנית ל־Twin.",
  path: "שני השערים יושבים בתוך \"טבלת הגיליון\" בפינה. כל מערכה היא חתך או מבט אחר של אותו בניין.",
  reach: "המסכים נראים כמו גיליונות: קווי מידה, מספרי גיליון, טבלאות מסודרות. מתאים במיוחד לדשבורד היזם.",
  risk: "עלול להרגיש טכני מדי לקונה פרטי. ה־Mono חייב להופיע רק על מידות אמיתיות, לא כקישוט.",
};

const FLOORS = [0.223, 0.296, 0.361, 0.426, 0.495, 0.56, 0.625, 0.694];

function DirectionB() {
  const [t, setT] = useState(0.2);
  return (
    <section className="dx dx--b" style={timeVars(t)} aria-labelledby="dx-b-title">
      <header className="dx-head">
        <p className="dx-head__meta">כיוון ב׳ · הבחירה של Impeccable</p>
        <h2 id="dx-b-title" className="dx-head__name">גיליון היתר</h2>
        <p className="dx-head__thesis">
          השפה של שרטוט אדריכלי: קו, מידה, חתך. כאן נולד כל בית, וכאן Haveniq עובדת באמת.
        </p>
      </header>

      <div className="dx-stage dx-stage--b">
        <div className="dx-b__sheet">
          <div className="dx-b__drawing">
            <Render />
            <svg className="dx-b__lines" viewBox="0 0 100 56.5" preserveAspectRatio="none" aria-hidden>
              {FLOORS.map((y, i) => (
                <g key={y}>
                  <line className="dx-b__floor" pathLength={1} x1="12" x2="44" y1={y * 56.5} y2={y * 56.5} style={{ animationDelay: `${i * 90}ms` }} />
                  <line className="dx-b__floor" pathLength={1} x1="56" x2="88" y1={y * 56.5} y2={y * 56.5} style={{ animationDelay: `${i * 90 + 45}ms` }} />
                </g>
              ))}
              <rect className="dx-b__mine" x="13.5" y={0.426 * 56.5} width="29" height={(0.495 - 0.426) * 56.5} />
              <line className="dx-b__dim" x1="9" x2="9" y1={FLOORS[0] * 56.5} y2={FLOORS[7] * 56.5} />
            </svg>
            <ol className="dx-b__levels" aria-hidden>
              {FLOORS.map((y, i) => (
                <li key={y} style={{ top: `${y * 100}%` }}>+{((8 - i) * 3.2).toFixed(2)}</li>
              ))}
            </ol>
          </div>
          <div className="dx-b__block">
            <h3 className="dx-b__title">
              יש הרבה בתים.
              <br />
              אחד מהם שלך.
            </h3>
            <div className="dx-b__gates">
              <a className="dx-b__gate" href="/interview">אני מחפש בית ←</a>
              <a className="dx-b__gate dx-b__gate--ghost" href="/dev/register">אני בונה פרויקט ←</a>
            </div>
            <dl className="dx-b__titleblock">
              <div><dt>פרויקט</dt><dd>מגדלי הירקון</dd></div>
              <div><dt>גיליון</dt><dd>A-01</dd></div>
              <div><dt>קנ״מ</dt><dd>1:200</dd></div>
            </dl>
          </div>
        </div>
      </div>

      <TimeSlider t={t} setT={setT} label="שעה ביום" />
      <SpecSheet spec={SPEC_B} />
    </section>
  );
}

/* ───────────── C · Your Window ───────────── */

const SPEC_C: Spec = {
  palette: [
    { name: "חול", hex: "#EADCC6" },
    { name: "ים עמוק", hex: "#0F4C5C" },
    { name: "שקיעה", hex: "#E4703A" },
    { name: "זית", hex: "#6B7A4B" },
    { name: "לילה", hex: "#0C1421", night: true },
    { name: "החלון שלך", hex: "#FFC65C", night: true },
  ],
  type: { display: "Frank Ruhl Libre 900", text: "Assistant" },
  signature:
    "העיר בלילה היא רשת של חלונות, וכל חלון הוא בית. בגלילה הרשת מתמלאת, ובסוף נשאר חלון אחד דולק: ההתאמה שלך, עם האחוז האמיתי שלה.",
  path: "שדות צבע גדולים שמתחלפים עם השעה: חול, ים, שקיעה, לילה. השערים הם שני חלונות.",
  reach: "כרטיסי נכס בצורת \"חלון\" עם מסגרת עבה, וצבע הרקע של כל מסך לפי השעה בפועל אצל המשתמש.",
  risk: "שדות צבע חזקים מתנגשים עם תמונות נכסים צבעוניות. דורש משמעת: צבע אחד בכל מסך.",
};

function DirectionC() {
  const [t, setT] = useState(0.55);
  const windows = Array.from({ length: 60 });
  return (
    <section className="dx dx--c" style={timeVars(t)} aria-labelledby="dx-c-title">
      <header className="dx-head">
        <p className="dx-head__meta">כיוון ג׳ · אלטרנטיבה</p>
        <h2 id="dx-c-title" className="dx-head__name">החלון שלך</h2>
        <p className="dx-head__thesis">
          צבעי הים התיכון כשדות גדולים, וטיפוגרפיה עיתונאית ענקית. בלילה: רשת חלונות, ואחד מהם שלך.
        </p>
      </header>

      <div className="dx-stage dx-stage--c">
        <div className="dx-c__field">
          <h3 className="dx-c__title">
            יש הרבה בתים.
            <br />
            <em>אחד</em> מהם שלך.
          </h3>
          <div className="dx-c__grid" aria-hidden>
            {windows.map((_, i) => (
              <span key={i} className={i === 31 ? "is-yours" : undefined} style={{ transitionDelay: `${(i * 37) % 400}ms` }} />
            ))}
          </div>
          <div className="dx-c__gates">
            <a className="dx-c__gate" href="/interview">אני מחפש בית</a>
            <a className="dx-c__gate dx-c__gate--dev" href="/dev/register">אני בונה פרויקט</a>
          </div>
        </div>
        <div className="dx-c__photo">
          <Render />
        </div>
      </div>

      <TimeSlider t={t} setT={setT} label="שעה ביום" />
      <SpecSheet spec={SPEC_C} />
    </section>
  );
}

export default function Directions() {
  return (
    <main className="dx-page">
      <header className="dx-intro">
        <h1>שלב 1 · שלושה כיוונים</h1>
        <p>
          אותו תוכן ואותו בניין, בשלושה עולמות שונים. הזיזו את <strong>שעה ביום</strong> בכל כיוון כדי לראות את המעבר מבוקר
          ללילה. מצב היום כאן הוא המחשה מסוננת של רינדור ערב; הרינדור הסופי יגיע מ־Blender.
        </p>
      </header>
      <DirectionA />
      <DirectionB />
      <DirectionC />
      <footer className="dx-exit">
        <h2>הדלת השקטה: הסטנדרט של הקטגוריה</h2>
        <p>
          צילום גדול, סריף אלגנטי וזהב, כמו רוב אתרי הנדל״ן היוקרתיים. זה בערך המצב הנוכחי של האתר. אפשר לבחור בו, ואז נבצע אותו
          ברמה הגבוהה ביותר, בלי טריקים.
        </p>
      </footer>
    </main>
  );
}
