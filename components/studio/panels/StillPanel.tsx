"use client";
/**
 * M12 photo render panel: progress while the path tracer accumulates (the canvas itself
 * shows the image converging), then the finished PNG with a download link.
 */
import { useEffect, useState } from "react";
import { useStudio } from "../store";
import { useT } from "../useT";

export default function StillPanel() {
  const { t } = useT();
  const still = useStudio((s) => s.still);
  const [now, setNow] = useState(0);
  const active = !!still && (still.status === "preparing" || still.status === "rendering");
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  if (!still) return null;
  const st = useStudio.getState;
  const close = () => st().setStill(null);
  const pct = Math.min(100, Math.round((still.samples / Math.max(1, still.target)) * 100));
  const secs = Math.max(0, Math.round(((still.status === "done" ? still.ms ?? 0 : now - still.startedAt)) / 1000));
  const compiling = still.status === "rendering" && still.samples === 0 && still.compileMs === undefined;
  const label = still.status === "preparing" ? t("stillPreparing") : compiling ? t("stillCompiling") : still.status === "rendering" ? `${t("stillRendering")} ${pct}%` : still.status === "done" ? t("stillDone") : t("stillError");

  return (
    <aside className="st-ui st-still" aria-label={t("stillTitle")} aria-busy={active}>
      <header className="st-panel__head">
        <div><strong>{t("stillTitle")}</strong><span>{label}{still.status !== "error" ? ` · ${secs} ${t("stillSeconds")}` : ""}</span></div>
        <button type="button" className="st-iconbtn" aria-label={t("close")} onClick={close}>✕</button>
      </header>
      {active && (
        <>
          <div className="st-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><span style={{ width: `${pct}%` }} /></div>
          <p className="st-still__hint">{t("stillHint")}</p>
          <div className="st-actions"><button type="button" onClick={close}>{t("stillCancel")}</button></div>
        </>
      )}
      {still.status === "done" && still.url && (
        <div className="st-actions">
          <a className="st-primary st-btnlink" href={still.url} download={`haveniq-render-${new Date().toISOString().slice(0, 10)}.png`}>{t("stillDownload")}</a>
          <button type="button" onClick={() => { const target = still.target; st().setStill(null); setTimeout(() => st().startStill(target), 50); }}>{t("stillAgain")}</button>
        </div>
      )}
      {still.status === "error" && <p className="st-err">{t("stillError")}</p>}
    </aside>
  );
}
