"use client";

/**
 * /studio/[slug]: HAVENIQ Design Studio. Walk mode explores the apartment;
 * Design mode edits it in place (click a piece or surface, drag, rotate, add
 * from the catalog, change materials and sizes) on one shared design document
 * with undo/redo and "restore original". Plan mode arrives with M7.
 */
import { useProgress } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import type { WalkData } from "@/lib/experience/types";
import { roomAt, type ProjectExperience } from "@/lib/experience/types";
import type { Baseline } from "@/lib/studio/baseline/fromTwin";
import { MaterialManifest, ModelManifest } from "@/lib/studio/schema/catalog";
import CatalogDrawer from "./panels/CatalogDrawer";
import DesignMenu from "./panels/DesignMenu";
import { reloadFromServer, usePersistence } from "./persist/usePersistence";
import PropertiesPanel from "./panels/PropertiesPanel";
import { StudioCanvas } from "./scene/StudioCanvas";
import { useStudio } from "./store";
import { useT } from "./useT";
import { useWalkInput } from "./useWalkInput";
import "./studio.css";
import "./studio-panels.css";

type Boot = { data: WalkData; uvScales: Record<string, number> };

export default function StudioApp({ experience, sharedToken }: { experience: ProjectExperience; sharedToken?: string }) {
  const { t, locale } = useT();
  const he = locale === "he";
  const { walk } = experience;
  const wrap = useRef<HTMLDivElement>(null);
  const [{ mobile, reduce, debug }] = useState(() => ({
    mobile: typeof window !== "undefined" && (window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 760),
    reduce: typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    debug: typeof window !== "undefined" && window.location.search.includes("debug"),
  }));
  const { input, locked, stickUi, touch } = useWalkInput(wrap, mobile);
  const [boot, setBoot] = useState<Boot | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [room, setRoom] = useState("");
  const ready = useStudio((s) => s.ready);
  const mode = useStudio((s) => s.mode);
  const canUndo = useStudio((s) => s.canUndo);
  const canRedo = useStudio((s) => s.canRedo);
  const quality = useStudio((s) => s.quality);
  const lastError = useStudio((s) => s.lastError);
  const selection = useStudio((s) => s.selection);
  const catalogOpen = useStudio((s) => s.catalogOpen);
  const design = useStudio((s) => s.design);
  const readOnly = design?.mode === "shared-view";
  usePersistence({ baselineId: experience.slug, sharedToken });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const get = async <T,>(url: string) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return (await r.json()) as T; };
        const [data, base, cat, surfaces] = await Promise.all([
          get<WalkData>(`${walk.base}/walk.json`),
          get<{ id: string; version: number; baseline: Baseline }>(`${walk.base}/baseline.json`),
          get<{ models: unknown[]; materials: unknown[] }>(`/studio/catalog/index.json`),
          get<{ materials: Record<string, { uvScale: number }> }>(`${walk.base}/surfaces.json`),
        ]);
        if (cancelled) return;
        const models = cat.models.map((m) => ModelManifest.parse(m));
        const materials = cat.materials.map((m) => MaterialManifest.parse(m));
        useStudio.getState().init({ baseline: base.baseline, ref: { id: base.id, version: base.version, twinHash: base.baseline.twinHash }, models, materials, mobile });
        const uvScales = Object.fromEntries(Object.entries(surfaces.materials).map(([k, v]) => [k, v.uvScale]));
        setRoom(roomAt(walk, data.rooms, data.spawn[0], data.spawn[1]));
        setBoot({ data, uvScales });
        if (debug) {
          const w = window as unknown as { __studio: typeof useStudio; __studioInput: typeof input.current };
          w.__studio = useStudio;
          w.__studioInput = input.current;
        }
      } catch (e) {
        if (!cancelled) setFailed(String((e as Error).message ?? e));
      }
    })();
    return () => { cancelled = true; };
  }, [walk, mobile, debug, input]);

  // keyboard: undo/redo everywhere; editing keys only in Design mode
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea, select")) return;
      const s = useStudio.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.code === "KeyZ") { e.preventDefault(); (e.shiftKey ? s.redo : s.undo)(); return; }
      if (mod && e.code === "KeyY") { e.preventDefault(); s.redo(); return; }
      if (s.mode !== "design") return;
      if (mod && e.code === "KeyD") { e.preventDefault(); s.duplicateSelected(); }
      else if (e.code === "Delete" || e.code === "Backspace") { if (s.selection && !s.selection.startsWith("surface:")) { e.preventDefault(); s.removeSelected(); } }
      else if (e.code === "KeyR") s.rotateSelected(e.shiftKey ? -1 : 1);
      else if (e.code === "Escape") { if (s.catalogOpen) s.setCatalogOpen(false); else s.select(null); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const err = lastError ? (/^[A-Za-z.-]+$/.test(lastError) ? t(lastError) : lastError) : null;
  const hint = mobile ? t("hintTouch") : mode === "design" ? t("hintDesign") : t("hintWalk");
  const title = experience.title[locale];

  return (
    <div ref={wrap} className="st-root" data-mode={mode} data-sheet={(mode === "design" && (selection || catalogOpen)) || undefined} dir={he ? "rtl" : "ltr"} {...touch}>
      <div className="st-stage">
      {boot && ready && (
        <StudioCanvas
          walk={walk} data={boot.data} uvScales={boot.uvScales} input={input} reduce={reduce} mobile={mobile}
          label={title} onRoom={setRoom} onPose={(x, y, yaw) => useStudio.getState().setPose({ x, y, yaw })}
        />
      )}
      </div>
      <Loader text={t("loading")} failed={failed} />

      <div className="st-ui st-top">
        <strong className="st-title">{title}</strong>
        <span className="st-room" aria-live="polite">{walk.rooms[room]?.name[locale]}</span>
        <SaveStatus />
        <div className="st-modes" role="tablist" aria-label="mode">
          <button role="tab" aria-selected={mode === "walk"} onClick={() => useStudio.getState().setMode("walk")}>{t("walk")}</button>
          <button role="tab" aria-selected={mode === "design"} disabled={readOnly} onClick={() => useStudio.getState().setMode("design")}>{t("design")}</button>
          <button role="tab" aria-selected={false} disabled title={t("soon")}>{t("plan")}</button>
        </div>
      </div>

      <div className="st-ui st-bar">
        {mode === "design" && <button type="button" className="st-primary" onClick={() => useStudio.getState().setCatalogOpen(true)}>＋ {t("add")}</button>}
        <button type="button" onClick={() => useStudio.getState().undo()} disabled={!canUndo || readOnly}>{t("undo")}</button>
        <button type="button" onClick={() => useStudio.getState().redo()} disabled={!canRedo || readOnly}>{t("redo")}</button>
        <button type="button" disabled={readOnly} onClick={() => { if (window.confirm(t("restoreConfirm"))) useStudio.getState().dispatch({ type: "restoreBaseline" }); }}>{t("restore")}</button>
        <DesignMenu />
        <select aria-label={t("quality")} value={quality} onChange={(e) => useStudio.getState().setQuality(e.target.value as typeof quality)}>
          <option value="auto">{t("quality")}: {t("auto")}</option>
          <option value="low">{t("lite")}</option>
          <option value="medium">{t("standard")}</option>
          <option value="high">{t("high")}</option>
        </select>
      </div>

      {mode === "design" && <PropertiesPanel />}
      {mode === "design" && <CatalogDrawer />}

      {design?.mode === "shared-view" && <p className="st-ui st-banner">{t("sharedView")}</p>}
      {design?.mode === "shared-edit" && <p className="st-ui st-banner">{t("sharedEdit")}</p>}
      {err && <p className="st-ui st-toast" role="status">{err}</p>}
      {!locked && boot && !selection && <p className="st-ui st-hint">{hint}</p>}
      {mobile && stickUi && (
        <div className="st-stick" style={{ left: stickUi.ox, top: stickUi.oy }} aria-hidden>
          <span style={{ transform: `translate(${stickUi.x * 40}px, ${stickUi.y * 40}px)` }} />
        </div>
      )}
    </div>
  );
}

/** Quiet save state in the top bar (saving is automatic; this only reports it). */
function SaveStatus() {
  const { t } = useT();
  const design = useStudio((s) => s.design);
  if (!design || design.mode === "shared-view") return null;
  const s = design.status;
  const label = s === "saving" ? t("saving") : s === "saved" ? t("savedOk") : s === "offline" ? t("offline") : s === "conflict" ? t("conflict") : s === "local" ? t("localOnly") : s === "error" ? t("saveError") : "";
  if (!label) return null;
  return (
    <span className="st-status" data-state={s} role="status">
      {label}
      {s === "conflict" && <button type="button" className="st-link" onClick={() => void reloadFromServer()}>{t("reload")}</button>}
    </span>
  );
}

function Loader({ text, failed }: { text: string; failed: string | null }) {
  const { progress, active } = useProgress();
  if (failed) return <div className="st-loading" role="alert"><p>{failed}</p></div>;
  if (!active && progress >= 100) return null;
  return (
    <div className="st-loading" role="status" aria-live="polite">
      <div className="st-loading__bar"><span style={{ width: `${progress.toFixed(0)}%` }} /></div>
      <p>{text} {progress.toFixed(0)}%</p>
    </div>
  );
}
