"use client";
/**
 * /results hero — Concept C V3 results design on real match data.
 * Full-bleed photographic stage: big match score, the selected listing, why it matches, and a rail of
 * the other matches. Listings carry no photos, so the backdrop is an illustrative render picked
 * deterministically per listing (labelled as such). Offers, group buying and details live in the
 * per-project cards below the hero (anchor targets `#match-<key>`), so no transactional behaviour is here.
 */
import { useState, type KeyboardEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import "./results-hero.css";
import { Money } from "@/components/Money";
import { useI18n } from "@/components/LocaleProvider";
import { illustrativeImage } from "@/lib/illustrative";
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

const pickImage = illustrativeImage;
const two = (n: number) => String(n).padStart(2, "0");

export default function ResultsHero({ items, ej, aj, summary, kicker, title }: {
  items: HeroItem[]; ej: number; aj: number; summary: string; kicker: string; title: string;
}) {
  const { locale, m } = useI18n();
  const he = locale === "he";
  const [sel, setSel] = useState(0);
  if (items.length === 0) return null;
  const idx = Math.min(sel, items.length - 1);
  const cur = items[idx];
  const attrs = parseAttributes(cur.attributes);
  const attrKeys = m.attributes as unknown as Record<string, string | undefined>;
  const facts = Object.entries(attrs).slice(0, 3).map(([k, v]) => {
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
  const onKey = (e: KeyboardEvent) => {
    const next = e.key === "ArrowRight" ? (he ? -1 : 1) : e.key === "ArrowLeft" ? (he ? 1 : -1) : 0;
    if (next) setSel((s) => Math.max(0, Math.min(items.length - 1, Math.min(s, items.length - 1) + next)));
  };

  return (
    <section className="rh" aria-label={title} onKeyDown={onKey}>
      <div className="rh-bgs" aria-hidden="true">
        {items.map((it, i) => (
          <Image key={it.key} className={i === idx ? "on" : ""} src={pickImage(it.key)} alt="" fill sizes="100vw" priority={i === 0} />
        ))}
      </div>
      <div className="rh-shade" aria-hidden="true" />

      <div className="rh-hd">
        <div>
          <span className="rh-kick">{kicker}</span>
          <h1>{he ? "הבית שמרגיש כמו שאמרת." : "The home that feels like you said."}</h1>
          <p className="rh-count">{summary}</p>
        </div>
        <span className="rh-ctr" aria-hidden="true"><b>{two(idx + 1)}</b> / {two(items.length)}</span>
      </div>

      <div className="rh-main">
        <div key={cur.key} className="rh-cur">
          <div className="rh-score" aria-label={`${m.results.matchQuality}: ${Math.round(cur.zij)}`}>{Math.round(cur.zij)}<small>/100</small></div>
          <span className="rh-kick sub" title={m.results.matchQualityHint}>{m.results.matchQuality}{cur.unitLabel ? ` · ${cur.unitLabel}` : ""}</span>
          <h2>{cur.name}</h2>
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
          <span className="rh-kick">{he ? "למה זו התאמה" : "Why it matches"}</span>
          <div className="rh-bars">
            {bars.map(([n, v]) => <div className="rh-bar" key={n}><span>{n}</span><span><i style={{ ["--w" as string]: pct(v) }} /></span><b>{Math.round(v)}</b></div>)}
          </div>
          <ul className="rh-why">
            <li>{he ? `טווח ההסכמה שלכם והמוכר חופפים ב-${overlap} נקודות` : `Your range and the seller's overlap by ${overlap} points`}</li>
            <li>{he ? `ציון ההסכמה המוצע: ${Math.round(cur.zij)} מתוך 100` : `Proposed agreement score: ${Math.round(cur.zij)} of 100`}</li>
          </ul>
        </aside>
      </div>

      {items.length > 1 && (
        <div className="rh-rail" role="group" aria-label={he ? "בחירת פרויקט" : "Choose a project"}>
          {items.map((it, i) => (
            <button key={it.key} type="button" className="rh-card" aria-pressed={i === idx} onClick={() => setSel(i)}>
              <Image src={pickImage(it.key)} alt="" width={192} height={168} sizes="96px" />
              <span><b>{it.name}</b><em>{Math.round(it.zij)}</em>{it.price > 0 && <small className="num"><Money amount={it.price} /></small>}</span>
            </button>
          ))}
        </div>
      )}
      <p className="rh-note">{he ? "התמונות להמחשה בלבד · הדמיות" : "Images are illustrative renderings"}</p>
    </section>
  );
}
