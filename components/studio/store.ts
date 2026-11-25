"use client";
/**
 * The single source of truth for the studio: one design document, edited only
 * through the command engine (lib/studio/commands). Walk / Design / Plan modes
 * all read this store, so switching modes never loses a change.
 */
import { create } from "zustand";
import type { Baseline } from "@/lib/studio/baseline/fromTwin";
import { apply, CommandError } from "@/lib/studio/commands/apply";
import { History } from "@/lib/studio/commands/history";
import type { Command } from "@/lib/studio/commands/types";
import { catalogFrom, type CatalogLookup, type MaterialManifest, type ModelManifest } from "@/lib/studio/schema/catalog";
import { emptyDocument, type BaselineRef, type DesignDocument } from "@/lib/studio/schema/document";

export type Mode = "walk" | "design" | "plan";
export type Quality = "auto" | "low" | "medium" | "high";
export type Tier = "low" | "medium" | "high";

export type Lighting = { sun: number; maskLo: number; maskHi: number; shadowOpacity: number; ao: boolean };
export const DEFAULT_LIGHTING: Lighting = { sun: 2.2, maskLo: 0.35, maskHi: 0.6, shadowOpacity: 0.6, ao: true };

interface StudioState {
  ready: boolean;
  mode: Mode;
  quality: Quality;
  tier: Tier;
  lighting: Lighting;
  baseline: Baseline | null;
  catalog: CatalogLookup | null;
  models: ModelManifest[];
  materials: MaterialManifest[];
  doc: DesignDocument | null;
  canUndo: boolean;
  canRedo: boolean;
  selection: string | null;
  lastError: string | null;
  init(a: { baseline: Baseline; ref: BaselineRef; models: ModelManifest[]; materials: MaterialManifest[]; mobile: boolean }): void;
  /** Applies a command; returns false (and sets lastError) when the engine refuses it. */
  dispatch(cmd: Command): boolean;
  undo(): void;
  redo(): void;
  setMode(m: Mode): void;
  setQuality(q: Quality): void;
  setTier(t: Tier): void;
  setLighting(p: Partial<Lighting>): void;
  select(id: string | null): void;
}

let history: History | null = null;

export const useStudio = create<StudioState>((set, get) => {
  const sync = () => set({ doc: history!.doc, canUndo: history!.canUndo, canRedo: history!.canRedo });
  return {
    ready: false, mode: "walk", quality: "auto", tier: "high", lighting: DEFAULT_LIGHTING,
    baseline: null, catalog: null, models: [], materials: [], doc: null,
    canUndo: false, canRedo: false, selection: null, lastError: null,

    init({ baseline, ref, models, materials, mobile }) {
      const catalog = catalogFrom(models, materials);
      history = new History(emptyDocument(ref), { baseline, catalog });
      set({
        ready: true, baseline, catalog, models, materials, doc: history.doc, canUndo: false, canRedo: false,
        tier: mobile ? "medium" : "high", selection: null, lastError: null,
      });
    },
    dispatch(cmd) {
      if (!history) return false;
      try {
        history.do(cmd);
        sync();
        set({ lastError: null });
        return true;
      } catch (e) {
        if (e instanceof CommandError) { set({ lastError: e.message }); return false; }
        throw e;
      }
    },
    undo() { history?.undo(); if (history) sync(); },
    redo() { history?.redo(); if (history) sync(); },
    setMode: (mode) => set({ mode }),
    setQuality: (quality) => set({ quality, ...(quality !== "auto" ? { tier: quality } : {}) }),
    setTier: (tier) => { if (get().quality === "auto") set({ tier }); },
    setLighting: (p) => set({ lighting: { ...get().lighting, ...p } }),
    select: (selection) => set({ selection }),
  };
});

/** Dry-run: would this command be accepted? (used by drag previews and the AI preview later) */
export function wouldAccept(cmd: Command): boolean {
  const { doc, baseline, catalog } = useStudio.getState();
  if (!doc || !baseline) return false;
  try { apply(doc, cmd, { baseline, catalog: catalog ?? undefined }); return true; } catch { return false; }
}
