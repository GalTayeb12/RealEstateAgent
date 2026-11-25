/**
 * Pure command application. `apply(doc, cmd, ctx)` returns a new document and
 * the exact inverse command; the input document is never mutated. When a
 * catalog is supplied, asset references, slots, sizes and materials are
 * validated here too, so AI-originated commands cannot smuggle in unknown
 * assets or illegal sizes.
 */
import type { Baseline } from "../baseline/fromTwin";
import { resolveSize, SizingError } from "../catalog/sizing";
import type { MaterialCategory, CatalogLookup, ModelManifest } from "../schema/catalog";
import type { DesignDocument, SurfaceOverride } from "../schema/document";
import { isBaselineId } from "../schema/ids";
import { ItemNode, type DesignNode } from "../schema/nodes";
import type { Command } from "./types";

export type CommandErrorCode =
  | "not-found" | "exists" | "locked" | "unsupported" | "protected" | "unknown-asset"
  | "unknown-slot" | "bad-material" | "bad-size" | "unknown-surface" | "bad-proposal";

export class CommandError extends Error {
  constructor(public code: CommandErrorCode, message: string) {
    super(message);
    this.name = "CommandError";
  }
}

export type ApplyContext = { baseline: Baseline; catalog?: CatalogLookup };
export type ApplyResult = { doc: DesignDocument; inverse: Command };

/** Material categories that make sense on each baseline surface type. */
export const SURFACE_CATEGORIES: Record<"wall" | "floor" | "ceiling", MaterialCategory[]> = {
  wall: ["paint", "wallcovering", "wallpaper", "panel", "tile", "stone", "marble", "porcelain", "microcement", "concrete", "wood"],
  floor: ["parquet", "wood", "tile", "stone", "marble", "porcelain", "concrete", "microcement", "rug"],
  ceiling: ["paint", "panel", "wood"],
};

const setNode = (doc: DesignDocument, node: DesignNode): DesignDocument => ({ ...doc, nodes: { ...doc.nodes, [node.id]: node } });

function dropNode(doc: DesignDocument, id: string): DesignDocument {
  const nodes = { ...doc.nodes };
  delete nodes[id];
  return { ...doc, nodes };
}

function need(doc: DesignDocument, id: string): DesignNode {
  const n = doc.nodes[id];
  if (n) return n;
  if (isBaselineId(id)) throw new CommandError("protected", `"${id}" belongs to the original property and cannot be edited as a design node.`);
  throw new CommandError("not-found", `No design node "${id}".`);
}

function needItem(doc: DesignDocument, id: string): ItemNode {
  const n = need(doc, id);
  if (n.kind !== "item") throw new CommandError("unsupported", `"${id}" is a ${n.kind}, not an item.`);
  return n;
}

function assertUnlocked(n: DesignNode) {
  if (n.locked) throw new CommandError("locked", `"${n.id}" is locked.`);
}

function modelFor(ctx: ApplyContext, ref: { id: string; version: number }): ModelManifest | undefined {
  if (!ctx.catalog) return undefined;
  const m = ctx.catalog.model(ref);
  if (!m) throw new CommandError("unknown-asset", `Unknown catalog asset "${ref.id}@${ref.version}".`);
  return m;
}

function checkItem(ctx: ApplyContext, n: ItemNode) {
  const m = modelFor(ctx, n.catalog);
  if (!m) return;
  try {
    resolveSize(m, n);
  } catch (e) {
    if (e instanceof SizingError) throw new CommandError("bad-size", e.message);
    throw e;
  }
  for (const [slotId, ref] of Object.entries(n.slots)) {
    const slot = m.slots.find((s) => s.id === slotId);
    if (!slot) throw new CommandError("unknown-slot", `"${m.id}" has no material slot "${slotId}".`);
    const mat = ctx.catalog!.material(ref);
    if (!mat) throw new CommandError("unknown-asset", `Unknown material "${ref.id}@${ref.version}".`);
    if (!slot.allowed.includes(mat.category)) {
      throw new CommandError("bad-material", `Slot "${slotId}" does not accept ${mat.category} materials.`);
    }
  }
}

function checkProposal(ctx: ApplyContext, n: DesignNode) {
  if (n.kind === "partitionProposal") {
    if (Math.hypot(n.b[0] - n.a[0], n.b[1] - n.a[1]) < 0.2) throw new CommandError("bad-proposal", "A partition proposal must be at least 20 cm long.");
  } else if (n.kind === "openingProposal") {
    const w = ctx.baseline.walls[n.wallId];
    if (!w) throw new CommandError("bad-proposal", `Opening proposal refers to unknown wall "${n.wallId}".`);
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    if (n.at - n.width / 2 < 0 || n.at + n.width / 2 > len) throw new CommandError("bad-proposal", "The proposed opening does not fit inside the wall.");
  }
}

function shift(n: DesignNode, dx: number, dy: number): DesignNode {
  if (n.kind === "item") return { ...n, transform: { ...n.transform, x: n.transform.x + dx, y: n.transform.y + dy } };
  if (n.kind === "light") return { ...n, position: [n.position[0] + dx, n.position[1] + dy, n.position[2]] };
  throw new CommandError("unsupported", `A ${n.kind} cannot be duplicated.`);
}

export function apply(doc: DesignDocument, cmd: Command, ctx: ApplyContext): ApplyResult {
  switch (cmd.type) {
    case "add": {
      if (doc.nodes[cmd.node.id]) throw new CommandError("exists", `Node "${cmd.node.id}" already exists.`);
      if (isBaselineId(cmd.node.id)) throw new CommandError("protected", "Design nodes cannot use baseline ids.");
      if (cmd.node.kind === "item") checkItem(ctx, cmd.node);
      checkProposal(ctx, cmd.node);
      return { doc: setNode(doc, cmd.node), inverse: { type: "remove", id: cmd.node.id } };
    }
    case "remove": {
      const n = need(doc, cmd.id);
      assertUnlocked(n);
      return { doc: dropNode(doc, cmd.id), inverse: { type: "add", node: n } };
    }
    case "duplicate": {
      const n = need(doc, cmd.id);
      if (doc.nodes[cmd.newId]) throw new CommandError("exists", `Node "${cmd.newId}" already exists.`);
      const [dx, dy] = cmd.offset ?? [0.3, 0.3];
      const copy = { ...shift(n, dx, dy), id: cmd.newId, locked: false } as DesignNode;
      return { doc: setNode(doc, copy), inverse: { type: "remove", id: cmd.newId } };
    }
    case "move": {
      const n = need(doc, cmd.id);
      assertUnlocked(n);
      let next: DesignNode;
      if (n.kind === "item") next = { ...n, transform: { ...n.transform, x: cmd.x, y: cmd.y, z: cmd.z ?? n.transform.z } };
      else if (n.kind === "light") next = { ...n, position: [cmd.x, cmd.y, cmd.z ?? n.position[2]] };
      else throw new CommandError("unsupported", `A ${n.kind} cannot be moved with "move".`);
      return { doc: setNode(doc, next), inverse: { type: "setNode", node: n } };
    }
    case "rotate": {
      const n = needItem(doc, cmd.id);
      assertUnlocked(n);
      return { doc: setNode(doc, { ...n, transform: { ...n.transform, rot: cmd.rot } }), inverse: { type: "setNode", node: n } };
    }
    case "setVariant": {
      const n = needItem(doc, cmd.id);
      assertUnlocked(n);
      const next: ItemNode = { ...n, variantId: cmd.variantId };
      checkItem(ctx, next);
      return { doc: setNode(doc, next), inverse: { type: "setNode", node: n } };
    }
    case "setModules": {
      const n = needItem(doc, cmd.id);
      assertUnlocked(n);
      const next: ItemNode = { ...n, modules: cmd.modules };
      checkItem(ctx, next);
      return { doc: setNode(doc, next), inverse: { type: "setNode", node: n } };
    }
    case "setParams": {
      const n = needItem(doc, cmd.id);
      assertUnlocked(n);
      const next: ItemNode = { ...n, params: { ...n.params, ...cmd.params } };
      checkItem(ctx, next);
      return { doc: setNode(doc, next), inverse: { type: "setNode", node: n } };
    }
    case "setSlotMaterial": {
      const n = needItem(doc, cmd.id);
      assertUnlocked(n);
      const slots = { ...n.slots };
      if (cmd.material) slots[cmd.slot] = cmd.material;
      else delete slots[cmd.slot];
      const next: ItemNode = { ...n, slots };
      checkItem(ctx, next);
      return { doc: setNode(doc, next), inverse: { type: "setNode", node: n } };
    }
    case "setSurfaceMaterial": {
      const surface = ctx.baseline.surfaces[cmd.surfaceId];
      if (!surface) throw new CommandError("unknown-surface", `Unknown surface "${cmd.surfaceId}".`);
      if (!surface.paintable) throw new CommandError("unsupported", "Glass and railings have no paintable surface.");
      if (cmd.material && ctx.catalog) {
        const mat = ctx.catalog.material(cmd.material);
        if (!mat) throw new CommandError("unknown-asset", `Unknown material "${cmd.material.id}@${cmd.material.version}".`);
        if (!SURFACE_CATEGORIES[surface.type].includes(mat.category)) {
          throw new CommandError("bad-material", `${mat.category} is not suitable for a ${surface.type}.`);
        }
      }
      const prev = doc.overrides[cmd.surfaceId];
      const overrides = { ...doc.overrides };
      if (cmd.material) overrides[cmd.surfaceId] = { material: cmd.material };
      else delete overrides[cmd.surfaceId];
      return {
        doc: { ...doc, overrides },
        inverse: { type: "setSurfaceMaterial", surfaceId: cmd.surfaceId, material: prev ? prev.material : null },
      };
    }
    case "replace": {
      const n = needItem(doc, cmd.id);
      assertUnlocked(n);
      const m = modelFor(ctx, cmd.catalog);
      const next: ItemNode = {
        id: n.id, kind: "item", locked: false, label: n.label, catalog: cmd.catalog, slots: {},
        transform: n.transform,
        modules: m && m.sizing.mode === "modular" ? m.sizing.defaultConfig : undefined,
      };
      checkItem(ctx, next);
      return { doc: setNode(doc, next), inverse: { type: "setNode", node: n } };
    }
    case "setNode": {
      const prev = doc.nodes[cmd.node.id];
      return { doc: setNode(doc, cmd.node), inverse: prev ? { type: "setNode", node: prev } : { type: "remove", id: cmd.node.id } };
    }
    case "restoreBaseline": {
      return {
        doc: { ...doc, nodes: {}, overrides: {} },
        inverse: { type: "restoreSnapshot", nodes: doc.nodes, overrides: doc.overrides },
      };
    }
    case "restoreSnapshot": {
      return {
        doc: { ...doc, nodes: cmd.nodes, overrides: cmd.overrides as Record<string, SurfaceOverride> },
        inverse: { type: "restoreSnapshot", nodes: doc.nodes, overrides: doc.overrides },
      };
    }
    case "batch": {
      let cur = doc;
      const inverses: Command[] = [];
      for (const c of cmd.commands) {
        const r = apply(cur, c, ctx);
        cur = r.doc;
        inverses.push(r.inverse);
      }
      return { doc: cur, inverse: { type: "batch", label: cmd.label, commands: inverses.reverse() } };
    }
  }
}
