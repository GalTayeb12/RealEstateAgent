"use client";

/**
 * /studio/[slug]: HAVENIQ Design Studio. Walk mode explores the apartment;
 * Design mode edits it in place (click a piece or surface, drag, rotate, add
 * from the catalog, change materials and sizes) on one shared design document
 * with undo/redo and "restore original". Plan mode is the same document seen from above
 * (top or isometric, orthographic) with dimensions, areas and door swings.
 */
import { useProgress } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import type { WalkData } from "@/lib/experience/types";
import { roomAt, type ProjectExperience } from "@/lib/experience/types";
import type { Baseline } from "@/lib/studio/baseline/fromTwin";
import { MaterialManifest, ModelManifest } from "@/lib/studio/schema/catalog";
import { DesignDocument } from "@/lib/studio/schema/document";
import AiPanel from "./panels/AiPanel";
import { ArchitectureMenu, KitchenPanel } from "./panels/ArchitecturePanels";
import CatalogDrawer from "./panels/CatalogDrawer";
import DesignMenu from "./panels/DesignMenu";
import { StillButton, StillOverlay } from "./panels/StillPanel";
import { persistState, reloadFromServer, usePersistence } from "./persist/usePersistence";
import PropertiesPanel from "./panels/PropertiesPanel";
import { StudioCanvas } from "./scene/StudioCanvas";
import { fitView } from "@/lib/studio/plan/view";
import PlanOverlay from "./plan/PlanOverlay";
import PlanToolbar from "./plan/PlanToolbar";
import { usePlanGestures } from "./plan/usePlanGestures";
import { isEditing, useStudio } from "./store";
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
  const [{ mobile, reduce, debug, noSeed }] = useState(() => ({
    mobile: typeof window !== "undefined" && (window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 760),
    reduce: typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    debug: typeof window !== "undefined" && window.location.search.includes("debug"),
    // ?seed=none opens the empty apartment instead of the developer's design (tests, support, a clean start)
    noSeed: typeof window !== "undefined" && new URLSearchParams(window.location.search).get("seed") === "none",
  }));
  const { input, teleport, locked, stickUi, touch } = useWalkInput(wrap, mobile);
  const [boot, setBoot] = useState<Boot | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [room, setRoom] = useState("");
  const ready = useStudio((s) => s.ready);
  const mode = useStudio((s) => s.mode);
  const canUndo = useStudio((s) => s.canUndo);
  const hasSeed = useStudio((s) => !!s.seed);
  const canRedo = useStudio((s) => s.canRedo);
  const quality = useStudio((s) => s.quality);
  const lastError = useStudio((s) => s.lastError);
  const selection = useStudio((s) => s.selection);
  const catalogOpen = useStudio((s) => s.catalogOpen);
  const tool = useStudio((s) => s.tool);
  const kitchenOpen = useStudio((s) => s.kitchenOpen);
  const aiOpen = useStudio((s) => s.aiOpen);
  const hasConcept = useStudio((s) => !!s.doc && Object.values(s.doc.nodes).some((n) => n.kind === "partitionProposal" || n.kind === "openingProposal"));
  const design = useStudio((s) => s.design);
  const readOnly = design?.mode === "shared-view";
  usePersistence({ baselineId: experience.slug, sharedToken });
  const editing = isEditing(mode);
  usePlanGestures(wrap, mode === "plan");

  // stage size feeds the plan projection (camera and SVG overlay use the same numbers)
  useEffect(() => {
    const el = wrap.current?.querySelector(".st-stage");
    if (!el) return;
    const sync = () => { const r = el.getBoundingClientRect(); if (r.width > 0) useStudio.getState().setViewport({ w: r.width, h: r.height }); };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [boot]);

  // entering Plan frames the whole apartment; leaving it puts the walker back where they stood
  useEffect(() => {
    const s = useStudio.getState();
    if (mode === "plan" && s.baseline) {
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      for (const r of Object.values(s.baseline.rooms)) for (const [x, y] of r.polygon) { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); }
      s.setPlan(fitView(s.plan?.kind ?? "top", [x1, y1, x2, y2], 1.25, s.viewport, 0.1));
    } else if (mode !== "plan" && s.pose) {
      teleport(s.pose.x, s.pose.y, s.pose.yaw);
    }
  }, [mode, teleport]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const get = async <T,>(url: string) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return (await r.json()) as T; };
        const [data, base, cat, surfaces, seedRaw] = await Promise.all([
          get<WalkData>(`${walk.base}/walk.json`),
          get<{ id: string; version: number; baseline: Baseline }>(`${walk.base}/baseline.json`),
          // the latest published release (admin catalog); the static repository snapshot if the API is unavailable
          get<{ models: unknown[]; materials: unknown[]; retired?: string[] }>(`/api/studio/catalog`).catch(() => get<{ models: unknown[]; materials: unknown[]; retired?: string[] }>(`/studio/catalog/index.json`)),
          get<{ materials: Record<string, { uvScale: number }> }>(`${walk.base}/surfaces.json`),
          // the developer's design for this apartment (optional: not every apartment has one)
          noSeed ? Promise.resolve(null) : get<unknown>(`${walk.base}/seed-design.json`).catch(() => null),
        ]);
        if (cancelled) return;
        const models = cat.models.map((m) => ModelManifest.parse(m));
        const materials = cat.materials.map((m) => MaterialManifest.parse(m));
        const parsedSeed = seedRaw ? DesignDocument.safeParse(seedRaw) : null;
        useStudio.getState().init({ baseline: base.baseline, ref: { id: base.id, version: base.version, twinHash: base.baseline.twinHash }, models, materials, mobile, retired: cat.retired ?? [], seed: parsedSeed?.success ? parsedSeed.data : null });
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
  }, [walk, mobile, debug, noSeed, input]);

  // keyboard: undo/redo everywhere; editing keys only in Design mode
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea, select")) return;
      const s = useStudio.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.code === "KeyZ") { e.preventDefault(); (e.shiftKey ? s.redo : s.undo)(); return; }
      if (mod && e.code === "KeyY") { e.preventDefault(); s.redo(); return; }
      if (!isEditing(s.mode)) return;
      if (mod && e.code === "KeyD") { e.preventDefault(); s.duplicateSelected(); }
      else if (e.code === "Delete" || e.code === "Backspace") { if (s.selection && !s.selection.startsWith("surface:")) { e.preventDefault(); s.removeSelected(); } }
      else if (e.code === "KeyR") s.rotateSelected(e.shiftKey ? -1 : 1);
      else if (e.code === "Escape") { if (s.tool) s.setTool(null); else if (s.kitchenOpen) s.setKitchenOpen(false); else if (s.catalogOpen) s.setCatalogOpen(false); else s.select(null); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const err = lastError ? (/^[A-Za-z.-]+$/.test(lastError) ? t(lastError) : lastError) : null;
  const toolHint = tool ? (tool.kind === "opening" ? t("toolOpening") : tool.a ? t("toolPartition2") : t("toolPartition1")) : null;
  const hint = toolHint ?? (mode === "plan" ? (mobile ? t("hintPlanTouch") : t("hintPlan")) : mobile ? t("hintTouch") : mode === "design" ? t("hintDesign") : t("hintWalk"));
  const title = experience.title[locale];

  return (
    <div ref={wrap} className="st-root" data-mode={mode} data-sheet={(editing && (selection || catalogOpen || kitchenOpen)) || aiOpen || undefined} dir={he ? "rtl" : "ltr"} {...touch}>
      <div className="st-stage">
      {boot && ready && (
        <StudioCanvas
          walk={walk} data={boot.data} uvScales={boot.uvScales} input={input} reduce={reduce} mobile={mobile}
          label={title} onRoom={setRoom} onPose={(x, y, yaw) => useStudio.getState().setPose({ x, y, yaw })}
        />
      )}
      {mode === "plan" && <PlanOverlay />}
      </div>
      <Loader text={t("loading")} failed={failed} />

      <div className="st-ui st-top">
        <button type="button" className="st-back" onClick={goBack}>{he ? "→" : "←"} {t("back")}</button>
        <strong className="st-title">{title}</strong>
        <span className="st-room" aria-live="polite">{walk.rooms[room]?.name[locale]}</span>
        <SaveStatus />
        <div className="st-modes" role="tablist" aria-label="mode">
          <button role="tab" aria-selected={mode === "walk"} onClick={() => useStudio.getState().setMode("walk")}>{t("walk")}</button>
          <button role="tab" aria-selected={mode === "design"} disabled={readOnly} onClick={() => useStudio.getState().setMode("design")}>{t("design")}</button>
          <button role="tab" aria-selected={mode === "plan"} onClick={() => useStudio.getState().setMode("plan")}>{t("plan")}</button>
        </div>
      </div>

      <div className="st-ui st-bar">
        {editing && !readOnly && <button type="button" className="st-primary" onClick={() => useStudio.getState().setCatalogOpen(true)}>＋ {t("add")}</button>}
        <button type="button" onClick={() => useStudio.getState().undo()} disabled={!canUndo || readOnly}>{t("undo")}</button>
        <button type="button" onClick={() => useStudio.getState().redo()} disabled={!canRedo || readOnly}>{t("redo")}</button>
        {hasSeed && <button type="button" disabled={readOnly} onClick={() => { if (window.confirm(t("seedConfirm"))) useStudio.getState().resetToSeed(); }}>{t("seed")}</button>}
        <button type="button" disabled={readOnly} onClick={() => { if (window.confirm(t("restoreConfirm"))) useStudio.getState().dispatch({ type: "restoreBaseline" }); }}>{t("restore")}</button>
        {editing && !readOnly && <ArchitectureMenu />}
        {!readOnly && <button type="button" className="st-ai-btn" aria-pressed={aiOpen} onClick={() => useStudio.getState().setAiOpen(!aiOpen)}>✦ {t("ai.open")}</button>}
        <SaveButton />
        <DesignMenu />
        <StillButton disabled={!ready} />
        <select aria-label={t("quality")} value={quality} onChange={(e) => useStudio.getState().setQuality(e.target.value as typeof quality)}>
          <option value="auto">{t("quality")}: {t("auto")}</option>
          <option value="low">{t("lite")}</option>
          <option value="medium">{t("standard")}</option>
          <option value="high">{t("high")}</option>
        </select>
      </div>

      {mode === "plan" && <PlanToolbar />}
      {editing && !aiOpen && <PropertiesPanel />}
      {editing && <CatalogDrawer />}
      {editing && <KitchenPanel />}
      {!readOnly && <AiPanel slug={walk.base.split("/").filter(Boolean).pop() ?? experience.slug} />}

      <StillOverlay designName={design?.name ?? null} />
      {hasConcept && <p className="st-ui st-banner st-banner--concept">{t("conceptBanner")}</p>}
      {design?.mode === "shared-view" && <p className="st-ui st-banner">{t("sharedView")}</p>}
      {design?.mode === "shared-edit" && <p className="st-ui st-banner">{t("sharedEdit")}</p>}
      {err && <p className="st-ui st-toast" role="status">{err}</p>}
      {!locked && boot && !aiOpen && (tool || !selection) && <p className="st-ui st-hint">{hint}</p>}
      {mobile && stickUi && (
        <div className="st-stick" style={{ left: stickUi.ox, top: stickUi.oy }} aria-hidden>
          <span style={{ transform: `translate(${stickUi.x * 40}px, ${stickUi.y * 40}px)` }} />
        </div>
      )}
    </div>
  );
}

/** Back to the page the buyer came from (the tour, the building page), else the projects list. */
function goBack() {
  if (window.history.length > 1) window.history.back();
  else window.location.href = "/results";
}

/** Explicit save: the design is private to the signed-in person; autosave still runs, this just does it now. */
function SaveButton() {
  const { t } = useT();
  const design = useStudio((s) => s.design);
  if (!design || design.mode === "shared-view") return null;
  const busy = design.status === "saving";
  return (
    <button type="button" className="st-save" disabled={busy || design.status === "conflict"} title={design.status === "local" ? t("localOnly") : undefined} onClick={() => void persistState.saveNow?.()}>
      {busy ? t("saving") : design.status === "saved" ? `✓ ${t("savedOk")}` : t("save")}
    </button>
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
