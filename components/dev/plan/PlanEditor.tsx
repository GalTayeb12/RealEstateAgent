"use client";

import { useState } from "react";
import type { PlanTwin } from "@/lib/twin/schema";
import { polygonArea } from "@/lib/twin/schema";
import { renameRoom, setOpeningKind, setOpeningWidth, setRoomType } from "./edits";
import { OPENING_KIND_OPTIONS, OPENING_TEXT, ROOM_TYPE_OPTIONS, TEXT, type Lang } from "./planText";

const cell: React.CSSProperties = { padding: "0.375rem 0.5rem", borderBottom: "1px solid var(--qp-soft)", verticalAlign: "middle" };
const head: React.CSSProperties = { ...cell, fontSize: "0.6875rem", fontWeight: 600, color: "var(--qp-muted)", textAlign: "start", whiteSpace: "nowrap" };
const input: React.CSSProperties = {
  width: "100%", minWidth: "6rem", boxSizing: "border-box", padding: "0.3125rem 0.5rem", borderRadius: "0.375rem",
  border: "1px solid var(--qp-border)", background: "var(--qp-surface)", color: "var(--qp-ink)", fontFamily: "inherit", fontSize: "0.875rem",
};

/** Tables for the MVP corrections: room names and types, opening kinds and widths, the entry door. */
export function PlanEditor({
  twin, lang, onChange, selected, onSelect, flagged,
}: {
  twin: PlanTwin;
  lang: Lang;
  onChange: (t: PlanTwin) => void;
  selected: string | null;
  onSelect: (ref: string | null) => void;
  flagged: Set<string>;
}) {
  const rowStyle = (id: string): React.CSSProperties => ({
    background: id === selected ? "var(--qp-soft)" : flagged.has(id) ? "var(--qp-error-bg)" : undefined,
    cursor: "pointer",
  });
  const select = (id: string) => () => onSelect(id === selected ? null : id);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <section>
        <h4 style={{ margin: "0 0 0.5rem", fontSize: "0.875rem", color: "var(--qp-ink)" }}>{TEXT.rooms[lang]} ({twin.rooms.length})</h4>
        <div style={{ overflowX: "auto" }}>
          <table data-testid="plan-rooms" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr>
                <th style={head}>{TEXT.nameHe[lang]}</th>
                <th style={head}>{TEXT.nameEn[lang]}</th>
                <th style={head}>{TEXT.type[lang]}</th>
                <th style={head}>{TEXT.area[lang]}</th>
              </tr>
            </thead>
            <tbody>
              {twin.rooms.map((r) => (
                <tr key={r.id} style={rowStyle(r.id)} onClick={select(r.id)}>
                  <td style={cell}>
                    <input aria-label={`${TEXT.nameHe[lang]} ${r.id}`} dir="rtl" style={input} value={r.name.he}
                      onClick={(e) => e.stopPropagation()} onFocus={() => onSelect(r.id)}
                      onChange={(e) => onChange(renameRoom(twin, r.id, "he", e.target.value))} />
                  </td>
                  <td style={cell}>
                    <input aria-label={`${TEXT.nameEn[lang]} ${r.id}`} dir="ltr" style={input} value={r.name.en}
                      onClick={(e) => e.stopPropagation()} onFocus={() => onSelect(r.id)}
                      onChange={(e) => onChange(renameRoom(twin, r.id, "en", e.target.value))} />
                  </td>
                  <td style={cell}>
                    <select aria-label={`${TEXT.type[lang]} ${r.id}`} style={input} value={r.type}
                      onClick={(e) => e.stopPropagation()} onFocus={() => onSelect(r.id)}
                      onChange={(e) => onChange(setRoomType(twin, r.id, e.target.value as typeof r.type))}>
                      {ROOM_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label[lang]}</option>)}
                    </select>
                  </td>
                  <td style={{ ...cell, whiteSpace: "nowrap", color: "var(--qp-muted)" }}>
                    {polygonArea(r.polygon).toFixed(1)} {TEXT.sqm[lang]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h4 style={{ margin: "0 0 0.5rem", fontSize: "0.875rem", color: "var(--qp-ink)" }}>{TEXT.openings[lang]} ({twin.openings.length})</h4>
        <div style={{ overflowX: "auto" }}>
          <table data-testid="plan-openings" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr>
                <th style={head}>#</th>
                <th style={head}>{TEXT.kind[lang]}</th>
                <th style={head}>{TEXT.width[lang]}</th>
                <th style={head}>{TEXT.entry[lang]}</th>
              </tr>
            </thead>
            <tbody>
              {twin.openings.map((o) => (
                <tr key={o.id} style={rowStyle(o.id)} onClick={select(o.id)}>
                  <td style={{ ...cell, color: "var(--qp-muted)", fontFamily: "ui-monospace, monospace", fontSize: "0.75rem" }} dir="ltr">{o.id}</td>
                  <td style={cell}>
                    <select aria-label={`${TEXT.kind[lang]} ${o.id}`} style={input} value={o.kind}
                      onClick={(e) => e.stopPropagation()} onFocus={() => onSelect(o.id)}
                      onChange={(e) => onChange(setOpeningKind(twin, o.id, e.target.value as typeof o.kind))}>
                      {OPENING_KIND_OPTIONS.map((k) => <option key={k.value} value={k.value}>{k.label[lang]}</option>)}
                    </select>
                  </td>
                  <td style={cell}>
                    <WidthInput label={`${TEXT.width[lang]} ${o.id}`} cm={Math.round(o.width * 100)} style={{ ...input, minWidth: "4.5rem" }}
                      onFocus={() => onSelect(o.id)}
                      onCommit={(cm) => onChange(setOpeningWidth(twin, o.id, cm / 100))} />
                  </td>
                  <td style={{ ...cell, textAlign: "center" }}>
                    <input type="radio" name="plan-entry" aria-label={`${TEXT.markEntry[lang]} ${o.id}`} title={TEXT.markEntry[lang]}
                      checked={o.kind === "entry"} disabled={o.kind === "window"}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => onChange(setOpeningKind(twin, o.id, "entry"))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.75rem", color: "var(--qp-muted)" }}>
          {OPENING_TEXT.entry[lang]}: {twin.openings.find((o) => o.kind === "entry")?.id ?? "—"}
        </p>
      </section>
    </div>
  );
}

/** Width in cm; applied on every valid keystroke, while an empty or invalid field is left alone until blur. */
function WidthInput({ label, cm, style, onFocus, onCommit }: {
  label: string; cm: number; style: React.CSSProperties; onFocus: () => void; onCommit: (cm: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input aria-label={label} type="number" min={30} max={600} step={5} style={style}
      value={text ?? String(cm)}
      onClick={(e) => e.stopPropagation()} onFocus={onFocus}
      onChange={(e) => {
        setText(e.target.value);
        const v = Number(e.target.value);
        if (e.target.value !== "" && v > 0) onCommit(v);
      }}
      onBlur={() => setText(null)} />
  );
}
