"use client";

/**
 * /studio/[slug]: HAVENIQ Design Studio. M3 delivers the foundation (live
 * furniture on the baked shell, lighting, adaptive quality, undo/redo and
 * restore-original on one shared document). Design and Plan modes arrive in
 * M5/M7; the mode switch is already part of the shell.
 */
import { useProgress } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/LocaleProvider";
import type { WalkData } from "@/lib/experience/types";
import { roomAt, type ProjectExperience } from "@/lib/experience/types";
import type { Baseline } from "@/lib/studio/baseline/fromTwin";
import { MaterialManifest, ModelManifest } from "@/lib/studio/schema/catalog";
import { StudioCanvas } from "./scene/StudioCanvas";
import { useStudio } from "./store";
import { useWalkInput } from "./useWalkInput";
import "./studio.css";

type Boot = { data: WalkData; uvScales: Record<string, number> };

export default function StudioApp({ experience }: { experience: ProjectExperience }) {
  const { locale } = useI18n();
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
  const { mode, setMode, canUndo, canRedo, undo, redo, dispatch, lastError } = useStudio();

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

  // keyboard shortcuts: undo / redo
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea, select")) return;
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") { e.preventDefault(); (e.shiftKey ? redo : undo)(); }
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyY") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [undo, redo]);

  const T = he
    ? { title: experience.title.he, undo: "ביטול", redo: "שחזור", restore: "שחזור המצב המקורי", walk: "הליכה", design: "עיצוב", plan: "תוכנית", soon: "בקרוב", load: "טוענים את הסטודיו…" }
    : { title: experience.title.en, undo: "Undo", redo: "Redo", restore: "Restore original", walk: "Walk", design: "Design", plan: "Plan", soon: "Soon", load: "Loading the studio…" };

  return (
    <div ref={wrap} className="st-root" dir={he ? "rtl" : "ltr"} {...touch}>
      {boot && ready && (
        <StudioCanvas
          walk={walk} data={boot.data} uvScales={boot.uvScales} input={input} reduce={reduce} mobile={mobile}
          label={T.title} onRoom={setRoom} onPose={() => {}}
        />
      )}
      <Loader text={T.load} failed={failed} />

      <div className="st-ui st-top">
        <strong className="st-title">{T.title}</strong>
        <span className="st-room" aria-live="polite">{walk.rooms[room]?.name[he ? "he" : "en"]}</span>
        <div className="st-modes" role="tablist" aria-label="mode">
          <button role="tab" aria-selected={mode === "walk"} onClick={() => setMode("walk")}>{T.walk}</button>
          <button role="tab" aria-selected={false} disabled title={T.soon}>{T.design}</button>
          <button role="tab" aria-selected={false} disabled title={T.soon}>{T.plan}</button>
        </div>
      </div>

      <div className="st-ui st-bar">
        <button onClick={undo} disabled={!canUndo}>{T.undo}</button>
        <button onClick={redo} disabled={!canRedo}>{T.redo}</button>
        <button onClick={() => dispatch({ type: "restoreBaseline" })}>{T.restore}</button>
      </div>

      {lastError && <p className="st-ui st-toast" role="status">{lastError}</p>}
      {!locked && !mobile && boot && <p className="st-ui st-hint">{he ? "חיצים / WASD ללכת · לחצו וגררו כדי להסתכל" : "Arrows / WASD to walk · click & drag to look"}</p>}
      {mobile && stickUi && (
        <div className="st-stick" style={{ left: stickUi.ox, top: stickUi.oy }} aria-hidden>
          <span style={{ transform: `translate(${stickUi.x * 40}px, ${stickUi.y * 40}px)` }} />
        </div>
      )}
    </div>
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
