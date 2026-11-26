"use client";
/** M12: the "Render still" control in the bar and the overlay that shows progress, then the finished image. */
import { useEffect, useState } from "react";
import { STILL_PRESET_IDS, STILL_PRESETS, stillEta, stillFilename, stillProgress, type StillPreset } from "@/lib/studio/render/still";
import { useStudio } from "../store";
import { useT } from "../useT";

export function StillButton({ disabled }: { disabled?: boolean }) {
  const { t } = useT();
  const mode = useStudio((s) => s.mode);
  const busy = useStudio((s) => s.still.status === "preparing" || s.still.status === "rendering");
  const aiPreview = useStudio((s) => !!s.ai?.preview);
  const [preset, setPreset] = useState<StillPreset>("standard");
  if (mode !== "walk") return null;
  const off = disabled || busy || aiPreview;
  return (
    <span className="st-still-ctl">
      <select aria-label={t("still.preset")} value={preset} onChange={(e) => setPreset(e.target.value as StillPreset)} disabled={off}>
        {STILL_PRESET_IDS.map((p) => <option key={p} value={p}>{t(`still.${p}`)}</option>)}
      </select>
      <button type="button" className="st-still-btn" disabled={off} title={aiPreview ? t("still.aiBusy") : undefined} onClick={() => useStudio.getState().startStill(preset)}>
        ◎ {t("still.open")}
      </button>
    </span>
  );
}

export function StillOverlay({ designName }: { designName: string | null }) {
  const { t } = useT();
  const st = useStudio((s) => s.still);
  // a ticking clock so the elapsed time and ETA move between sample updates
  const [now, setNow] = useState(() => Date.now());
  const running = st.status === "preparing" || st.status === "rendering";
  useEffect(() => {
    if (!running) return;
    const i = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(i);
  }, [running]);
  useEffect(() => {
    if (st.status === "idle") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") useStudio.getState().closeStill(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [st.status]);
  if (st.status === "idle" || st.status === "cancelled") return null;

  const settings = STILL_PRESETS[st.preset];
  const elapsed = running ? now - st.startedAt : st.elapsedMs;
  const pct = Math.round(stillProgress(st.samples, st.target) * 100);
  const eta = stillEta(st.samples, st.target, elapsed, settings.maxSeconds);
  return (
    <div className="st-ui st-still" role="dialog" aria-modal="true" aria-label={t("still.title")} data-status={st.status}>
      <div className="st-still__card">
        <h2>{t("still.title")}</h2>
        {running && (
          <>
            <p role="status">{st.status === "preparing" ? t("still.preparing") : `${t("still.rendering")} ${pct}%${eta !== null ? ` · ${t("still.eta").replace("{n}", String(Math.ceil(eta)))}` : ""}`}</p>
            <div className="st-still__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><span style={{ width: `${pct}%` }} /></div>
            <p className="st-still__note">{t("still.note")}</p>
            <div className="st-still__row"><button type="button" onClick={() => useStudio.getState().closeStill()}>{t("still.cancel")}</button></div>
          </>
        )}
        {st.status === "done" && st.url && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- a local blob URL */}
            <img className="st-still__img" src={st.url} alt={t("still.done")} />
            <p className="st-still__note">
              {t("still.stats").replace("{samples}", String(Math.round(st.samples))).replace("{w}", String(st.width)).replace("{h}", String(st.height)).replace("{s}", (st.elapsedMs / 1000).toFixed(1))}
              {st.truncated ? ` ${t("still.truncated")}` : ""}
              {st.truncated && st.slowBackend ? ` ${t("still.slowHint")}` : ""}
            </p>
            <div className="st-still__row">
              <a className="st-primary st-still__dl" href={st.url} download={stillFilename(designName, st.preset, new Date())}>{t("still.download")}</a>
              <button type="button" onClick={() => useStudio.getState().closeStill()}>{t("still.close")}</button>
            </div>
          </>
        )}
        {st.status === "error" && (
          <>
            <p role="alert">{t("still.error")}{st.error ? ` (${st.error})` : ""}</p>
            <div className="st-still__row"><button type="button" onClick={() => useStudio.getState().closeStill()}>{t("still.close")}</button></div>
          </>
        )}
      </div>
    </div>
  );
}
