"use client";
/**
 * /results hero — Concept C V3 results design on real match data.
 * Full-bleed photographic stage: big match score, the selected listing, why it matches, and a rail of
 * the other matches. Listings carry no photos, so the backdrop is an illustrative render picked
 * deterministically per listing (labelled as such). Offers, group buying and details live in the
 * per-project cards below the hero (anchor targets `#match-<key>`), so no transactional behaviour is here.
 */
import { useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import "./results-hero.css";
import { Money } from "@/components/Money";
import { useI18n } from "@/components/LocaleProvider";
import { illustrativeImage } from "@/lib/illustrative";
import type { FitComponent, FitId } from "@/lib/fitScore";
import { parseAttributes, formatAttributeValue, translateAttrKey, formatArea } from "@/lib/attributes";

export interface HeroItem {
  key: string;
  aomId: string;
  name: string;
  address?: string;
  unitLabel?: string;
  /** Zij negotiation score (kept, shown under "Negotiation range") */
  zij: number;
  /** Fit to the buyer's stated needs, 0-100 (lib/fitScore.ts); the headline score */
  fit: number;
  fitParts: FitComponent[];
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
const FIT_LABEL: Record<FitId, [string, string]> = {
  location: ["מיקום", "Location"], budget: ["תקציב", "Budget"], rooms: ["חדרים", "Rooms"], musts: ["חייב שיהיה", "Must-haves"], agree: ["סיכוי להסכמה", "Room to agree"],
};
const MUST_LABEL: Record<string, [string, string]> = { balcony: ["מרפסת", "balcony"], parking: ["חניה", "parking"], highFloor: ["קומה גבוהה", "high floor"] };
const two = (n: number) => String(n).padStart(2, "0");

export default function ResultsHero({ items, ej, aj, summary, kicker, title, renderOffer, onGroup, renderRange }: {
  items: HeroItem[]; ej: number; aj: number; summary: string; kicker: string; title: string;
  /** "Reserve at listed price" / offer control for the selected match (button + its expanding panel) */
  renderOffer?: (key: string) => ReactNode;
  /** Opens the group-discount flow for the selected match */
  onGroup?: (key: string) => void;
  /** Detailed negotiation-range chart for the selected match */
  renderRange?: (key: string) => ReactNode;
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
  const idx2 = he ? 0 : 1;
  const fitBars: [string, number][] = cur.fitParts.map((c) => [FIT_LABEL[c.id][idx2], c.score]);
  const why: string[] = [];
  for (const c of cur.fitParts) {
    if (c.id === "location") why.push(c.note === "ok" ? (m.resultsHero.locationMatchesTheAreaYou) : (m.resultsHero.outsideTheAreaYouAsked));
    if (c.id === "budget") why.push(c.note === "ok" ? (m.resultsHero.priceIsWithinYourBudget) : (m.resultsHero.priceIsAboveYourBudget));
    if (c.id === "rooms") why.push(c.note === "ok" ? (m.resultsHero.roomCountFits) : (m.resultsHero.fewerRoomsThanYouAsked));
    if (c.id === "musts" && c.musts) {
      const nm = (k: string) => MUST_LABEL[k]?.[idx2] ?? k;
      if (c.musts.met.length) why.push((m.resultsHero.has) + c.musts.met.map(nm).join(", "));
      if (c.musts.unknown.length) why.push((m.resultsHero.notListed) + c.musts.unknown.map(nm).join(", "));
      if (c.musts.unmet.length) why.push((m.resultsHero.missing) + c.musts.unmet.map(nm).join(", "));
    }
  }
  const bars: [string, number][] = [
    [m.resultsHero.yourIdeal, ej],
    [m.resultsHero.yourMinimum, aj],
    [m.resultsHero.sellerAsks, cur.ail],
    [m.resultsHero.sellerAccepts, cur.eil],
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
          <h1>{m.resultsHero.theHomeThatFeelsLike}</h1>
          <p className="rh-count">{summary}</p>
        </div>
        <span className="rh-ctr" aria-hidden="true"><b>{two(idx + 1)}</b> / {two(items.length)}</span>
      </div>

      <div className="rh-main">
        <div key={cur.key} className="rh-cur">
          <div className="rh-score" aria-label={`${m.resultsHero.fitToYourNeeds}: ${cur.fit}`}>{cur.fit}<small>%</small></div>
          <span className="rh-kick sub" title={m.resultsHero.howWellTheListingMeets}>{m.resultsHero.fitToYourNeeds}{cur.unitLabel ? ` · ${cur.unitLabel}` : ""}</span>
          <h2>{cur.name}</h2>
          {cur.address && <p className="rh-addr">{cur.address}</p>}
          <div className="rh-facts">
            {cur.price > 0 && <div><b className="num">{cur.priceFrom ? `${m.results.from} ` : ""}<Money amount={cur.price} /></b><span>{m.resultsHero.price}</span></div>}
            {facts.map((f) => <div key={f.label}><b>{f.text}</b><span>{f.label}</span></div>)}
          </div>
          <div className="rh-act">
            {renderOffer?.(cur.key)}
            <Link href={`/aom/${cur.aomId}`}>{m.results.viewDetails} →</Link>
            {onGroup && <button type="button" className="rh-ghost" onClick={() => onGroup(cur.key)}>{m.results.groupDiscount}</button>}
          </div>
        </div>
        <aside className="rh-side" aria-live="polite">
          <span className="rh-kick">{m.resultsHero.whyItMatches}</span>
          <div className="rh-bars">
            {fitBars.map(([n, v]) => <div className="rh-bar" key={n}><span>{n}</span><span><i style={{ ["--w" as string]: pct(v) }} /></span><b>{Math.round(v)}</b></div>)}
          </div>
          <ul className="rh-why">
            {why.map((w) => <li key={w}>{w}</li>)}
          </ul>
          {renderRange && (
            <details className="rh-range">
              <summary>{m.resultsHero.negotiationRange}</summary>
              <p className="rh-zij">{m.resultsHero.zijNote(Math.round(cur.zij))}</p>
              <div className="rh-bars">
                {bars.map(([n, v]) => <div className="rh-bar" key={n}><span>{n}</span><span><i style={{ ["--w" as string]: pct(v) }} /></span><b>{Math.round(v)}</b></div>)}
              </div>
              <p className="rh-zij">{m.resultsHero.overlapNote(overlap)}</p>
              {renderRange(cur.key)}
            </details>
          )}
        </aside>
      </div>

      {items.length > 1 && (
        <div className="rh-rail" role="group" aria-label={m.resultsHero.chooseAProject}>
          {items.map((it, i) => (
            <button key={it.key} type="button" className="rh-card" aria-pressed={i === idx} onClick={() => setSel(i)}>
              <Image src={pickImage(it.key)} alt="" width={192} height={168} sizes="96px" />
              <span><b>{it.name}</b><em>{it.fit}%</em>{it.price > 0 && <small className="num"><Money amount={it.price} /></small>}</span>
            </button>
          ))}
        </div>
      )}
      <p className="rh-note">{m.resultsHero.imagesAreIllustrativeRenderings}</p>
    </section>
  );
}
