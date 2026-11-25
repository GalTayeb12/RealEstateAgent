"use client";
/** Top / isometric switch, fit, zoom and the dimensions toggle for the floor planner. */
import { fitView, zoomAt } from "@/lib/studio/plan/view";
import { useStudio } from "../store";
import { useT } from "../useT";

export default function PlanToolbar() {
  const { t } = useT();
  const plan = useStudio((s) => s.plan);
  const showDims = useStudio((s) => s.showDims);
  const zoom = (k: number) => {
    const { plan: p, viewport: vp, setPlan } = useStudio.getState();
    if (p) setPlan(zoomAt(p, vp, k, vp.w / 2, vp.h / 2));
  };
  const fit = () => {
    const s = useStudio.getState();
    if (!s.baseline || !s.plan) return;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const r of Object.values(s.baseline.rooms)) for (const [x, y] of r.polygon) { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); }
    s.setPlan(fitView(s.plan.kind, [x1, y1, x2, y2], 1.25, s.viewport, 0.1));
  };
  const setKind = (kind: "top" | "iso") => { useStudio.getState().setPlanKind(kind); setTimeout(fit, 0); };
  return (
    <div className="st-ui st-plan" role="toolbar" aria-label={t("plan")}>
      <button type="button" aria-pressed={plan?.kind === "top"} onClick={() => setKind("top")}>{t("planTop")}</button>
      <button type="button" aria-pressed={plan?.kind === "iso"} onClick={() => setKind("iso")}>{t("planIso")}</button>
      <span className="st-plan__sep" />
      <button type="button" aria-label={t("planZoomOut")} onClick={() => zoom(1 / 1.3)}>−</button>
      <button type="button" aria-label={t("planZoomIn")} onClick={() => zoom(1.3)}>+</button>
      <button type="button" onClick={fit}>{t("planFit")}</button>
      <span className="st-plan__sep" />
      <button type="button" aria-pressed={showDims} onClick={() => useStudio.getState().setShowDims(!showDims)}>{t("planDims")}</button>
    </div>
  );
}
