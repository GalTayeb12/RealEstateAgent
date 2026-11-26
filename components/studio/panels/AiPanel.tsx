"use client";
/**
 * AI designer panel (M10). The user describes a change; the server returns a validated proposal that
 * is shown as a ghost preview (translucent blue pieces, new finishes) without touching the design.
 * Accept applies it as one command (one undo step); Reject discards it. Actions the server could not
 * place legally are listed with the reason instead of being applied. In dry-run mode (the default)
 * no paid model is called; a badge says so.
 */
import { useState } from "react";
import { SAMPLE_PROMPTS } from "@/lib/studio/ai/plan";
import { useStudio } from "../store";
import { useT } from "../useT";

export default function AiPanel({ slug }: { slug: string }) {
  const { t, locale } = useT();
  const open = useStudio((s) => s.aiOpen);
  const ai = useStudio((s) => s.ai);
  const models = useStudio((s) => s.models);
  const canUndo = useStudio((s) => s.canUndo);
  const [prompt, setPrompt] = useState("");
  if (!open) return null;
  const st = useStudio.getState;
  const lang = locale === "he" ? "he" : "en";
  const send = (p: string) => { const q = p.trim(); if (q) void st().askAi(slug, q, lang); };
  const res = ai?.response;
  const name = (id: string) => {
    const node = (ai?.preview ?? st().doc)?.nodes[id];
    const m = node && node.kind === "item" ? models.find((x) => x.id === node.catalog.id) : undefined;
    return m ? m.name[locale] : id;
  };
  const loading = ai?.status === "loading";

  return (
    <aside className="st-ui st-panel st-ai" aria-label={t("ai.title")} aria-busy={loading}>
      <header className="st-panel__head">
        <div>
          <strong>{t("ai.title")}</strong>
          <span>{res?.provider === "claude" ? t("ai.live") : t("ai.dryRun")}</span>
        </div>
        <button type="button" className="st-iconbtn" aria-label={t("close")} onClick={() => st().setAiOpen(false)}>✕</button>
      </header>

      <form onSubmit={(e) => { e.preventDefault(); send(prompt); }}>
        <textarea
          className="st-ai__input" rows={3} maxLength={500} value={prompt} dir="auto"
          placeholder={t("ai.placeholder")} aria-label={t("ai.placeholder")}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(prompt); } }}
        />
        <div className="st-actions">
          <button type="submit" className="st-ai__go" disabled={loading || !prompt.trim()}>{loading ? t("ai.thinking") : t("ai.send")}</button>
        </div>
      </form>

      {!ai && (
        <>
          <h4>{t("ai.try")}</h4>
          <div className="st-chips">
            {SAMPLE_PROMPTS.map((s) => (
              <button key={s.id} type="button" className="st-chip" data-sample={s.id} onClick={() => { setPrompt(s[lang]); send(s[lang]); }}>{s[lang]}</button>
            ))}
          </div>
        </>
      )}

      {ai?.status === "error" && <p className="st-err" role="alert">{t(ai.error ?? "ai.failed")}</p>}

      {res && ai && (ai.status === "ready" || ai.status === "applied") && (
        <div className="st-ai__result" role="status" aria-live="polite">
          <p className="st-ai__summary" dir="auto">{res.summary}</p>
          {res.error && <p className="st-err">{t(`ai.err.${res.error}`)}</p>}
          {(res.added.length > 0 || res.changed.length > 0 || res.removed.length > 0 || res.surfaces.length > 0) ? (
            <ul className="st-list st-ai__changes">
              {res.added.map((id) => <li key={id}>＋ {name(id)}</li>)}
              {res.changed.map((id) => <li key={id}>↻ {name(id)}</li>)}
              {res.removed.map((id) => <li key={id}>− {name(id)}</li>)}
              {res.surfaces.length > 0 && <li>◐ {t("ai.surfaces").replace("{n}", String(res.surfaces.length))}</li>}
            </ul>
          ) : <p className="st-empty">{t("ai.nothing")}</p>}
          {res.dropped.length > 0 && (
            <>
              <h4>{t("ai.skipped")}</h4>
              <ul className="st-issues">{res.dropped.map((d) => <li key={d.index} className="st-warn">{t(`ai.drop.${d.reason}`) === `ai.drop.${d.reason}` ? t(d.reason) : t(`ai.drop.${d.reason}`)}</li>)}</ul>
            </>
          )}
          {ai.status === "ready" && res.command && (
            <>
              <p className="st-ai__note">{t("ai.previewNote")}</p>
              <div className="st-actions">
                <button type="button" className="st-ai__accept" onClick={() => st().acceptAi()}>{t("ai.accept")}</button>
                <button type="button" className="st-ai__reject" onClick={() => st().rejectAi()}>{t("ai.reject")}</button>
              </div>
            </>
          )}
          {ai.status === "applied" && (
            <div className="st-actions">
              <span className="st-ai__ok">{t("ai.applied")}</span>
              <button type="button" className="st-ai__undo" disabled={!canUndo} onClick={() => { st().undo(); st().rejectAi(); }}>{t("ai.undo")}</button>
              <button type="button" onClick={() => { st().rejectAi(); setPrompt(""); }}>{t("ai.again")}</button>
            </div>
          )}
          {ai.status === "ready" && !res.command && (
            <div className="st-actions"><button type="button" onClick={() => st().rejectAi()}>{t("ai.again")}</button></div>
          )}
        </div>
      )}
    </aside>
  );
}
