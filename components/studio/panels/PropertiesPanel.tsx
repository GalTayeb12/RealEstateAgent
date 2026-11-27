"use client";

/**
 * Contextual panel for whatever is selected: a piece of furniture (size,
 * configuration, materials, rotate / duplicate / replace / remove) or a wall,
 * floor or ceiling (materials). Shows only what the selection supports.
 */
import { useMemo, useState } from "react";
import { resolveSize } from "@/lib/studio/catalog/sizing";
import {
  insertableModules, materialsForSlot, materialsForSurface, modularPresets, withInserted, withoutModule,
} from "@/lib/studio/design/options";
import { previewNode } from "@/lib/studio/design/preview";
import type { ModelManifest } from "@/lib/studio/schema/catalog";
import type { ItemNode } from "@/lib/studio/schema/nodes";
import { moduleLabel } from "@/lib/studio/i18n";
import { useStudio } from "../store";
import { useT } from "../useT";
import { ProposalPanel } from "./ArchitecturePanels";
import { Swatches } from "./Swatches";

type Modular = Extract<ModelManifest["sizing"], { mode: "modular" }>;
type Parametric = Extract<ModelManifest["sizing"], { mode: "parametric" }>;

export default function PropertiesPanel() {
  const { t, locale } = useT();
  const selection = useStudio((s) => s.selection);
  const doc = useStudio((s) => s.doc);
  if (!selection || !doc) return null;
  if (selection.startsWith("surface:")) return <SurfacePanel id={selection} t={t} locale={locale} />;
  const node = doc.nodes[selection];
  if (node && (node.kind === "partitionProposal" || node.kind === "openingProposal")) return <ProposalPanel node={node} />;
  if (!node || node.kind !== "item") return null;
  return <ItemPanel node={node} t={t} locale={locale} />;
}

type Tx = { t: (k: string) => string; locale: "he" | "en" };

function Header({ title, sub, onClose, t }: { title: string; sub?: string; onClose: () => void; t: Tx["t"] }) {
  return (
    <header className="st-panel__head">
      <div><strong>{title}</strong>{sub && <span>{sub}</span>}</div>
      <button type="button" className="st-iconbtn" aria-label={t("close")} onClick={onClose}>✕</button>
    </header>
  );
}

function SurfacePanel({ id, t, locale }: { id: string } & Tx) {
  const baseline = useStudio((s) => s.baseline);
  const materials = useStudio((s) => s.materials);
  const override = useStudio((s) => s.doc?.overrides[id]);
  const surface = baseline?.surfaces[id];
  const room = surface ? baseline?.rooms[surface.facesRooms[0]] : undefined;
  if (!surface) return null;
  const list = materialsForSurface(materials, surface.type);
  return (
    <aside className="st-ui st-panel" aria-label={t("surface")}>
      <Header title={t(surface.type)} sub={room?.name[locale]} onClose={() => useStudio.getState().select(null)} t={t} />
      <section>
        <h4>{t("material")}</h4>
        <Swatches materials={list} selectedId={override?.material.id} locale={locale} label={t("material")}
          onPick={(m) => useStudio.getState().dispatch({ type: "setSurfaceMaterial", surfaceId: id, material: { id: m.id, version: m.version } })} />
        {override && (
          <button type="button" className="st-link" onClick={() => useStudio.getState().dispatch({ type: "setSurfaceMaterial", surfaceId: id, material: null })}>
            {t("resetSurface")}
          </button>
        )}
      </section>
    </aside>
  );
}

function ItemPanel({ node, t, locale }: { node: ItemNode } & Tx) {
  const catalog = useStudio((s) => s.catalog)!;
  const materials = useStudio((s) => s.materials);
  const doc = useStudio((s) => s.doc)!;
  const baseline = useStudio((s) => s.baseline)!;
  const commit = useStudio((s) => s.commit);
  const manifest = catalog.model(node.catalog);
  const dims = useMemo(() => { try { return manifest ? resolveSize(manifest, node) : null; } catch { return null; } }, [manifest, node]);
  const preview = useMemo(() => (manifest ? previewNode(doc, node, baseline, catalog) : null), [manifest, doc, node, baseline, catalog]);
  if (!manifest || !dims) return null;
  const st = useStudio.getState;
  const cm = (v: number) => Math.round(v * 100);
  const sizing = manifest.sizing;

  return (
    <aside className="st-ui st-panel" aria-label={manifest.name[locale]}>
      <Header title={manifest.name[locale]} sub={t(`cat.${manifest.category}`)} onClose={() => st().select(null)} t={t} />

      <section className="st-dims" aria-label={t("measurements")}>
        <span>{cm(dims.w)}</span>×<span>{cm(dims.d)}</span>×<span>{cm(dims.h)}</span> <small>cm</small>
      </section>

      <section className="st-actions">
        <button type="button" onClick={() => st().rotateSelected(1)} aria-label={t("rotateLeft")} title={t("rotateLeft")}>⟲</button>
        <button type="button" onClick={() => st().rotateSelected(-1)} aria-label={t("rotateRight")} title={t("rotateRight")}>⟳</button>
        <button type="button" onClick={() => st().duplicateSelected()}>{t("duplicate")}</button>
        <button type="button" onClick={() => st().setCatalogOpen(true, node.id)}>{t("replace")}</button>
        <button type="button" className="st-danger" onClick={() => st().removeSelected()}>{t("remove")}</button>
      </section>

      {sizing.mode === "variants" && (
        <section>
          <h4>{t("variant")}</h4>
          <div className="st-chips">
            {sizing.variants.map((v) => (
              <button key={v.id} type="button" className="st-chip" data-on={(node.variantId ?? sizing.defaultVariant ?? sizing.variants[0].id) === v.id || undefined}
                onClick={() => commit({ type: "setVariant", id: node.id, variantId: v.id }, node.id)}>
                {v.label} · {cm(v.dims.w)}×{cm(v.dims.d)}
              </button>
            ))}
          </div>
        </section>
      )}

      {sizing.mode === "modular" && <ModularEditor node={node} sizing={sizing} t={t} />}
      {sizing.mode === "parametric" && <ParamEditor node={node} sizing={sizing} t={t} locale={locale} />}

      {manifest.slots.length > 0 && (
        <section>
          <h4>{t("material")}</h4>
          {manifest.slots.map((slot) => {
            const list = materialsForSlot(materials, slot);
            if (!list.length) return null;
            const current = node.slots[slot.id] ?? slot.default;
            return (
              <div key={slot.id} className="st-slot">
                <label>{slot.label[locale]}</label>
                <Swatches materials={list} selectedId={current?.id} locale={locale} label={`${t("material")}: ${slot.label[locale]}`}
                  onPick={(m) => commit({ type: "setSlotMaterial", id: node.id, slot: slot.id, material: { id: m.id, version: m.version } }, node.id)} />
              </div>
            );
          })}
        </section>
      )}

      <section>
        <h4>{t("hints")}</h4>
        {preview && preview.errors.length + preview.advisories.length === 0 && <p className="st-ok">{t("noIssues")}</p>}
        <ul className="st-issues">
          {/* one line per kind of issue: two neighbours that are both too close read as one hint */}
          {[...new Set(preview?.errors.map((i) => i.code))].map((c) => <li key={`e${c}`} className="st-err">{t(`err.${c}`)}</li>)}
          {[...new Set(preview?.advisories.map((i) => i.code))].map((c) => <li key={`a${c}`} className="st-adv">{t(`adv.${c}`)}</li>)}
        </ul>
      </section>
    </aside>
  );
}

function ModularEditor({ node, sizing, t }: { node: ItemNode; sizing: Modular; t: Tx["t"] }) {
  const commit = useStudio((s) => s.commit);
  const current = node.modules ?? sizing.defaultConfig ?? [];
  const presets = useMemo(() => modularPresets(sizing), [sizing]);
  const setMods = (modules: string[] | null) => { if (modules) commit({ type: "setModules", id: node.id, modules }, node.id); };
  const width = Math.round(current.reduce((s, id) => s + (sizing.modules.find((m) => m.id === id)?.width ?? 0), 0) * 100);
  return (
    <section>
      <h4>{t("configuration")}</h4>
      <div className="st-chips">
        {current.map((id, i) => (
          <span key={`${id}-${i}`} className="st-chip st-chip--mod">
            {moduleLabel(t, id)}
            {i > 0 && i < current.length - 1 && (
              <button type="button" aria-label={t("removeModule")} onClick={() => setMods(withoutModule(sizing, current, i))}>✕</button>
            )}
          </span>
        ))}
      </div>
      <div className="st-chips">
        {insertableModules(sizing).map((id) => (
          <button key={id} type="button" className="st-chip" onClick={() => setMods(withInserted(sizing, current, id))}>+ {moduleLabel(t, id)}</button>
        ))}
      </div>
      <h4>{t("presets")}</h4>
      <div className="st-chips">
        {presets.map((p) => (
          <button key={p.width} type="button" className="st-chip" data-on={Math.abs(p.width * 100 - width) < 1 || undefined} onClick={() => setMods(p.modules)}>
            {Math.round(p.width * 100)}
          </button>
        ))}
      </div>
    </section>
  );
}

function ParamEditor({ node, sizing, t, locale }: { node: ItemNode; sizing: Parametric; t: Tx["t"]; locale: "he" | "en" }) {
  const commit = useStudio((s) => s.commit);
  const [local, setLocal] = useState<Record<string, number>>({});
  return (
    <section>
      <h4>{t("size")}</h4>
      {sizing.params.map((p) => {
        const value = local[p.id] ?? node.params?.[p.id] ?? p.default;
        const send = () => commit({ type: "setParams", id: node.id, params: { [p.id]: value } }, node.id);
        return (
          <div key={p.id} className="st-slot">
            <label>{p.label[locale]} · {p.unit === "m" ? `${Math.round(value * 100)} cm` : value}</label>
            <input type="range" min={p.min} max={p.max} step={p.step} value={value}
              onChange={(e) => setLocal({ ...local, [p.id]: Number(e.target.value) })} onPointerUp={send} onKeyUp={send} onBlur={send} />
          </div>
        );
      })}
    </section>
  );
}
