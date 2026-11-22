"use client";
/**
 * Developer overview (Concept C V2 developer design) computed from the developer's real data:
 * a KPI strip and a floor-by-floor inventory map with one status dot per apartment.
 * Read-only; editing stays in the inventory tables below.
 */
import { useState } from "react";
import "./dev-overview.css";
import { useI18n } from "@/components/LocaleProvider";
import type { InventoryBuilding } from "@/components/DevInventory";
import { ilsToUsd } from "@/lib/i18n/currency";

interface UnitTypeLite { id: string; unitLabel?: string; price: number; quantityTotal: number; quantityAvailable: number }
export interface OverviewProject { id: string; name: string; unitTypes: UnitTypeLite[]; buildings?: InventoryBuilding[] }

const COLORS = { available: "#5FB3BE", reserved: "#C9A46A", sold: "#7A8087" } as const;
type St = keyof typeof COLORS;
const norm = (s: string): St => (s === "reserved" || s === "sold" ? s : "available");

/** One entry per open offer / group request, keyed by project name so the KPIs can follow the project filter. */
export default function DevOverview({ projects, offerProjects, groupProjects }: { projects: OverviewProject[]; offerProjects: string[]; groupProjects: string[] }) {
  const { locale, m } = useI18n();
  const he = locale === "he";
  // Main filter: "all projects together" (default) or one project. It drives the KPIs and the map.
  // Projects with a 3D building show the floor map, the rest show one row per apartment type.
  const [sel, setSel] = useState<string>("all");
  const scope = sel === "all" ? projects : projects.filter((p) => p.id === sel);
  // The map shows one project at a time; under "all" small buttons below it switch which one.
  const [mapId, setMapId] = useState<string>("");
  const mapProj = sel === "all" ? (scope.find((p) => p.id === mapId) ?? scope[0]) : scope[0];
  const scopeNames = new Set(scope.map((p) => p.name));
  const openOffers = offerProjects.filter((n) => scopeNames.has(n)).length;
  const pendingGroups = groupProjects.filter((n) => scopeNames.has(n)).length;

  // KPIs: per-apartment statuses when buildings exist, otherwise unit-type quantities.
  const counts = { available: 0, reserved: 0, sold: 0 };
  let value = 0;
  for (const p of scope) {
    const units = (p.buildings ?? []).flatMap((b) => b.units);
    if (units.length > 0) {
      const typePrice = new Map(p.unitTypes.map((t) => [t.id, t.price]));
      for (const u of units) {
        const st = norm(u.status);
        counts[st]++;
        if (st === "available") value += u.price ?? typePrice.get(u.unitTypeId) ?? 0;
      }
    } else {
      for (const t of p.unitTypes) {
        counts.available += t.quantityAvailable;
        counts.sold += Math.max(0, t.quantityTotal - t.quantityAvailable);
        value += t.price * t.quantityAvailable;
      }
    }
  }
  const total = counts.available + counts.reserved + counts.sold;
  const taken = total ? Math.round(((counts.reserved + counts.sold) / total) * 100) : 0;
  const names: Record<St, string> = { available: m.dev.statusAvailable, reserved: m.dev.statusReserved, sold: m.dev.statusSold };
  const kpis: [string, string][] = [
    [String(total), he ? "דירות במלאי" : "Apartments"],
    [`${taken}%`, he ? "נמכרו / שמורות" : "Sold / reserved"],
    [new Intl.NumberFormat(he ? "he-IL" : "en-US", { style: "currency", currency: he ? "ILS" : "USD", notation: "compact", maximumFractionDigits: 1 }).format(he ? value : ilsToUsd(value)), he ? "שווי פנוי" : "Available value"],
    [String(openOffers), he ? "הצעות פתוחות" : "Open offers"],
    [String(pendingGroups), he ? "בקשות קבוצה" : "Group requests"],
  ];

  return (
    <section className="dov" aria-label={he ? "סקירת מלאי" : "Inventory overview"}>
      {projects.length > 1 && (
        <div className="dov-tabs dov-filter" role="group" aria-label={he ? "סינון לפי פרויקט" : "Filter by project"}>
          <button type="button" aria-pressed={sel === "all"} onClick={() => setSel("all")}>{he ? "כל הפרויקטים" : "All projects"}</button>
          {projects.map((p) => <button key={p.id} type="button" aria-pressed={sel === p.id} onClick={() => setSel(p.id)}>{p.name}</button>)}
        </div>
      )}
      <div className="dov-kpis">
        {kpis.map(([v, l]) => <div key={l} className="dov-kpi"><b className="num">{v}</b><small>{l}</small></div>)}
      </div>

      {mapProj && (
        <div className="dov-map">
          <div className="dov-maphead">
            <h3>{he ? "מפת מלאי" : "Inventory map"}</h3>
            <div className="dov-legend">{(Object.keys(COLORS) as St[]).map((s) => <span key={s}><i style={{ background: COLORS[s] }} />{names[s]}</span>)}</div>
          </div>
          {[mapProj].filter(Boolean).map((proj) => (
            <div key={proj.id}>
          {!(proj.buildings ?? []).some((b) => b.units.length > 0) && (
            <div className="dov-bld">
              <div className="dov-bname">{proj.name}</div>
              <div className="dov-floors" dir="ltr">
                {proj.unitTypes.map((t) => {
                  const sold = Math.max(0, t.quantityTotal - t.quantityAvailable);
                  const dots: St[] = [...Array(t.quantityAvailable).fill("available"), ...Array(sold).fill("sold")];
                  return (
                    <div className="dov-floor dov-typerow" key={t.id}>
                      <span className="dov-fl">{t.unitLabel ?? ""}</span>
                      <div className="dov-units">
                        {dots.map((st, i) => <i key={i} className="dov-dot" style={{ background: COLORS[st], boxShadow: `0 0 10px ${COLORS[st]}66` }} title={names[st]} aria-label={names[st]} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="dov-note">{he ? "לפרויקט אין מודל בניין, לכן המפה מציגה כמויות לפי סוג דירה ולא לפי קומה." : "This project has no building model, so the map shows quantities per apartment type, not per floor."}</p>
            </div>
          )}
          {(proj.buildings ?? []).filter((b) => b.units.length > 0).map((b) => {
            const floors = Array.from(new Set(b.units.map((u) => u.floor))).sort((x, y) => y - x);
            return (
              <div key={b.id} className="dov-bld">
                <div className="dov-bname">{b.name}</div>
                <div className="dov-floors" dir="ltr">
                  {floors.map((f) => (
                    <div className="dov-floor" key={f}>
                      <span className="dov-fl num">{f}</span>
                      <div className="dov-units">
                        {b.units.filter((u) => u.floor === f).sort((a, c) => a.positionIndex - c.positionIndex).map((u) => {
                          const st = norm(u.status);
                          return <i key={u.id} className="dov-dot" style={{ background: COLORS[st], boxShadow: `0 0 10px ${COLORS[st]}66` }} title={`${u.unitNumber} · ${names[st]}`} aria-label={`${u.unitNumber} · ${names[st]}`} />;
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
            </div>
          ))}
          {sel === "all" && scope.length > 1 && (
            <div className="dov-tabs dov-mini" role="group" aria-label={he ? "מעבר בין פרויקטים במפה" : "Switch project on the map"}>
              {scope.map((p) => <button key={p.id} type="button" aria-pressed={p.id === mapProj?.id} onClick={() => setMapId(p.id)}>{p.name}</button>)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
