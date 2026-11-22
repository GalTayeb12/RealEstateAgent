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

interface UnitTypeLite { id: string; price: number; quantityTotal: number; quantityAvailable: number }
export interface OverviewProject { id: string; name: string; unitTypes: UnitTypeLite[]; buildings?: InventoryBuilding[] }

const COLORS = { available: "#5FB3BE", reserved: "#C9A46A", sold: "#7A8087" } as const;
type St = keyof typeof COLORS;
const norm = (s: string): St => (s === "reserved" || s === "sold" ? s : "available");

export default function DevOverview({ projects, openOffers, pendingGroups }: { projects: OverviewProject[]; openOffers: number; pendingGroups: number }) {
  const { locale, m } = useI18n();
  const he = locale === "he";
  const mapProjects = projects.filter((p) => (p.buildings ?? []).some((b) => b.units.length > 0));
  const [sel, setSel] = useState(0);
  const proj = mapProjects[Math.min(sel, Math.max(0, mapProjects.length - 1))];

  // KPIs: per-apartment statuses when buildings exist, otherwise unit-type quantities.
  const counts = { available: 0, reserved: 0, sold: 0 };
  let value = 0;
  for (const p of projects) {
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
    [new Intl.NumberFormat(he ? "he-IL" : "en-US", { style: "currency", currency: "ILS", notation: "compact", maximumFractionDigits: 1 }).format(value), he ? "שווי פנוי" : "Available value"],
    [String(openOffers), he ? "הצעות פתוחות" : "Open offers"],
    [String(pendingGroups), he ? "בקשות קבוצה" : "Group requests"],
  ];

  return (
    <section className="dov" aria-label={he ? "סקירת מלאי" : "Inventory overview"}>
      <div className="dov-kpis">
        {kpis.map(([v, l]) => <div key={l} className="dov-kpi"><b className="num">{v}</b><small>{l}</small></div>)}
      </div>

      {proj && (
        <div className="dov-map">
          <div className="dov-maphead">
            <h3>{he ? "מפת מלאי" : "Inventory map"}</h3>
            {mapProjects.length > 1 && (
              <div className="dov-tabs" role="group" aria-label={he ? "בחירת פרויקט" : "Choose a project"}>
                {mapProjects.map((p, i) => <button key={p.id} type="button" aria-pressed={i === sel} onClick={() => setSel(i)}>{p.name}</button>)}
              </div>
            )}
            <div className="dov-legend">{(Object.keys(COLORS) as St[]).map((s) => <span key={s}><i style={{ background: COLORS[s] }} />{names[s]}</span>)}</div>
          </div>
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
      )}
    </section>
  );
}
