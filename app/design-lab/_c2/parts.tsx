"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import "./c2.css";
import { IMG, T, money, type Lang } from "../_c/content";

export const tx = (l: Lang, he: string, en: string) => (l === "he" ? he : en);
export const q = (l: Lang) => `?lang=${l}`;
export type Here = "home" | "results" | "developer";

export const Arrow = () => (<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden><path d="M2 8h12M9 3l5 5-5 5" /></svg>);

/* ---------- hooks ---------- */
export function useInView<T extends HTMLElement>(threshold = 0.25) {
  const ref = useRef<T | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold });
    io.observe(el); return () => io.disconnect();
  }, [threshold]);
  return [ref, on] as const;
}
export function useCount(target: number, run: boolean, ms = 1400) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) return; let raf = 0; const t0 = performance.now();
    const tick = (t: number) => { const k = Math.min(1, (t - t0) / ms); setV(Math.round(target * (1 - Math.pow(1 - k, 4)))); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [target, run, ms]);
  return v;
}
export function Rv({ children, className = "", delay = 0, as: Tag = "div" }: { children: React.ReactNode; className?: string; delay?: number; as?: React.ElementType }) {
  const [ref, on] = useInView<HTMLElement>(0.15);
  return <Tag ref={ref} className={`c2-rv ${className}`} data-in={on ? "1" : "0"} style={{ transitionDelay: `${delay}ms` }}>{children}</Tag>;
}
/** Writes --p (0..1) for the scene element; also reports it. */
export function Scene({ children, height, onP }: { children: React.ReactNode; height: string; onP?: (p: number) => void }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = el.current; const root = node?.closest(".dl-root") as HTMLElement | null; if (!node || !root) return;
    let raf = 0;
    const tick = () => { raf = 0; const r = node.getBoundingClientRect(); const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - window.innerHeight))); node.style.setProperty("--p", p.toFixed(4)); onP?.(p); };
    const on = () => { if (!raf) raf = requestAnimationFrame(tick); };
    root.addEventListener("scroll", on, { passive: true }); window.addEventListener("resize", on); tick();
    return () => { root.removeEventListener("scroll", on); window.removeEventListener("resize", on); };
  }, [onP]);
  return <div ref={el} className="c2-scene" style={{ height, ["--p" as string]: 0 }}>{children}</div>;
}

/* ---------- shell ---------- */
export function Shell({ lang, here, children, home = "/design-lab/c2", anchor = "building" }: { lang: Lang; here: Here; children: React.ReactNode; home?: string; anchor?: string }) {
  const other = lang === "he" ? "en" : "he";
  const base = "/design-lab/c2"; const path = here === "home" ? home : `${base}/${here}`;
  const [solid, setSolid] = useState(false); const [menu, setMenu] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sc = root.current?.closest(".dl-root") as HTMLElement | null; if (!sc) return;
    const on = () => setSolid(sc.scrollTop > 60); on();
    sc.addEventListener("scroll", on, { passive: true }); return () => sc.removeEventListener("scroll", on);
  }, []);
  const links: [string, string, boolean][] = [[T.nav[lang][0], home + q(lang), here === "home"], [T.nav[lang][1], `${base}/results${q(lang)}`, here === "results"], [T.nav[lang][2], `${home}${q(lang)}#${anchor}`, false], [T.nav[lang][3], `${base}/developer${q(lang)}`, here === "developer"]];
  return (
    <div ref={root} className="c2" dir={lang === "he" ? "rtl" : "ltr"} lang={lang}>
      <nav className={`c2-nav${solid || here !== "home" ? " solid" : ""}`}>
        <Link href={home + q(lang)}><img src="/images/brand/logo-light.svg" alt="Haveniq" /></Link>
        <ul>{links.map(([n, h, on]) => <li key={n}><Link href={h} aria-current={on ? "page" : undefined}>{n}</Link></li>)}</ul>
        <div className="r"><Link className="c2-lang" href={path + q(other)} aria-label={other === "en" ? "English" : "עברית"}>{other.toUpperCase()}</Link><Link className="c2-btn sm" href="#">{T.login[lang]}</Link>
          <button className="c2-burger" aria-label="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}><svg width="18" height="10" viewBox="0 0 18 10" stroke="currentColor"><path d="M0 1h18M0 9h18" /></svg></button></div>
      </nav>
      <div className={`c2-menu${menu ? " on" : ""}`} onClick={() => setMenu(false)}>{links.map(([n, h]) => <Link key={n} href={h}>{n}</Link>)}<Link href={path + q(other)} className="c2-lang" style={{ marginTop: 20 }}>{other === "en" ? "English" : "עברית"}</Link></div>
      {children}
      <div className="c2-grain" />
      <div className="dl-proto">Concept C · {home.endsWith("c3") ? "v3" : "v2"} · prototype</div>
    </div>
  );
}

/* ---------- facade data ---------- */
// Geometry of the twin-tower render (2720x1536), measured against the image.
const GEO = { A: { x: 13.2, w: 29.5, cx: 28 }, B: { x: 57.8, w: 30.5, cx: 72.5 }, top: 14.6, bottom: 73, floors: 8 };
const H = (GEO.bottom - GEO.top) / GEO.floors;
export type Status = "av" | "rs" | "sd";
export const SC: Record<Status, string> = { av: "#5FB3BE", rs: "#C9A46A", sd: "#7A8087" };
const hash = (a: number, b: number, c: number) => ((a * 73 + b * 151 + c * 31) * 2654435761 >>> 0) % 100;
export interface FUnit { id: string; tower: "A" | "B"; floor: number; rooms: number; sqm: number; price: number; st: Status; match: number }
export function unitsOf(tower: "A" | "B", floor: number): FUnit[] {
  const ti = tower === "A" ? 1 : 2;
  return [1, 2, 3, 4].map((k) => {
    const h = hash(ti, floor, k); const rooms = k === 1 ? 3 : k === 4 ? 5 : 4; const sqm = 78 + rooms * 11 + k * 3 + (floor % 3) * 2;
    return { id: `${tower}-${floor}0${k}`, tower, floor, rooms, sqm, price: Math.round((sqm * 36500 + floor * 62000) / 10000) * 10000, st: h < 38 ? "sd" : h < 58 ? "rs" : "av", match: 62 + (h % 34) };
  });
}
const stName = (l: Lang): Record<Status, string> => ({ av: tx(l, "פנויה", "Available"), rs: tx(l, "שמורה", "Reserved"), sd: tx(l, "נמכרה", "Sold") });

export function Facade({ lang, mode, onEnter }: { lang: Lang; mode: "buyer" | "dev"; onEnter: (u: FUnit) => void }) {
  const [tower, setTower] = useState<"A" | "B">("A");
  const [hov, setHov] = useState<number | null>(null);
  const [sel, setSel] = useState<number | null>(mode === "dev" ? 6 : null);
  const active = hov ?? sel;
  const g = GEO[tower];
  const yTop = (f: number) => GEO.bottom - f * H;
  const lit = active != null ? { t: yTop(active), r: 100 - g.x - g.w, b: 100 - (yTop(active) + H), l: g.x } : null;
  const units = sel != null ? unitsOf(tower, sel) : [];
  const names = stName(lang);
  return (
    <div className={`c2-fx${mode === "dev" ? " dev" : ""}`} id={mode === "dev" ? undefined : "building"}>
      <div className="c2-viewport" style={{ ["--cx" as string]: g.cx + "%" }}>
        <div className="c2-stage">
          <img src={IMG.off} alt="" draggable={false} />
          <img className="c2-lit" src={IMG.on} alt="" draggable={false} style={lit ? { ["--t" as string]: lit.t + "%", ["--r" as string]: lit.r + "%", ["--b" as string]: lit.b + "%", ["--l" as string]: lit.l + "%" } : { ["--t" as string]: "50%", ["--r" as string]: "50%", ["--b" as string]: "50%", ["--l" as string]: "50%", opacity: 0 }} />
          {active != null && <span className="c2-glow" style={{ ["--gl" as string]: g.x - 4 + "%", ["--gw" as string]: g.w + 8 + "%", ["--gt" as string]: yTop(active) - 2 + "%", ["--gh" as string]: H + 4 + "%" }} />}
          {Array.from({ length: GEO.floors }, (_, i) => i + 1).map((f) => {
            const us = unitsOf(tower, f);
            return <button key={f} className={`c2-band${mode === "dev" ? " st" : ""}`} data-f={`F${f}`} aria-pressed={sel === f} aria-label={`${tx(lang, "קומה", "Floor")} ${f}`}
              style={{ ["--x" as string]: g.x + "%", ["--w" as string]: g.w + "%", ["--y" as string]: yTop(f) + "%", ["--h" as string]: H + "%" }}
              onMouseEnter={() => setHov(f)} onMouseLeave={() => setHov(null)} onFocus={() => setHov(f)} onBlur={() => setHov(null)} onClick={() => setSel(f)}>
              {mode === "dev" && us.map((u) => <i key={u.id} style={{ ["--sc" as string]: SC[u.st] }} />)}
            </button>;
          })}
        </div>
        <div className="c2-twrap">{(["A", "B"] as const).map((t) => <button key={t} className="c2-tw" aria-pressed={tower === t} onClick={() => { setTower(t); setSel(mode === "dev" ? 6 : null); }}>{tx(lang, "מגדל", "Tower")} {t}</button>)}</div>
        <span className="c2-cap">{mode === "dev" ? tx(lang, "מפת מלאי", "Inventory map") : tx(lang, "רחפו על קומה", "Hover a floor")}</span>
      </div>
      <aside className="c2-panel c2-glass" aria-live="polite">
        {sel == null ? (
          <div className="c2-empty"><span className="eyebrow">{tx(lang, "הבניין", "The building")}</span><h3>{tx(lang, "בחרו קומה.", "Choose a floor.")}</h3><p style={{ margin: 0 }}>{tx(lang, "האורות נדלקים בקומה שבחרתם, ואפשר לראות מי פנוי בה.", "The lights come on at the floor you pick, with what is open.")}</p><i /></div>
        ) : (
          <>
            <span className="eyebrow">{tx(lang, "מגדל", "Tower")} {tower}</span>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><h3>{tx(lang, "קומה", "Floor")} {sel}</h3><span className="num" style={{ color: "var(--mute)", fontSize: 13 }}>{units.filter((u) => u.st === "av").length}/{units.length} {tx(lang, "פנויות", "open")}</span></div>
            <ul className="c2-ulist">{units.map((u) => (
              <li key={u.id}><button className="c2-u" style={{ ["--sc" as string]: SC[u.st] }} onClick={() => onEnter(u)} aria-label={u.id}>
                <b className="num">{u.id}</b><small>{u.rooms} {tx(lang, "חדרים", "rooms")} · {u.sqm} {tx(lang, "מ״ר", "sqm")}</small>
                <span className="pr"><span className="num" style={{ fontSize: 14 }}>{money(u.price, lang)}</span><span className="c2-st">{mode === "buyer" && u.st === "av" ? `${u.match}% · ` : ""}{names[u.st]}</span></span>
              </button></li>))}</ul>
            <span style={{ fontSize: 12, color: "var(--mute)" }}>{mode === "dev" ? tx(lang, "לחצו על יחידה לפתיחת התאום הדיגיטלי", "Select a unit to open its digital twin") : tx(lang, "לחצו על יחידה לסיור בתוכה", "Select a unit to step inside")}</span>
          </>
        )}
      </aside>
    </div>
  );
}

/* ---------- tour overlay (the interactive architectural moment) ---------- */
const ROOMS = [{ k: "living", img: IMG.living, he: "סלון", en: "Living" }, { k: "kitchen", img: IMG.kitchen, he: "מטבח", en: "Kitchen" }, { k: "bed", img: IMG.bedroom, he: "חדר שינה", en: "Bedroom" }, { k: "bath", img: IMG.bath, he: "מקלחת", en: "Bath" }, { k: "balcony", img: IMG.balcony, he: "מרפסת", en: "Balcony" }];
export function Tour({ lang, unit, start = 0, onClose }: { lang: Lang; unit: FUnit | null; start?: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (unit) closeRef.current?.focus(); }, [unit]);
  useEffect(() => {
    if (!unit) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowRight") setI((x) => (x + 1) % ROOMS.length); if (e.key === "ArrowLeft") setI((x) => (x + ROOMS.length - 1) % ROOMS.length); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [unit, onClose]);
  return (
    <div className={`c2-tour${unit ? " on" : ""}`} role="dialog" aria-modal="true" aria-label={tx(lang, "סיור בדירה", "Apartment tour")} aria-hidden={!unit}>
      <div className="rm">{ROOMS.map((r, n) => <img key={r.k} src={r.img} alt="" className={n === i ? "on" : ""} />)}</div>
      <div className="shade" />
      <div className="top" dir={lang === "he" ? "rtl" : "ltr"}>
        <span className="eyebrow">{unit ? `${unit.id} · ${unit.rooms} ${tx(lang, "חדרים", "rooms")} · ${unit.sqm} ${tx(lang, "מ״ר", "sqm")}` : ""}</span>
        <button ref={closeRef} className="c2-x" onClick={onClose} aria-label={tx(lang, "סגירה", "Close")}>✕</button>
      </div>
      <div className="bot" dir={lang === "he" ? "rtl" : "ltr"}>
        <div style={{ display: "grid", gap: 18 }}>
          <h3 key={i} className="c2-in" style={{ ["--d" as string]: "0s" }}>{lang === "he" ? ROOMS[i].he : ROOMS[i].en}</h3>
          <div className="c2-rooms">{ROOMS.map((r, n) => <button key={r.k} aria-pressed={n === i} onClick={() => setI(n)}>{lang === "he" ? r.he : r.en}</button>)}</div>
        </div>
        <div className="c2-mini" title={tx(lang, "תכנית", "Plan")}><img src={IMG.axo} alt="" /></div>
      </div>
    </div>
  );
}
