"use client";
/**
 * SVG layer over the plan camera: room names and areas, edge lengths, door swings,
 * and for the selected piece its size plus the free distance to the walls. Every
 * number is computed from the baseline geometry (lib/studio/plan/measure) and
 * placed with the same projection the camera uses, so labels never drift.
 */
import { useMemo } from "react";
import { resolveSize } from "@/lib/studio/catalog/sizing";
import { bboxOf, footprint } from "@/lib/studio/validation/geom2d";
import { doorSwings, footprintClearances, roomEdges, roomLabels, totalArea } from "@/lib/studio/plan/measure";
import { project, type PlanView, type Viewport } from "@/lib/studio/plan/view";
import { useStudio } from "../store";
import { useT } from "../useT";

const P = (v: PlanView, vp: Viewport, x: number, y: number) => project(v, vp, [x, y, 0]);
const fmt = (m: number) => `${Math.round(m * 100)}`;

export default function PlanOverlay() {
  const { t, locale } = useT();
  const plan = useStudio((s) => s.plan);
  const vp = useStudio((s) => s.viewport);
  const baseline = useStudio((s) => s.baseline);
  const showDims = useStudio((s) => s.showDims);
  const doc = useStudio((s) => s.doc);
  const catalog = useStudio((s) => s.catalog);
  const selection = useStudio((s) => s.selection);
  const drag = useStudio((s) => s.drag);

  const labels = useMemo(() => (baseline ? roomLabels(baseline) : []), [baseline]);
  const swings = useMemo(() => (baseline ? doorSwings(baseline) : []), [baseline]);
  const edges = useMemo(() => (baseline ? Object.values(baseline.rooms).flatMap((r) => roomEdges(r).map((e) => ({ ...e, room: r.id }))) : []), [baseline]);
  const totals = useMemo(() => (baseline ? totalArea(baseline) : null), [baseline]);

  const sel = useMemo(() => {
    const n = selection && doc ? doc.nodes[selection] : null;
    if (!n || n.kind !== "item" || !catalog || !baseline) return null;
    const m = catalog.model(n.catalog);
    if (!m) return null;
    try { return { node: n, size: resolveSize(m, n) }; } catch { return null; }
  }, [selection, doc, catalog, baseline]);

  if (!plan || !baseline) return null;
  const px = plan.ppm;
  const showEdges = showDims && px >= 22;

  let selUi: React.ReactNode = null;
  if (sel && baseline) {
    const tr = drag && drag.id === sel.node.id ? { x: drag.x, y: drag.y, rot: drag.rot } : sel.node.transform;
    const fp = footprint(tr.x, tr.y, tr.rot, sel.size.w, sel.size.d);
    const b = bboxOf(fp);
    const c = footprintClearances(baseline, fp);
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    const line = (x1: number, y1: number, x2: number | null, y2: number | null, d: number | null, k: string) => {
      if (d === null || x2 === null || y2 === null || d < 0.05) return null;
      const a = P(plan, vp, x1, y1), z = P(plan, vp, x2, y2);
      return (
        <g key={k} className="pl-clear">
          <line x1={a[0]} y1={a[1]} x2={z[0]} y2={z[1]} />
          <text x={(a[0] + z[0]) / 2} y={(a[1] + z[1]) / 2 - 4} textAnchor="middle">{fmt(d)}</text>
        </g>
      );
    };
    const poly = fp.map(([x, y]) => P(plan, vp, x, y).join(",")).join(" ");
    const lab = P(plan, vp, cx, b[3]);
    selUi = (
      <g>
        <polygon points={poly} className="pl-sel" />
        {showDims && (
          <>
            {line(b[0], cy, c.west === null ? null : b[0] - c.west, cy, c.west, "w")}
            {line(b[2], cy, c.east === null ? null : b[2] + c.east, cy, c.east, "e")}
            {line(cx, b[1], cx, c.south === null ? null : b[1] - c.south, c.south, "s")}
            {line(cx, b[3], cx, c.north === null ? null : b[3] + c.north, c.north, "n")}
          </>
        )}
        <text x={lab[0]} y={lab[1] - 10} textAnchor="middle" className="pl-size">{fmt(sel.size.w)} × {fmt(sel.size.d)} cm</text>
      </g>
    );
  }

  return (
    <svg className="pl-overlay" width={vp.w} height={vp.h} viewBox={`0 0 ${vp.w} ${vp.h}`} aria-hidden>
      {swings.map((s) => (
        <polyline key={s.id} className="pl-swing" fill="none" points={[s.closed, ...s.arc, s.hinge].map((p) => P(plan, vp, p[0], p[1]).join(",")).join(" ")} />
      ))}
      {showEdges && edges.filter((e) => e.length >= 0.5).map((e, i) => {
        const [x, y] = P(plan, vp, e.mid[0] + e.inward[0] * (11 / px), e.mid[1] + e.inward[1] * (11 / px));
        return <text key={i} x={x} y={y + 3} textAnchor="middle" className="pl-edge">{fmt(e.length)}</text>;
      })}
      {labels.map((l) => {
        const [x, y] = P(plan, vp, l.at[0], l.at[1]);
        return (
          <text key={l.id} x={x} y={y} textAnchor="middle" className="pl-room">
            <tspan x={x}>{l.name[locale]}</tspan>
            {showDims && <tspan x={x} dy="1.25em" className="pl-area">{l.area} m²</tspan>}
          </text>
        );
      })}
      {selUi}
      {showDims && totals && (
        <text x={18} y={vp.h > 520 ? 128 : 112} className="pl-total">{t("planInterior")} {totals.interior} m² · {t("planBalcony")} {totals.balcony} m²</text>
      )}
    </svg>
  );
}
