"use client";

/**
 * Developer tool: place apartment types in the building. A grid of floors
 * (top floor first) by positions on the floor; drag over cells to select them,
 * then pick a type (or clear). Saved apartments are real Units: the buyer's
 * "choose a floor" screen lists exactly these.
 */
import { useMemo, useState } from "react";
import { cellsBetween, type CellEdit } from "@/lib/placement";
import type { StageBuilding } from "@/lib/stage";

export interface GridUnit { id: string; buildingId: string; floor: number; positionIndex: number; unitTypeId: string; status: string }
export interface GridType { id: string; unitLabel: string }

type Lang = "he" | "en";
const T = {
  title: { he: "שיבוץ דירות בבניין", en: "Place apartments in the building" },
  intro: {
    he: "סמנו תאים בגרירה (קומה × מיקום בקומה), ובחרו סוג דירה. כל תא הוא דירה אחת. אפשר לסמן קומה שלמה בלחיצה על מספר הקומה.",
    en: "Drag over cells (floor × position on the floor) and pick an apartment type. Each cell is one apartment. Click a floor number to select the whole floor.",
  },
  selected: { he: "תאים מסומנים", en: "cells selected" },
  clear: { he: "ניקוי תאים", en: "Clear cells" },
  deselect: { he: "ביטול סימון", en: "Deselect" },
  apply: { he: "שיבוץ", en: "Place" },
  empty: { he: "ריק", en: "empty" },
  floor: { he: "קומה", en: "Floor" },
  saving: { he: "שומר…", en: "Saving…" },
  noTypes: { he: "אין עדיין סוגי דירות בפרויקט. הוסיפו סוג דירה בדף הפרויקט.", en: "This project has no apartment types yet. Add one on the project page." },
  locked: { he: "דירה שנשמרה או נמכרה לא משתנה", en: "Reserved or sold apartments are not changed" },
  count: { he: "דירות בבניין", en: "apartments in the building" },
  outside: { he: "דירות מחוץ לגודל הבניין (נשארו מגודל קודם)", en: "apartments outside the building size (left from an earlier size)" },
  removeOutside: { he: "הסרת הדירות שמחוץ לבניין", en: "Remove apartments outside the building" },
  onlyAvailable: { he: "רק דירות פנויות יוסרו", en: "Only available apartments are removed" },
  blocked: { he: "דירות שלא שונו כי הן כבר שמורות או נמכרו", en: "apartments left unchanged because they are reserved or sold" },
} satisfies Record<string, Record<Lang, string>>;

const PALETTE = ["#0f766e", "#c2410c", "#7c3aed", "#b45309", "#1d4ed8", "#be123c"];
const key = (f: number, p: number) => `${f}:${p}`;

export function PlacementGrid({
  lang, building, units, types, busy, onApply,
}: {
  lang: Lang;
  building: StageBuilding;
  units: GridUnit[];
  types: GridType[];
  busy: boolean;
  onApply: (cells: CellEdit[]) => Promise<{ blocked: number } | void>;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<{ floor: number; positionIndex: number } | null>(null);
  const [blockedMsg, setBlockedMsg] = useState(0);
  const mine = useMemo(() => units.filter((u) => u.buildingId === building.id), [units, building.id]);
  const outsideUnits = useMemo(() => mine.filter((u) => u.floor > building.floorCount || u.positionIndex >= building.unitsPerFloor), [mine, building.floorCount, building.unitsPerFloor]);
  const at = useMemo(() => new Map(mine.map((u) => [key(u.floor, u.positionIndex), u])), [mine]);
  const colorOf = (id: string) => PALETTE[Math.max(types.findIndex((t) => t.id === id), 0) % PALETTE.length];
  const floors = Array.from({ length: building.floorCount }, (_, i) => building.floorCount - i);
  const cols = Array.from({ length: building.unitsPerFloor }, (_, i) => i);

  const selectRange = (to: { floor: number; positionIndex: number }) => {
    if (!anchor) return;
    setPicked(new Set(cellsBetween(anchor, to).map((c) => key(c.floor, c.positionIndex))));
  };
  const edits = (typeId: string | null): CellEdit[] =>
    [...picked].map((k) => { const [f, p] = k.split(":").map(Number); return { floor: f, positionIndex: p, unitTypeId: typeId }; });
  const apply = async (typeId: string | null) => {
    const r = await onApply(edits(typeId));
    setBlockedMsg(r ? r.blocked : 0);
    setPicked(new Set());
  };
  const btn: React.CSSProperties = { padding: "0.45rem 0.9rem", borderRadius: "0.4rem", fontSize: "0.8125rem", fontWeight: 600, border: "1px solid var(--qp-border)", background: "var(--qp-surface)", color: "var(--qp-ink)", cursor: "pointer" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
      <h2 style={{ margin: 0, fontSize: "1.125rem", color: "var(--qp-ink)" }}>{T.title[lang]}</h2>
      <p style={{ margin: 0, color: "var(--qp-muted)", fontSize: "0.875rem" }}>{T.intro[lang]}</p>
      {types.length === 0 ? <p style={{ margin: 0, color: "var(--qp-warning)" }}>{T.noTypes[lang]}</p> : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            {types.map((t) => (
              <button key={t.id} type="button" disabled={busy || picked.size === 0} onClick={() => apply(t.id)}
                style={{ ...btn, background: colorOf(t.id), color: "#fff", border: "none", opacity: busy || picked.size === 0 ? 0.45 : 1 }}>
                {T.apply[lang]}: {t.unitLabel}
              </button>
            ))}
            <button type="button" disabled={busy || picked.size === 0} onClick={() => apply(null)} style={{ ...btn, opacity: busy || picked.size === 0 ? 0.45 : 1 }}>{T.clear[lang]}</button>
            {picked.size > 0 && <button type="button" onClick={() => setPicked(new Set())} style={btn}>{T.deselect[lang]}</button>}
            <span style={{ marginInlineStart: "auto", fontSize: "0.8125rem", color: "var(--qp-muted)" }}>
              {busy ? T.saving[lang] : picked.size > 0 ? `${picked.size} ${T.selected[lang]}` : `${mine.length} ${T.count[lang]}`}
            </span>
          </div>
          {outsideUnits.length > 0 && (
            <div role="alert" style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center", padding: "0.6rem 0.8rem", borderRadius: "0.5rem", background: "var(--qp-warning-bg)", color: "var(--qp-warning)", fontSize: "0.8125rem" }}>
              <span>{outsideUnits.length} {T.outside[lang]}</span>
              <button type="button" disabled={busy} title={T.onlyAvailable[lang]} onClick={async () => { const r = await onApply(outsideUnits.map((u) => ({ floor: u.floor, positionIndex: u.positionIndex, unitTypeId: null }))); setBlockedMsg(r ? r.blocked : 0); }} style={btn}>{T.removeOutside[lang]}</button>
            </div>
          )}
          {blockedMsg > 0 && <div role="status" style={{ fontSize: "0.8125rem", color: "var(--qp-warning)" }}>{blockedMsg} {T.blocked[lang]}</div>}

          <div
            style={{ overflow: "auto", maxHeight: "60vh", border: "1px solid var(--qp-border)", borderRadius: "0.5rem", padding: "0.5rem", userSelect: "none", touchAction: "none" }}
            onPointerUp={() => setAnchor(null)} onPointerLeave={() => setAnchor(null)}
          >
            <div style={{ display: "grid", gridTemplateColumns: `3.25rem repeat(${building.unitsPerFloor}, minmax(3rem, 5rem))`, gap: 4 }}>
              {floors.map((f) => (
                <FloorRow key={f}>
                  <button type="button" title={`${T.floor[lang]} ${f}`} onClick={() => setPicked(new Set(cols.map((c) => key(f, c))))}
                    style={{ ...btn, padding: "0.25rem", fontSize: "0.75rem", fontWeight: 700 }}>{f}</button>
                  {cols.map((c) => {
                    const u = at.get(key(f, c));
                    const sel = picked.has(key(f, c));
                    return (
                      <div
                        key={c}
                        onPointerDown={(e) => { e.preventDefault(); setAnchor({ floor: f, positionIndex: c }); setPicked(new Set([key(f, c)])); }}
                        onPointerEnter={() => selectRange({ floor: f, positionIndex: c })}
                        title={u && u.status !== "available" ? T.locked[lang] : undefined}
                        style={{
                          height: 30, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, cursor: "pointer",
                          background: u ? colorOf(u.unitTypeId) : "transparent", color: u ? "#fff" : "var(--qp-muted)",
                          border: sel ? "2px solid #facc15" : u ? "1px solid transparent" : "1px dashed var(--qp-border)",
                          opacity: u && u.status !== "available" ? 0.6 : 1,
                        }}
                      >
                        {u ? (types.find((t) => t.id === u.unitTypeId)?.unitLabel.match(/\d+/)?.[0] ?? "•") + (u.status !== "available" ? "🔒" : "") : ""}
                      </div>
                    );
                  })}
                </FloorRow>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", fontSize: "0.75rem", color: "var(--qp-muted)" }}>
            {types.map((t) => <span key={t.id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: colorOf(t.id), display: "inline-block" }} />{t.unitLabel}</span>)}
            <span>{T.empty[lang]}: ┄</span>
          </div>
        </>
      )}
    </div>
  );
}

/** A grid row without wrapper elements (display: contents keeps the columns aligned). */
function FloorRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "contents" }}>{children}</div>;
}
