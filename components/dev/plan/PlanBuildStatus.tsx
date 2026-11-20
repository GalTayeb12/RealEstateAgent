"use client";

/**
 * Where the walkthrough build of an approved plan stands: queued, running,
 * done (with a link to /walk/<slug>) or failed, plus "build again" and a
 * quick preview build. The job itself runs in scripts/twin/build-worker.ts.
 */
import type { BuildView } from "@/lib/twin/buildJobs";
import { TEXT, type Lang } from "./planText";

const TONE = {
  queued: { fg: "var(--qp-info)", bg: "var(--qp-info-bg)" },
  running: { fg: "var(--qp-warning)", bg: "var(--qp-warning-bg)" },
  done: { fg: "var(--qp-success)", bg: "var(--qp-success-bg)" },
  failed: { fg: "var(--qp-error)", bg: "var(--qp-error-bg)" },
} as const;

const LABEL = { queued: TEXT.buildQueued, running: TEXT.buildRunning, done: TEXT.buildDone, failed: TEXT.buildFailed } as const;

export function PlanBuildStatus({
  build, lang, busy, onBuild,
}: {
  build: BuildView | null;
  lang: Lang;
  busy: boolean;
  onBuild: (preview: boolean) => void;
}) {
  const active = build && (build.status === "queued" || build.status === "running") && !build.stale;
  const btn: React.CSSProperties = {
    padding: "0.4rem 0.875rem", borderRadius: "0.4rem", fontSize: "0.8125rem", fontWeight: 600,
    border: "1px solid var(--qp-border)", background: "var(--qp-surface)", color: "var(--qp-ink)",
    cursor: busy || active ? "not-allowed" : "pointer", opacity: busy || active ? 0.55 : 1,
  };

  return (
    <div data-testid="plan-build" style={{ display: "flex", flexDirection: "column", gap: "0.5rem", borderTop: "1px solid var(--qp-soft)", paddingTop: "1rem" }}>
      <h4 style={{ margin: 0, fontSize: "0.875rem", color: "var(--qp-ink)" }}>{TEXT.buildTitle[lang]}</h4>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem" }}>
        {build ? (
          <span data-testid="plan-build-status" style={{ padding: "0.25rem 0.75rem", borderRadius: 999, fontSize: "0.8125rem", fontWeight: 600, color: TONE[build.status].fg, background: TONE[build.status].bg }}>
            {LABEL[build.status][lang]}
            {build.preview && ` · ${TEXT.buildPreviewTag[lang]}`}
          </span>
        ) : (
          <span style={{ fontSize: "0.8125rem", color: "var(--qp-muted)" }}>{TEXT.buildNone[lang]}</span>
        )}
        {build?.walkUrl && (
          <a href={build.walkUrl} target="_blank" rel="noopener" style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--qp-ink)" }}>
            {TEXT.buildOpen[lang]} ↗
          </a>
        )}
        {build?.stale && <span style={{ fontSize: "0.8125rem", color: "var(--qp-warning)" }}>{TEXT.buildStale[lang]}</span>}
        <span style={{ marginInlineStart: "auto", display: "flex", gap: "0.5rem" }}>
          <button type="button" style={btn} disabled={busy || !!active} onClick={() => onBuild(true)}>{TEXT.buildPreview[lang]}</button>
          <button type="button" style={btn} disabled={busy || !!active} onClick={() => onBuild(false)}>{TEXT.buildAgain[lang]}</button>
        </span>
      </div>
      {build?.status === "failed" && build.error && (
        <div role="alert" style={{ fontSize: "0.8125rem", color: "var(--qp-error)" }} dir="ltr">{build.error}</div>
      )}
    </div>
  );
}
