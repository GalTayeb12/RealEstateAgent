"use client";

import { useEffect, useRef, useState } from "react";
import { type Opening, type PlanTwin, type Wall, wallLength } from "@/lib/twin/schema";
import { PlanCanvas, type Tool } from "./PlanCanvas";
import { editFrame, unionFrame } from "./canvasGeom";
import { removeOpening, removeWall, setOpeningKind, setOpeningWidth, setWallKind, setWallThickness, splitWall, moveOpening } from "./edits";
import { EDITOR_TEXT, OPENING_KIND_OPTIONS, TEXT, WALL_KIND_TEXT, type Lang } from "./planText";

const chip = (active: boolean, disabled = false): React.CSSProperties => ({
  borderRadius: 999, padding: "0.3125rem 0.75rem", fontSize: "0.8125rem", fontFamily: "inherit", fontWeight: active ? 600 : 500,
  border: `1px solid ${active ? "var(--qp-primary)" : "var(--qp-border)"}`,
  background: active ? "var(--qp-primary)" : "var(--qp-surface)", color: active ? "var(--qp-on-primary)" : "var(--qp-ink)",
  cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
});
const field: React.CSSProperties = {
  width: "5.5rem", boxSizing: "border-box", padding: "0.3125rem 0.5rem", borderRadius: "0.375rem",
  border: "1px solid var(--qp-border)", background: "var(--qp-surface)", color: "var(--qp-ink)", fontFamily: "inherit", fontSize: "0.875rem",
};
const label: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 2, fontSize: "0.6875rem", color: "var(--qp-muted)", fontWeight: 600 };

const WALL_TOOLS: Wall["kind"][] = ["interior", "exterior", "glazing", "railing"];
const OPENING_TOOLS: Opening["kind"][] = ["door", "window", "slider", "opening"];

/**
 * Draw and fix walls on the plan: toolbar, interactive canvas and a properties panel for the
 * selected wall or opening. All edits are twin → twin functions (./edits); history lives in the parent.
 */
export function PlanWallEditor({
  twin, lang, highlight, selected, onSelect, onPreview, onCommit, onUndo, onRedo, canUndo, canRedo,
}: {
  twin: PlanTwin; lang: Lang; highlight: string[];
  selected: string | null; onSelect: (id: string | null) => void;
  onPreview: (t: PlanTwin) => void; onCommit: (next: PlanTwin, base: PlanTwin) => void;
  onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean;
}) {
  const [tool, setTool] = useState<Tool>({ mode: "select" });
  const root = useRef<HTMLDivElement>(null);
  // fixed for this editor session, grown only when a wall is drawn outside it
  const [baseFrame] = useState(() => editFrame(twin, 2.5));
  const frame = unionFrame(baseFrame, editFrame(twin, 0.5));
  const wall = selected ? twin.walls.find((w) => w.id === selected) : undefined;
  const opening = selected ? twin.openings.find((o) => o.id === selected) : undefined;
  const commit = (next: PlanTwin) => { if (next !== twin) onCommit(next, twin); };

  function remove() {
    if (wall) commit(removeWall(twin, wall.id));
    else if (opening) commit(removeOpening(twin, opening.id));
    onSelect(null);
  }

  // Delete / Ctrl+Z / Ctrl+Y while the editor (not a text field) has focus
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if ((e.key === "Delete" || e.key === "Backspace") && selected) { e.preventDefault(); remove(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) onRedo(); else onUndo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); onRedo(); }
      else if (e.key === "Escape") setTool({ mode: "select" });
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  });

  const hint = tool.mode === "wall" ? EDITOR_TEXT.hintWall : tool.mode === "opening" ? EDITOR_TEXT.hintOpening : EDITOR_TEXT.hintSelect;
  const isTool = (m: Tool["mode"], kind?: string) => tool.mode === m && (kind === undefined || ("kind" in tool && tool.kind === kind));

  return (
    <div ref={root} tabIndex={-1} data-testid="plan-wall-editor" style={{ display: "flex", flexDirection: "column", gap: "0.625rem", outline: "none" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.375rem" }}>
        <button type="button" data-testid="tool-select" style={chip(isTool("select"))} onClick={() => setTool({ mode: "select" })}>{EDITOR_TEXT.select[lang]}</button>
        <span style={{ width: 1, alignSelf: "stretch", background: "var(--qp-soft)", margin: "0 0.25rem" }} />
        {WALL_TOOLS.map((k) => (
          <button key={k} type="button" data-testid={`tool-wall-${k}`} style={chip(isTool("wall", k))} onClick={() => setTool({ mode: "wall", kind: k })}>
            + {WALL_KIND_TEXT[k][lang]}
          </button>
        ))}
        <span style={{ width: 1, alignSelf: "stretch", background: "var(--qp-soft)", margin: "0 0.25rem" }} />
        {OPENING_TOOLS.map((k) => (
          <button key={k} type="button" data-testid={`tool-opening-${k}`} style={chip(isTool("opening", k))} onClick={() => setTool({ mode: "opening", kind: k })}>
            + {OPENING_KIND_OPTIONS.find((o) => o.value === k)!.label[lang]}
          </button>
        ))}
        <span style={{ marginInlineStart: "auto", display: "flex", gap: "0.375rem" }}>
          <button type="button" data-testid="undo" style={chip(false, !canUndo)} disabled={!canUndo} onClick={onUndo}>↶ {EDITOR_TEXT.undo[lang]}</button>
          <button type="button" data-testid="redo" style={chip(false, !canRedo)} disabled={!canRedo} onClick={onRedo}>↷ {EDITOR_TEXT.redo[lang]}</button>
        </span>
      </div>
      <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--qp-muted)" }}>{hint[lang]}</p>

      <PlanCanvas key={tool.mode === "select" ? "select" : `${tool.mode}-${tool.kind}`} twin={twin} frame={frame} lang={lang} highlight={highlight} tool={tool} selected={selected}
        onSelect={onSelect} onPreview={onPreview} onCommit={onCommit} />

      <div data-testid="wall-props" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "0.75rem", minHeight: "3.25rem", padding: "0.625rem 0.75rem", borderRadius: "0.5rem", background: "var(--qp-soft)" }}>
        {!wall && !opening && <span style={{ fontSize: "0.8125rem", color: "var(--qp-muted)" }}>{EDITOR_TEXT.nothing[lang]}</span>}
        {wall && (
          <>
            <b style={{ fontSize: "0.875rem" }} dir="ltr">{EDITOR_TEXT.wall[lang]} {wall.id}</b>
            <label style={label}>{TEXT.type[lang]}
              <select aria-label="wall kind" style={{ ...field, width: "8rem" }} value={wall.kind} onChange={(e) => commit(setWallKind(twin, wall.id, e.target.value as Wall["kind"]))}>
                {(Object.keys(WALL_KIND_TEXT) as Wall["kind"][]).map((k) => <option key={k} value={k}>{WALL_KIND_TEXT[k][lang]}</option>)}
              </select>
            </label>
            <label style={label}>{EDITOR_TEXT.thickness[lang]}
              <NumberField label="wall thickness" value={Math.round(wall.thickness * 100)} min={2} max={60} onCommit={(cm) => commit(setWallThickness(twin, wall.id, cm / 100))} />
            </label>
            <span style={{ fontSize: "0.8125rem", color: "var(--qp-muted)" }}>{EDITOR_TEXT.length[lang]}: <b style={{ color: "var(--qp-ink)" }}>{Math.round(wallLength(wall) * 100)}</b></span>
            <button type="button" style={chip(false)} onClick={() => commit(splitWall(twin, wall.id, wallLength(wall) / 2))}>{EDITOR_TEXT.split[lang]}</button>
            <button type="button" data-testid="delete-selected" style={{ ...chip(false), color: "var(--qp-error)", borderColor: "var(--qp-error)" }} onClick={remove}>{EDITOR_TEXT.remove[lang]}</button>
          </>
        )}
        {opening && (
          <>
            <b style={{ fontSize: "0.875rem" }} dir="ltr">{EDITOR_TEXT.opening[lang]} {opening.id}</b>
            <label style={label}>{TEXT.kind[lang]}
              <select aria-label="opening kind" style={{ ...field, width: "9rem" }} value={opening.kind} onChange={(e) => commit(setOpeningKind(twin, opening.id, e.target.value as Opening["kind"]))}>
                {OPENING_KIND_OPTIONS.map((k) => <option key={k.value} value={k.value}>{k.label[lang]}</option>)}
              </select>
            </label>
            <label style={label}>{TEXT.width[lang]}
              <NumberField label="opening width" value={Math.round(opening.width * 100)} min={30} max={600} onCommit={(cm) => commit(setOpeningWidth(twin, opening.id, cm / 100))} />
            </label>
            <label style={label}>{EDITOR_TEXT.position[lang]}
              <NumberField label="opening position" value={Math.round(opening.at * 100)} min={0} max={5000} onCommit={(cm) => commit(moveOpening(twin, opening.id, cm / 100))} />
            </label>
            <button type="button" data-testid="delete-selected" style={{ ...chip(false), color: "var(--qp-error)", borderColor: "var(--qp-error)" }} onClick={remove}>{EDITOR_TEXT.remove[lang]}</button>
          </>
        )}
      </div>
    </div>
  );
}

/** Number in cm, applied on each valid keystroke; an empty or invalid field waits until blur. */
function NumberField({ label: aria, value, min, max, onCommit }: { label: string; value: number; min: number; max: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input aria-label={aria} type="number" min={min} max={max} step={5} style={field} value={text ?? String(value)}
      onChange={(e) => { setText(e.target.value); const v = Number(e.target.value); if (e.target.value !== "" && v >= min && v <= max) onCommit(v); }}
      onBlur={() => setText(null)} />
  );
}
