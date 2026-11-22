"use client";
/**
 * Hero for /results (Concept C V2 results design), driven entirely by the real match data.
 * Shows the selected project's match score, price, key facts and what drives the match;
 * a rail below switches between projects. Offers, group buying and details stay in the
 * per-project cards on the page (anchor targets `#match-<key>`), so no transactional
 * behaviour lives here.
 */
import { useState } from "react";
import Link from "next/link";
import "./results-hero.css";
import { Money } from "@/components/Money";
import { useI18n } from "@/components/LocaleProvider";
import { parseAttributes, formatAttributeValue, translateAttrKey, formatArea } from "@/lib/attributes";

export interface HeroItem {
  key: string;
  aomId: string;
  name: string;
  unitLabel?: string;
  zij: number;
  price: number;
  priceFrom?: boolean;
  attributes?: Record<string, unknown>;
  /** ranges on the 0-100 scale: seller (eil-ail), overlap (lowerBound-upperBound) */
  eil: number;
  ail: number;
  lowerBound: number;
  upperBound: number;
}

export default function ResultsHero({ items, ej, aj, summary, kicker, title }: {
  items: HeroItem[]; ej: number; aj: number; summary: string; kicker: string; title: string;
}) {
  const { locale, m } = useI18n();
  const he = locale === "he";
  const [sel, setSel] = useState(0);
  if (items.length === 0) return null;
  const cur = items[Math.min(sel, items.length - 1)];
  const attrs = parseAttributes(cur.attributes);
  const attrKeys = m.attributes as unknown as Record<string, string | undefined>;
  const facts = Object.entries(attrs).slice(0, 4).map(([k, v]) => {
    const text = k === "area" ? formatArea(v, m.attributes.sqmUnit) : formatAttributeValue(v);
    return { label: translateAttrKey(k, attrKeys), text };
  }).filter((f) => f.text && f.text !== m.attributes.unknown);
  const pct = (v: number) => `${Math.max(0, Math.min(100, Math.round(v)))}%`;
  const bars: [string, number][] = [
    [he ? "הציון שלך" : "Your ideal", ej],
    [he ? "המינימום שלך" : "Your minimum", aj],
    [he ? "המוכר מבקש" : "Seller asks", cur.ail],
    [he ? "המוכר מקבל" : "Seller accepts", cur.eil],
  ];
  const overlap = Math.max(0, Math.round(cur.upperBound - cur.lowerBound));
  return (
    <section className="rh" aria-label={title}>
      <div className="rh-in">
        <div>
          <div className="rh-kick">{kicker}</div>
          <p className="rh-count">{summary}</p>
          <div className="rh-score" aria-label={`${m.results.matchQuality}: ${Math.round(cur.zij)}`}>{Math.round(cur.zij)}<small>/100</small></div>
          <div className="rh-label" title={m.results.matchQualityHint}>{m.results.matchQuality}</div>
          <h2>{cur.name}</h2>
          {cur.unitLabel && <span className="rh-unit">{cur.unitLabel}</span>}
          <div className="rh-facts">
            {cur.price > 0 && <div><b className="num">{cur.priceFrom ? `${m.results.from} ` : ""}<Money amount={cur.price} /></b><span>{he ? "מחיר" : "Price"}</span></div>}
            {facts.map((f) => <div key={f.label}><b>{f.text}</b><span>{f.label}</span></div>)}
          </div>
          <div className="rh-act">
            <a className="primary" href={`#match-${cur.key}`}>{he ? "הצעה ופרטים" : "Offer & details"}</a>
            <Link href={`/aom/${cur.aomId}`}>{m.results.viewDetails} →</Link>
          </div>
        </div>
        <aside className="rh-side" aria-live="polite">
          <h3>{he ? "איך נבנה הציון" : "How this score is built"}</h3>
          <ul className="rh-why">
            <li>{he ? `טווח ההסכמה שלכם והמוכר חופפים ב-${overlap} נקודות` : `Your range and the seller's overlap by ${overlap} points`}</li>
            <li>{he ? `ציון ההסכמה המוצע: ${Math.round(cur.zij)} מתוך 100` : `Proposed agreement score: ${Math.round(cur.zij)} of 100`}</li>
          </ul>
          <div className="rh-bars">
            {bars.map(([n, v]) => <div className="rh-bar" key={n}><span>{n}</span><span><i style={{ ["--w" as string]: pct(v) }} /></span><b>{Math.round(v)}</b></div>)}
          </div>
        </aside>
      </div>
      {items.length > 1 && (
        <div className="rh-rail" role="group" aria-label={he ? "בחירת פרויקט" : "Choose a project"}>
          {items.map((it, i) => (
            <button key={it.key} type="button" className="rh-card" aria-pressed={i === sel} onClick={() => setSel(i)}>
              <b>{it.name}</b><small>{it.unitLabel ?? ""}</small><em>{Math.round(it.zij)}</em>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
