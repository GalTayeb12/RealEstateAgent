"use client";
/**
 * AI designer panel. The request goes to /api/studio/ai, which returns an already
 * validated batch. The batch is applied immediately as ONE history step (so it is
 * visible in the scene) and stays "pending": Keep leaves it, Reject undoes it exactly.
 * Any other edit while pending makes the proposal part of the design (Keep is implied).
 */
import { useState } from "react";
import type { Command } from "@/lib/studio/commands/types";
import { useStudio } from "../store";
import { useT } from "../useT";

type Reply = { mode: "dry-run" | "live"; summary: string; batch: Command | null; accepted: number; rejected: { index: number; reason: string }[] };

export default function AiPanel() {
  const { t } = useT();
  const open = useStudio((s) => s.aiOpen);
  const pending = useStudio((s) => s.aiPending);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;
  const st = useStudio.getState;

  async function send() {
    const doc = st().doc;
    if (!doc || !prompt.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/studio/ai", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ baselineId: doc.baseline.id, doc, prompt }) });
      if (!res.ok) throw new Error(res.status === 429 ? t("aiBusy") : t("aiFailed"));
      const r = (await res.json()) as Reply;
      if (!r.batch) { setError(r.summary || t("aiNothing")); return; }
      if (st().dispatch(r.batch)) st().setAiPending({ summary: r.summary, accepted: r.accepted, rejected: r.rejected.length, mode: r.mode });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="st-ui st-panel" aria-label={t("aiDesigner")}>
      <header className="st-panel__head">
        <div><strong>{t("aiDesigner")}</strong><span>{t("aiFree")}</span></div>
        <button type="button" className="st-iconbtn" aria-label={t("close")} onClick={() => st().setAiOpen(false)}>✕</button>
      </header>
      {pending ? (
        <section>
          <p>{pending.summary}</p>
          <small>{pending.accepted} {t("aiChanges")}{pending.rejected ? ` · ${pending.rejected} ${t("aiSkipped")}` : ""}</small>
          <div className="st-actions">
            <button type="button" className="st-primary" onClick={() => st().setAiPending(null)}>{t("aiKeep")}</button>
            <button type="button" className="st-danger" onClick={() => { st().undo(); st().setAiPending(null); }}>{t("aiReject")}</button>
          </div>
        </section>
      ) : (
        <section>
          <textarea className="st-ai-input" rows={3} value={prompt} placeholder={t("aiPlaceholder")} onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send(); }} />
          <button type="button" className="st-primary" disabled={busy || !prompt.trim()} onClick={() => void send()}>{busy ? "…" : t("aiSend")}</button>
          {error && <p className="st-err">{error}</p>}
        </section>
      )}
    </aside>
  );
}
