"use client";

import type { Issue } from "@/lib/twin/validate";
import { TEXT, type Lang } from "./planText";

const LEVEL_STYLE: Record<Issue["level"], { fg: string; bg: string; mark: string }> = {
  error: { fg: "var(--qp-error)", bg: "var(--qp-error-bg)", mark: "✕" },
  warning: { fg: "var(--qp-warning)", bg: "var(--qp-warning-bg)", mark: "!" },
  info: { fg: "var(--qp-info)", bg: "var(--qp-info-bg)", mark: "i" },
};
const ORDER: Record<Issue["level"], number> = { error: 0, warning: 1, info: 2 };

/** Validator issues in both languages (the UI language first). Clicking one selects its element. */
export function PlanIssueList({
  issues, notes, lang, selected, onSelect,
}: {
  issues: Issue[];
  notes: string[];
  lang: Lang;
  selected: string | null;
  onSelect: (ref: string | null) => void;
}) {
  const other: Lang = lang === "he" ? "en" : "he";
  const sorted = [...issues].sort((a, b) => ORDER[a.level] - ORDER[b.level]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {sorted.length === 0 && (
        <div style={{ padding: "0.625rem 0.75rem", borderRadius: "0.5rem", background: "var(--qp-success-bg)", color: "var(--qp-success)", fontWeight: 600, fontSize: "0.875rem" }}>
          ✓ {TEXT.noIssues[lang]}
        </div>
      )}
      <ul data-testid="plan-issues" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.375rem" }}>
        {sorted.map((iss, i) => {
          const s = LEVEL_STYLE[iss.level];
          const active = !!iss.ref && iss.ref === selected;
          return (
            <li key={`${iss.code}-${iss.ref ?? ""}-${i}`}>
              <button
                type="button"
                onClick={() => onSelect(iss.ref && !active ? iss.ref : null)}
                style={{
                  display: "flex", gap: "0.5rem", width: "100%", textAlign: "start", alignItems: "flex-start",
                  padding: "0.5rem 0.625rem", borderRadius: "0.5rem", background: s.bg, cursor: iss.ref ? "pointer" : "default",
                  border: `1px solid ${active ? s.fg : "transparent"}`, fontFamily: "inherit", color: "var(--qp-ink)",
                }}
              >
                <span aria-hidden style={{ flex: "0 0 1.25rem", height: "1.25rem", borderRadius: 999, background: s.fg, color: "#fff", fontSize: "0.6875rem", fontWeight: 700, display: "grid", placeItems: "center" }}>
                  {s.mark}
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: "0.125rem", minWidth: 0 }}>
                  <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>{iss[lang]}</span>
                  <span dir={other === "he" ? "rtl" : "ltr"} style={{ fontSize: "0.75rem", color: "var(--qp-muted)" }}>{iss[other]}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {notes.length > 0 && (
        <details style={{ fontSize: "0.8125rem", color: "var(--qp-muted)" }}>
          <summary style={{ cursor: "pointer" }}>{TEXT.notes[lang]} ({notes.length})</summary>
          <ul dir="ltr" style={{ margin: "0.375rem 0 0", paddingInlineStart: "1.25rem" }}>
            {notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
