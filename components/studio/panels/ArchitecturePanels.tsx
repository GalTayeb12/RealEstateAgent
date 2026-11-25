"use client";
/**
 * Architecture UI: the toolbar menu (add partition / add opening / kitchen layouts),
 * the panel for a selected proposal, and the kitchen layout chooser. Everything that
 * changes the design goes through the store's validated commit, so a proposal that
 * touches protected structure or furniture is refused with a reason. Proposals are
 * always labelled as concept-only.
 */
import { useMemo, useState } from "react";
import { previewProposal } from "@/lib/studio/design/preview";
import { layoutFootprints, proposeKitchenLayouts } from "@/lib/studio/design/kitchen";
import type { OpeningProposalNode, PartitionProposalNode } from "@/lib/studio/schema/nodes";
import { OPENING_EDGE, OPENING_MAX, OPENING_MIN } from "@/lib/studio/validation/architecture";
import { useStudio } from "../store";
import { useT } from "../useT";

export function ArchitectureMenu() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const tool = useStudio((s) => s.tool);
  const hasKitchen = useStudio((s) => !!s.baseline && Object.values(s.baseline.rooms).some((r) => r.type === "kitchen"));
  const go = (f: () => void) => () => { setOpen(false); f(); };
  const st = useStudio.getState;
  return (
    <div className="st-arch">
      <button type="button" aria-expanded={open} aria-pressed={!!tool} onClick={() => (tool ? st().setTool(null) : setOpen(!open))}>
        {tool ? `✕ ${t("arch")}` : t("arch")}
      </button>
      {open && (
        <div className="st-arch__list" role="menu">
          <button role="menuitem" type="button" onClick={go(() => st().setTool({ kind: "partition", a: null }))}>{t("addPartition")}</button>
          <button role="menuitem" type="button" onClick={go(() => st().setTool({ kind: "opening" }))}>{t("addOpening")}</button>
          <button role="menuitem" type="button" disabled={!hasKitchen} onClick={go(() => st().setKitchenOpen(true))}>{t("kitchenLayouts")}</button>
        </div>
      )}
    </div>
  );
}

const cm = (m: number) => Math.round(m * 100);

export function ProposalPanel({ node }: { node: PartitionProposalNode | OpeningProposalNode }) {
  const { t } = useT();
  const doc = useStudio((s) => s.doc)!;
  const baseline = useStudio((s) => s.baseline)!;
  const catalog = useStudio((s) => s.catalog)!;
  const commit = useStudio((s) => s.commit);
  const preview = useMemo(() => previewProposal(doc, node, baseline, catalog), [doc, node, baseline, catalog]);
  const [local, setLocal] = useState<Record<string, number>>({});
  const val = (k: string, d: number) => local[k] ?? d;
  const send = (patch: Record<string, number>) => { if (commit({ type: "setProposal", id: node.id, patch }, node.id)) setLocal({}); else setLocal({}); };
  const length = node.kind === "partitionProposal" ? Math.hypot(node.b[0] - node.a[0], node.b[1] - node.a[1]) : node.width;
  const wall = node.kind === "openingProposal" ? baseline.walls[node.wallId] : null;
  const wallLen = wall ? Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]) : 0;
  return (
    <aside className="st-ui st-panel" aria-label={node.kind === "partitionProposal" ? t("partitionNode") : t("openingNode")}>
      <header className="st-panel__head">
        <div><strong>{node.kind === "partitionProposal" ? t("partitionNode") : t("openingNode")}</strong><span className="st-concept">{t("conceptBadge")}</span></div>
        <button type="button" className="st-iconbtn" aria-label={t("close")} onClick={() => useStudio.getState().select(null)}>✕</button>
      </header>
      <p className="st-warn">{t("proposalWarn")}</p>
      <section className="st-dims"><span>{cm(length)}</span> <small>cm</small></section>

      {node.kind === "partitionProposal" ? (
        <section>
          <div className="st-slot">
            <label>{t("thickness")} · {cm(val("thickness", node.thickness))} cm</label>
            <input type="range" min={0.08} max={0.2} step={0.01} value={val("thickness", node.thickness)}
              onChange={(e) => setLocal({ ...local, thickness: Number(e.target.value) })} onPointerUp={() => send({ thickness: val("thickness", node.thickness) })} onKeyUp={() => send({ thickness: val("thickness", node.thickness) })} />
          </div>
        </section>
      ) : (
        <section>
          <div className="st-slot">
            <label>{t("width")} · {cm(val("width", node.width))} cm</label>
            <input type="range" min={OPENING_MIN} max={Math.min(OPENING_MAX, 2.4)} step={0.05} value={val("width", node.width)}
              onChange={(e) => setLocal({ ...local, width: Number(e.target.value) })} onPointerUp={() => send({ width: val("width", node.width) })} onKeyUp={() => send({ width: val("width", node.width) })} />
          </div>
          <div className="st-slot">
            <label>{t("position")} · {cm(val("at", node.at))} cm</label>
            <input type="range" min={OPENING_EDGE + node.width / 2} max={Math.max(OPENING_EDGE + node.width / 2, wallLen - OPENING_EDGE - node.width / 2)} step={0.05} value={val("at", node.at)}
              onChange={(e) => setLocal({ ...local, at: Number(e.target.value) })} onPointerUp={() => send({ at: val("at", node.at) })} onKeyUp={() => send({ at: val("at", node.at) })} />
          </div>
        </section>
      )}

      <section className="st-actions">
        <button type="button" className="st-danger" onClick={() => useStudio.getState().removeSelected()}>{t("remove")}</button>
      </section>
      <section>
        <h4>{t("hints")}</h4>
        <ul className="st-issues">
          {preview.errors.map((i, k) => <li key={`e${k}`} className="st-err">{t(`err.${i.code}`)}</li>)}
          {preview.advisories.map((i, k) => <li key={`a${k}`} className="st-adv">{t(`adv.${i.code}`)}</li>)}
        </ul>
      </section>
    </aside>
  );
}

export function KitchenPanel() {
  const { t, locale } = useT();
  const open = useStudio((s) => s.kitchenOpen);
  const baseline = useStudio((s) => s.baseline);
  const doc = useStudio((s) => s.doc);
  const catalog = useStudio((s) => s.catalog);
  const layouts = useMemo(() => (open && baseline && doc && catalog ? proposeKitchenLayouts(baseline, doc, catalog) : []), [open, baseline, doc, catalog]);
  const room = useMemo(() => (baseline ? Object.values(baseline.rooms).find((r) => r.type === "kitchen") : undefined), [baseline]);
  if (!open || !baseline || !catalog || !room) return null;
  const xs = room.polygon.map((p) => p[0]), ys = room.polygon.map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), W = Math.max(...xs) - x0, H = Math.max(...ys) - y0;
  const S = 120 / Math.max(W, H);
  return (
    <aside className="st-ui st-panel" aria-label={t("kitchenLayouts")}>
      <header className="st-panel__head">
        <div><strong>{t("kitchenLayouts")}</strong><span>{room.name[locale]}</span></div>
        <button type="button" className="st-iconbtn" aria-label={t("close")} onClick={() => useStudio.getState().setKitchenOpen(false)}>✕</button>
      </header>
      {layouts.length === 0 && <p>{t("noKitchen")}</p>}
      <ul className="st-layouts">
        {layouts.map((l) => (
          <li key={l.id}>
            <svg width={W * S} height={H * S} viewBox={`0 0 ${W * S} ${H * S}`} aria-hidden>
              <rect width={W * S} height={H * S} className="st-lay-room" />
              {layoutFootprints(l, catalog).map((poly, i) => (
                <polygon key={i} className="st-lay-unit" points={poly.map(([x, y]) => `${(x - x0) * S},${(H - (y - y0)) * S}`).join(" ")} />
              ))}
            </svg>
            <div>
              <strong>{l.name[locale]}</strong>
              <small>{l.counter} m {t("counterLen")}</small>
              <button type="button" className="st-primary" onClick={() => { useStudio.getState().dispatch(l.commands[0]); useStudio.getState().setKitchenOpen(false); }}>{t("applyLayout")}</button>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
