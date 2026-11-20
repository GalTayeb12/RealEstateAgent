"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/LocaleProvider";
import { validateTwin } from "@/lib/twin/validate";
import type { PlanTwin } from "@/lib/twin/schema";
import type { PlanRecordView } from "@/lib/planReview";
import { PlanDrawing } from "./PlanDrawing";
import { PlanIssueList } from "./PlanIssueList";
import { PlanEditor } from "./PlanEditor";
import { STATUS_TEXT, TEXT, type Lang } from "./planText";

const STATUS_COLORS: Record<PlanRecordView["status"], { fg: string; bg: string }> = {
  parsed: { fg: "var(--qp-info)", bg: "var(--qp-info-bg)" },
  needs_review: { fg: "var(--qp-warning)", bg: "var(--qp-warning-bg)" },
  approved: { fg: "var(--qp-success)", bg: "var(--qp-success-bg)" },
};

const btn = (primary: boolean, disabled: boolean): React.CSSProperties => ({
  borderRadius: 999, padding: "0.5rem 1.25rem", fontWeight: 600, fontSize: "0.875rem", fontFamily: "inherit",
  cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1,
  ...(primary
    ? { background: "linear-gradient(155deg, var(--qp-primary-hover), var(--qp-primary-active))", color: "var(--qp-on-primary)", border: "none" }
    : { background: "var(--qp-surface)", color: "var(--qp-ink)", border: "1px solid var(--qp-border)" }),
});

/**
 * "תוכנית הדירה": upload the architect's DXF, review the parsed plan twin with
 * live validation, make small corrections, and approve it.
 */
export function PlanReviewSection({ unitTypeId, onToast }: { unitTypeId: string; onToast?: (msg: string) => void }) {
  const { locale } = useI18n();
  const lang: Lang = locale === "en" ? "en" : "he";
  const router = useRouter();
  const base = `/api/dev/unit-types/${encodeURIComponent(unitTypeId)}/plan`;

  const [plan, setPlan] = useState<PlanRecordView | null>(null);
  const [draft, setDraft] = useState<PlanTwin | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"upload" | "save" | "approve" | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const call = useCallback(async (url: string, init: RequestInit = {}) => {
    const token = localStorage.getItem("token") ?? "";
    const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
    if (res.status === 401) { router.push("/dev/login"); throw new Error("Unauthorized"); }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((lang === "he" ? body.errorHe : body.error) ?? body.error ?? `HTTP ${res.status}`);
    return body as { plan: PlanRecordView | null };
  }, [router, lang]);

  const accept = useCallback((p: PlanRecordView | null) => {
    setPlan(p);
    setDraft(p ? p.twin : null);
    setSelected(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    call(base)
      .then((b) => { if (!cancelled) accept(b.plan); })
      .catch((e: Error) => { if (!cancelled) setError(`${TEXT.loadFailed[lang]}: ${e.message}`); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // load once per unit type; language changes only affect labels
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  // Live validation of the draft: validateTwin is pure and cheap.
  const report = useMemo(() => (draft ? validateTwin(draft) : null), [draft]);
  const dirty = useMemo(() => !!plan && !!draft && JSON.stringify(draft) !== JSON.stringify(plan.twin), [plan, draft]);
  const issueRefs = useMemo(() => (report?.issues.map((i) => i.ref).filter((r): r is string => !!r) ?? []), [report]);
  const highlight = useMemo(() => (selected ? [...new Set([...issueRefs, selected])] : issueRefs), [issueRefs, selected]);
  const flagged = useMemo(() => new Set(issueRefs), [issueRefs]);
  const errorCount = report?.issues.filter((i) => i.level === "error").length ?? 0;
  const warningCount = report?.issues.filter((i) => i.level === "warning").length ?? 0;

  async function run(kind: "upload" | "save" | "approve", fn: () => Promise<{ plan: PlanRecordView | null }>, toast: string) {
    setBusy(kind);
    setError("");
    try {
      accept((await fn()).plan);
      onToast?.(toast);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function upload(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    void run("upload", () => call(base, { method: "POST", body: fd }), TEXT.uploadedToast[lang]);
  }
  const save = () => draft && run("save", () => call(base, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ twin: draft }),
  }), TEXT.saved[lang]);
  const approve = () => run("approve", () => call(`${base}/approve`, { method: "POST" }), TEXT.approvedToast[lang]);

  const approveBlocked = dirty ? TEXT.saveFirst[lang] : errorCount > 0 ? TEXT.fixErrorsFirst[lang] : "";
  const status = plan?.status;

  return (
    <div data-testid="plan-review" style={{ padding: "1.375rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
      <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--qp-muted)", lineHeight: 1.6 }}>{TEXT.intro[lang]}</p>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem" }}>
        <input ref={fileRef} type="file" accept=".dxf" data-testid="plan-file" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
        <button type="button" style={btn(!plan, busy !== null)} disabled={busy !== null} onClick={() => fileRef.current?.click()}>
          {busy === "upload" ? TEXT.uploading[lang] : plan ? TEXT.replace[lang] : TEXT.upload[lang]}
        </button>
        {plan && (
          <span style={{ fontSize: "0.8125rem", color: "var(--qp-muted)" }}>
            {TEXT.source[lang]}: <span dir="ltr">{plan.source.name}</span>
          </span>
        )}
        {status && (
          <span data-testid="plan-status" style={{ marginInlineStart: "auto", padding: "0.25rem 0.75rem", borderRadius: 999, fontSize: "0.8125rem", fontWeight: 600, color: STATUS_COLORS[status].fg, background: STATUS_COLORS[status].bg }}>
            {STATUS_TEXT[status][lang]}
            {status === "approved" && plan?.approvedAt && ` · ${TEXT.approvedOn[lang]}${new Date(plan.approvedAt).toLocaleDateString(lang === "he" ? "he-IL" : "en-GB")}`}
          </span>
        )}
      </div>

      {error && (
        <div role="alert" style={{ padding: "0.625rem 0.75rem", borderRadius: "0.5rem", background: "var(--qp-error-bg)", color: "var(--qp-error)", fontSize: "0.875rem" }}>
          {error}
        </div>
      )}

      {loading && <div style={{ color: "var(--qp-muted)", fontSize: "0.875rem" }}>…</div>}

      {draft && report && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", fontSize: "0.8125rem", color: "var(--qp-muted)" }}>
            <span>{TEXT.netArea[lang]}: <b style={{ color: "var(--qp-ink)" }}>{report.netArea} {TEXT.sqm[lang]}</b></span>
            <span data-testid="plan-counts"><b style={{ color: errorCount ? "var(--qp-error)" : "var(--qp-ink)" }}>{errorCount}</b> {TEXT.errors[lang]} · <b style={{ color: "var(--qp-ink)" }}>{warningCount}</b> {TEXT.warnings[lang]}</span>
            {dirty && <span style={{ color: "var(--qp-warning)", fontWeight: 600 }}>● {TEXT.unsaved[lang]}</span>}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 22rem), 1fr))", gap: "1rem", alignItems: "start" }}>
            <PlanDrawing twin={draft} lang={lang} highlight={highlight} />
            <div>
              <h4 style={{ margin: "0 0 0.5rem", fontSize: "0.875rem", color: "var(--qp-ink)" }}>{TEXT.issues[lang]}</h4>
              <PlanIssueList issues={report.issues} notes={plan?.notes ?? []} lang={lang} selected={selected} onSelect={setSelected} />
            </div>
          </div>

          <PlanEditor twin={draft} lang={lang} onChange={setDraft} selected={selected} onSelect={setSelected} flagged={flagged} />
          <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--qp-muted)" }}>{TEXT.followUp[lang]}</p>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem", borderTop: "1px solid var(--qp-soft)", paddingTop: "1rem" }}>
            <button type="button" style={btn(false, !dirty || busy !== null)} disabled={!dirty || busy !== null} onClick={save}>
              {busy === "save" ? TEXT.saving[lang] : TEXT.save[lang]}
            </button>
            {dirty && (
              <button type="button" style={{ ...btn(false, busy !== null), border: "none", background: "transparent", textDecoration: "underline" }}
                disabled={busy !== null} onClick={() => plan && setDraft(plan.twin)}>
                {TEXT.discard[lang]}
              </button>
            )}
            <button type="button" data-testid="plan-approve" style={btn(true, !!approveBlocked || status === "approved" || busy !== null)}
              disabled={!!approveBlocked || status === "approved" || busy !== null} onClick={approve} title={approveBlocked || undefined}>
              {busy === "approve" ? TEXT.approving[lang] : TEXT.approve[lang]}
            </button>
            {approveBlocked && <span style={{ fontSize: "0.8125rem", color: "var(--qp-muted)" }}>{approveBlocked}</span>}
          </div>
        </>
      )}
    </div>
  );
}
