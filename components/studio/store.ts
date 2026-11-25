"use client";
/**
 * The single source of truth for the studio: one design document, edited only
 * through the command engine (lib/studio/commands). Walk / Design / Plan modes
 * all read this store, so switching modes never loses a change. Every edit made
 * by a person goes through `commit`, which validates the result first, so an
 * illegal placement is refused with a reason instead of being applied.
 */
import { create } from "zustand";
import type { Baseline } from "@/lib/studio/baseline/fromTwin";
import { apply, CommandError } from "@/lib/studio/commands/apply";
import { History } from "@/lib/studio/commands/history";
import type { Command } from "@/lib/studio/commands/types";
import { previewNode, previewProposal, type Preview } from "@/lib/studio/design/preview";
import { findFreeSpot, makeItem } from "@/lib/studio/design/spot";
import { rotateBy, snapAngle } from "@/lib/studio/design/snap";
import type { PlanView, ViewKind, Viewport } from "@/lib/studio/plan/view";
import { catalogFrom, type CatalogLookup, type MaterialManifest, type ModelManifest } from "@/lib/studio/schema/catalog";
import { emptyDocument, type BaselineRef, type DesignDocument } from "@/lib/studio/schema/document";
import { newNodeId } from "@/lib/studio/schema/ids";
import type { DesignNode, ItemNode } from "@/lib/studio/schema/nodes";

export type Mode = "walk" | "design" | "plan";
/** Active drawing tool for architectural proposals (partition: first point once placed; opening: pick a wall). */
export type ArchTool = { kind: "partition"; a: [number, number] | null } | { kind: "opening" };
/** Design and Plan both edit the document (same selection, drag, panels); Walk only looks. */
export const isEditing = (m: Mode) => m === "design" || m === "plan";
export type Quality = "auto" | "low" | "medium" | "high";
export type Tier = "low" | "medium" | "high";

export type Lighting = { sun: number; maskLo: number; maskHi: number; shadowOpacity: number; ao: boolean };
export const DEFAULT_LIGHTING: Lighting = { sun: 2.2, maskLo: 0.35, maskHi: 0.6, shadowOpacity: 0.6, ao: true };

/** A transient drag (not in the document until released and accepted). */
export type Drag = { id: string; x: number; y: number; rot: number; preview: Preview };
export type Pose = { x: number; y: number; yaw: number };
/** The saved design this session edits (null = nothing persisted yet). */
export type DesignState = {
  id: string; name: string; revision: number;
  mode: "owner" | "shared-edit" | "shared-view"; token?: string;
  status: "loading" | "saved" | "saving" | "offline" | "conflict" | "error" | "local";
};

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
  /** Item node id, or a baseline surface id ("surface:..."), or null. */
  selection: string | null;
  lastError: string | null;
  drag: Drag | null;
  pose: Pose | null;
  design: DesignState | null;
  catalogOpen: boolean;
  tool: ArchTool | null;
  /** Transient preview of the proposal being drawn (never in the document). */
  ghost: { node: DesignNode; ok: boolean } | null;
  kitchenOpen: boolean;
  /** Floor planner camera (null until the first fit), the stage size in px, dimension overlay on/off. */
  plan: PlanView | null;
  viewport: Viewport;
  showDims: boolean;
  /** Thumbnail rendering (scripts/studio/thumbs.mjs): frame this item on a neutral backdrop, without the shell. */
  thumb: { id: string } | null;
  /** When set, picking a catalog entry replaces this item instead of adding a new one. */
  replaceFor: string | null;
  init(a: { baseline: Baseline; ref: BaselineRef; models: ModelManifest[]; materials: MaterialManifest[]; mobile: boolean }): void;
  /** Applies a command unchecked (used by tests, the AI path and internal moves). Returns false and sets lastError when the engine refuses it. */
  dispatch(cmd: Command): boolean;
  /** Applies a command after validating the item it touches; refuses with a message on a hard placement error. */
  commit(cmd: Command, checkId?: string): boolean;
  undo(): void;
  redo(): void;
  setMode(m: Mode): void;
  setTool(t: ArchTool | null): void;
  setGhost(g: { node: DesignNode; ok: boolean } | null): void;
  setKitchenOpen(open: boolean): void;
  setPlan(p: PlanView | null): void;
  setPlanKind(kind: ViewKind): void;
  setViewport(v: Viewport): void;
  setShowDims(on: boolean): void;
  setQuality(q: Quality): void;
  setTier(t: Tier): void;
  setLighting(p: Partial<Lighting>): void;
  select(id: string | null): void;
  setDrag(d: Drag | null): void;
  setPose(p: Pose): void;
  /** Replaces the whole document (loading a saved design); clears undo history. */
  replaceDocument(doc: DesignDocument, design: DesignState | null): void;
  setDesign(patch: Partial<DesignState>): void;
  setCatalogOpen(open: boolean, replaceFor?: string | null): void;
  setThumb(t: { id: string } | null): void;
  clearError(): void;
  // high-level actions used by buttons, keys and touch
  addFromCatalog(m: ModelManifest): boolean;
  replaceSelected(m: ModelManifest): boolean;
  rotateSelected(steps: number): boolean;
  removeSelected(): boolean;
  duplicateSelected(): boolean;
}

let history: History | null = null;
let errTimer: ReturnType<typeof setTimeout> | undefined;

const itemOf = (doc: DesignDocument | null, id: string | null): ItemNode | null => {
  const n = id && doc ? doc.nodes[id] : null;
  return n && n.kind === "item" ? n : null;
};

export const useStudio = create<StudioState>((set, get) => {
  const sync = () => set({ doc: history!.doc, canUndo: history!.canUndo, canRedo: history!.canRedo });
  const fail = (message: string) => {
    set({ lastError: message });
    clearTimeout(errTimer);
    errTimer = setTimeout(() => set({ lastError: null }), 4000);
    return false;
  };
  return {
    ready: false, mode: "walk", quality: "auto", tier: "high", lighting: DEFAULT_LIGHTING,
    baseline: null, catalog: null, models: [], materials: [], doc: null,
    canUndo: false, canRedo: false, selection: null, lastError: null, drag: null, pose: null, design: null, tool: null, ghost: null, kitchenOpen: false, plan: null, viewport: { w: 1000, h: 600 }, showDims: true,
    catalogOpen: false, replaceFor: null, thumb: null,

    init({ baseline, ref, models, materials, mobile }) {
      const catalog = catalogFrom(models, materials);
      history = new History(emptyDocument(ref), { baseline, catalog });
      set({
        ready: true, baseline, catalog, models, materials, doc: history.doc, canUndo: false, canRedo: false,
        tier: mobile ? "medium" : "high", selection: null, lastError: null, drag: null, catalogOpen: false, replaceFor: null,
      });
    },
    dispatch(cmd) {
      if (!history) return false;
      if (get().design?.mode === "shared-view") return fail("readOnly");
      try {
        history.do(cmd);
        sync();
        set({ lastError: null });
        return true;
      } catch (e) {
        if (e instanceof CommandError) return fail(e.message);
        throw e;
      }
    },
    commit(cmd, checkId) {
      const { doc, baseline, catalog } = get();
      if (!history || !doc || !baseline || !catalog) return false;
      try {
        const next = apply(doc, cmd, { baseline, catalog }).doc;
        const node = itemOf(next, checkId ?? null);
        if (node) {
          const p = previewNode(next, node, baseline, catalog);
          if (!p.ok) return fail(`err.${p.errors[0].code}`);
        }
        const prop = checkId ? next.nodes[checkId] : undefined;
        if (prop && (prop.kind === "partitionProposal" || prop.kind === "openingProposal")) {
          const p = previewProposal(next, prop, baseline, catalog);
          if (!p.ok) return fail(`err.${p.errors[0].code}`);
        }
      } catch (e) {
        if (e instanceof CommandError) return fail(e.message);
        throw e;
      }
      return get().dispatch(cmd);
    },
    undo() { history?.undo(); if (history) { sync(); const sel = get().selection; if (sel && !sel.startsWith("surface:") && !itemOf(history.doc, sel)) set({ selection: null }); } },
    redo() { history?.redo(); if (history) sync(); },
    setPlan: (plan) => set({ plan }),
    setPlanKind: (kind) => set((st) => ({ plan: st.plan ? { ...st.plan, kind } : st.plan })),
    setViewport: (viewport) => set({ viewport }),
    setShowDims: (showDims) => set({ showDims }),
    setTool: (tool) => set({ tool, ghost: null, ...(tool ? { selection: null, catalogOpen: false, kitchenOpen: false } : {}) }),
    setGhost: (ghost) => set({ ghost }),
    setKitchenOpen: (kitchenOpen) => set({ kitchenOpen, ...(kitchenOpen ? { tool: null, ghost: null, selection: null, catalogOpen: false } : {}) }),
    setMode: (mode) => set({ mode, ...(!isEditing(mode) ? { selection: null, drag: null, catalogOpen: false, replaceFor: null, tool: null, ghost: null, kitchenOpen: false } : {}) }),
    setQuality: (quality) => set({ quality, ...(quality !== "auto" ? { tier: quality } : {}) }),
    setTier: (tier) => { if (get().quality === "auto") set({ tier }); },
    setLighting: (p) => set({ lighting: { ...get().lighting, ...p } }),
    select: (selection) => set({ selection }),
    setDrag: (drag) => set({ drag }),
    setPose: (pose) => set({ pose }),
    replaceDocument(doc, design) {
      const { baseline, catalog } = get();
      if (!baseline || !catalog) return;
      history = new History(doc, { baseline, catalog });
      set({ doc, design, canUndo: false, canRedo: false, selection: null, drag: null, lastError: null });
    },
    setDesign: (patch) => { const d = get().design; if (d) set({ design: { ...d, ...patch } }); },
    setCatalogOpen: (catalogOpen, replaceFor = null) => set({ catalogOpen, replaceFor: catalogOpen ? replaceFor : null }),
    setThumb: (thumb) => set({ thumb }),
    clearError: () => set({ lastError: null }),

    addFromCatalog(m) {
      const { doc, baseline, catalog, pose } = get();
      if (!doc || !baseline || !catalog) return false;
      const yaw = pose?.yaw ?? 0;
      const near: [number, number] = pose ? [pose.x - Math.sin(yaw) * 2.6, pose.y + Math.cos(yaw) * 2.6] : [4, 2];
      const rot = snapAngle(yaw + Math.PI); // the front of the new item faces the person adding it
      const spot = findFreeSpot({ doc, baseline, catalog, manifest: m, near, rot });
      if (!spot) return fail("noSpace");
      const node = makeItem(m, spot.x, spot.y, rot, newNodeId());
      if (!get().commit({ type: "add", node }, node.id)) return false;
      set({ selection: node.id, catalogOpen: false, replaceFor: null });
      return true;
    },
    replaceSelected(m) {
      const id = get().selection;
      if (!itemOf(get().doc, id)) return false;
      const ok = get().commit({ type: "replace", id: id!, catalog: { id: m.id, version: m.version } }, id!);
      if (ok) set({ catalogOpen: false, replaceFor: null });
      return ok;
    },
    rotateSelected(steps) {
      const n = itemOf(get().doc, get().selection);
      return n ? get().commit({ type: "rotate", id: n.id, rot: rotateBy(n.transform.rot, steps) }, n.id) : false;
    },
    removeSelected() {
      const sel = get().selection;
      const n = itemOf(get().doc, sel) ?? (sel ? get().doc?.nodes[sel] : undefined);
      if (!n || (n.kind !== "item" && n.kind !== "partitionProposal" && n.kind !== "openingProposal")) return false;
      const ok = get().dispatch({ type: "remove", id: n.id });
      if (ok) set({ selection: null });
      return ok;
    },
    duplicateSelected() {
      const n = itemOf(get().doc, get().selection);
      if (!n) return false;
      const id = newNodeId();
      // try a few offsets until the copy stands somewhere legal
      for (const [dx, dy] of [[0.4, 0.4], [-0.4, 0.4], [0.4, -0.4], [-0.4, -0.4], [0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]]) {
        if (get().commit({ type: "duplicate", id: n.id, newId: id, offset: [dx, dy] }, id)) { set({ selection: id }); return true; }
      }
      return fail("noSpace");
    },
  };
});

/** Dry-run: would this command be accepted? (used by drag previews and the AI preview later) */
export function wouldAccept(cmd: Command): boolean {
  const { doc, baseline, catalog } = useStudio.getState();
  if (!doc || !baseline) return false;
  try { apply(doc, cmd, { baseline, catalog: catalog ?? undefined }); return true; } catch { return false; }
}
