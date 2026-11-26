/**
 * AiPlan -> one validated command batch (a single undo step).
 *
 * Each action is compiled on its own against the document as it stands after the previous accepted
 * actions, applied through the catalog-aware command engine, and validated with the editor's own
 * rules (`validateDocument`, `validateProposals`). An action is accepted only if it introduces no
 * new hard error; otherwise it is dropped with a reason code and the rest of the plan goes on.
 * Catalog ids are resolved to the published version on the server, node ids are minted here, so
 * the client never receives an unknown asset, an invented id or an illegal size.
 */
import type { Baseline, BaselineRoom } from "../baseline/fromTwin";
import { resolveSize, SizingError } from "../catalog/sizing";
import { apply, CommandError } from "../commands/apply";
import type { Command } from "../commands/types";
import { proposeKitchenLayouts } from "../design/kitchen";
import { makeItem } from "../design/spot";
import { snapAngle } from "../design/snap";
import type { CatalogLookup, MaterialManifest, ModelManifest } from "../schema/catalog";
import type { DesignDocument } from "../schema/document";
import { newNodeId } from "../schema/ids";
import type { ItemNode } from "../schema/nodes";
import { validateProposals } from "../validation/architecture";
import { errorsOf, advisoriesOf, validateDocument, type Issue } from "../validation/placement";
import type { AiAction, AiPlan } from "./plan";
import { againstWall, freeSpot, nearItem } from "./place";

export type DropReason =
  | "unknown-asset" | "unknown-material" | "unknown-room" | "unknown-target" | "unknown-slot"
  | "no-space" | "no-layout" | "bad-size" | "not-allowed" | `err.${string}`;

export type Dropped = { index: number; op: AiAction["op"]; reason: DropReason; detail?: string };

export type Proposal = {
  summary: string;
  /** The whole accepted plan as ONE batch (one undo step), or null when nothing survived. */
  command: Extract<Command, { type: "batch" }> | null;
  /** Indexes of the plan's actions that were accepted. */
  accepted: number[];
  dropped: Dropped[];
  /** Node ids added, changed or removed, and surface ids restyled, compared with the input document. */
  added: string[];
  changed: string[];
  removed: string[];
  surfaces: string[];
  /** Advisories (hints, not errors) on the nodes the plan touched. */
  advisories: Issue[];
};

export type CompileContext = {
  doc: DesignDocument; baseline: Baseline; catalog: CatalogLookup;
  models: ModelManifest[]; materials: MaterialManifest[];
  newId?: () => string;
};

const DEG = Math.PI / 180;
const issueKey = (i: Issue) => `${i.code}|${i.nodeId}|${i.otherId ?? ""}`;

/** Newest published version of a catalog id. */
function latest<T extends { id: string; version: number }>(list: T[], id: string): T | undefined {
  return list.filter((m) => m.id === id).sort((a, b) => b.version - a.version)[0];
}

function roomOf(baseline: Baseline, id: string): BaselineRoom | undefined {
  return baseline.rooms[id] ?? baseline.rooms[`room:${id}`];
}

function allErrors(doc: DesignDocument, baseline: Baseline, catalog: CatalogLookup): Issue[] {
  return [...errorsOf(validateDocument(doc, baseline, catalog)), ...errorsOf(validateProposals(doc, baseline, catalog))];
}

class Drop extends Error {
  constructor(public reason: DropReason, public detail?: string) { super(reason); }
}

export function compilePlan(plan: AiPlan, ctx: CompileContext): Proposal {
  const { baseline, catalog, models, materials } = ctx;
  const mint = ctx.newId ?? (() => newNodeId());
  const refs = new Map<string, string>();
  let doc = ctx.doc;
  const commands: Command[] = [];
  const accepted: number[] = [];
  const dropped: Dropped[] = [];

  const target = (t: string): ItemNode => {
    const id = refs.get(t) ?? t;
    const n = doc.nodes[id];
    if (!n || n.kind !== "item") throw new Drop("unknown-target", t);
    return n;
  };
  const material = (id: string) => {
    const m = latest(materials, id);
    if (!m) throw new Drop("unknown-material", id);
    return { id: m.id, version: m.version };
  };

  const compileAction = (a: AiAction): Command[] => {
    switch (a.op) {
      case "place": {
        const manifest = latest(models, a.catalogId);
        if (!manifest) throw new Drop("unknown-asset", a.catalogId);
        const room = roomOf(baseline, a.room);
        if (!room) throw new Drop("unknown-room", a.room);
        const s = manifest.sizing;
        const base: Partial<ItemNode> = {};
        if (a.size?.variantId) { if (s.mode !== "variants") throw new Drop("bad-size", "variant"); base.variantId = a.size.variantId; }
        if (a.size?.modules) { if (s.mode !== "modular") throw new Drop("bad-size", "modules"); base.modules = a.size.modules; }
        if (a.size?.params) { if (s.mode !== "parametric") throw new Drop("bad-size", "params"); base.params = a.size.params; }
        const sizeBase: Partial<ItemNode> = {
          ...(s.mode === "modular" ? { modules: base.modules ?? s.defaultConfig ?? [] } : {}),
          ...(s.mode === "variants" ? { variantId: base.variantId ?? s.defaultVariant ?? s.variants[0].id } : {}),
          ...(base.params ? { params: base.params } : {}),
        };
        try { resolveSize(manifest, sizeBase); } catch (e) { if (e instanceof SizingError) throw new Drop("bad-size", e.message); throw e; }
        const c = { doc, baseline, catalog };
        const mode = a.placement ?? (a.at ? "at" : a.near ? "near" : manifest.placement.againstWall ? "against-wall" : "center");
        let spot: { x: number; y: number; rot: number } | null = null;
        if (mode === "at") {
          if (!a.at) throw new Drop("no-space", "at without coordinates");
          spot = { x: a.at.x, y: a.at.y, rot: snapAngle((a.rotation ?? 0) * DEG) };
        } else if (mode === "near") {
          if (!a.near) throw new Drop("unknown-target", "near without target");
          spot = nearItem(c, manifest, room, target(a.near.target), a.near.side, a.near.gap ?? 0.4, sizeBase);
        } else if (mode === "against-wall") {
          spot = againstWall(c, manifest, room, sizeBase);
        } else {
          spot = freeSpot(c, manifest, room, sizeBase, undefined, snapAngle((a.rotation ?? 0) * DEG));
        }
        if (!spot) throw new Drop("no-space", manifest.id);
        const id = mint();
        const slots: Record<string, { id: string; version: number }> = {};
        for (const [slot, matId] of Object.entries(a.materials ?? {})) {
          if (!manifest.slots.some((q) => q.id === slot)) throw new Drop("unknown-slot", slot);
          slots[slot] = material(matId);
        }
        const node: ItemNode = { ...makeItem(manifest, spot.x, spot.y, spot.rot, id), ...sizeBase, slots };
        if (a.ref) refs.set(a.ref, id);
        return [{ type: "add", node }];
      }
      case "move": return [{ type: "move", id: target(a.target).id, x: a.x, y: a.y }];
      case "rotate": { const n = target(a.target); return [{ type: "rotate", id: n.id, rot: snapAngle(n.transform.rot + a.degrees * DEG) }]; }
      case "remove": return [{ type: "remove", id: target(a.target).id }];
      case "setMaterial": return [{ type: "setSlotMaterial", id: target(a.target).id, slot: a.slot, material: material(a.materialId) }];
      case "setSurface": {
        const room = roomOf(baseline, a.room);
        if (!room) throw new Drop("unknown-room", a.room);
        const m = material(a.materialId);
        const ids = a.surface === "floor" ? [room.floor] : a.surface === "ceiling" ? [room.ceiling]
          : Object.values(baseline.surfaces).filter((s) => s.type === "wall" && s.paintable && s.facesRooms.includes(room.id)).map((s) => s.id);
        if (!ids.length) throw new Drop("unknown-room", `${a.room}: no ${a.surface}`);
        return ids.map((surfaceId) => ({ type: "setSurfaceMaterial", surfaceId, material: m }));
      }
      case "resize": {
        const n = target(a.target);
        const out: Command[] = [];
        if (a.size.variantId) out.push({ type: "setVariant", id: n.id, variantId: a.size.variantId });
        if (a.size.modules) out.push({ type: "setModules", id: n.id, modules: a.size.modules });
        if (a.size.params) out.push({ type: "setParams", id: n.id, params: a.size.params });
        if (!out.length) throw new Drop("bad-size", "empty size");
        return out;
      }
      case "kitchenLayout": {
        const room = roomOf(baseline, a.room);
        if (!room) throw new Drop("unknown-room", a.room);
        const layouts = proposeKitchenLayouts(baseline, doc, catalog, room.id);
        const pick = a.layout === "best" ? layouts[0] : layouts.find((l) => l.id === a.layout);
        if (!pick) throw new Drop("no-layout", a.layout);
        return pick.commands;
      }
    }
  };

  plan.actions.forEach((a, index) => {
    const refsBefore = new Map(refs);
    try {
      const cmds = compileAction(a);
      const before = new Set(allErrors(doc, baseline, catalog).map(issueKey));
      let next = doc;
      for (const c of cmds) next = apply(next, c, { baseline, catalog }).doc;
      const fresh = allErrors(next, baseline, catalog).filter((i) => !before.has(issueKey(i)));
      if (fresh.length) throw new Drop(`err.${fresh[0].code}`, fresh[0].message);
      doc = next;
      commands.push(...cmds);
      accepted.push(index);
    } catch (e) {
      refs.clear(); refsBefore.forEach((v, k) => refs.set(k, v));
      if (e instanceof Drop) dropped.push({ index, op: a.op, reason: e.reason, detail: e.detail });
      else if (e instanceof CommandError) dropped.push({ index, op: a.op, reason: e.code === "unknown-asset" ? "unknown-asset" : e.code === "bad-size" ? "bad-size" : "not-allowed", detail: e.message });
      else throw e;
    }
  });

  const orig = ctx.doc;
  const added = Object.keys(doc.nodes).filter((k) => !orig.nodes[k]);
  const removed = Object.keys(orig.nodes).filter((k) => !doc.nodes[k]);
  const changed = Object.keys(doc.nodes).filter((k) => orig.nodes[k] && JSON.stringify(orig.nodes[k]) !== JSON.stringify(doc.nodes[k]));
  const surfaces = [...new Set([...Object.keys(doc.overrides), ...Object.keys(orig.overrides)])]
    .filter((k) => JSON.stringify(doc.overrides[k]) !== JSON.stringify(orig.overrides[k]));
  const touched = new Set([...added, ...changed]);
  const advisories = advisoriesOf([...validateDocument(doc, baseline, catalog), ...validateProposals(doc, baseline, catalog)]).filter((i) => touched.has(i.nodeId));

  return {
    summary: plan.summary,
    command: commands.length ? { type: "batch", label: "ai", commands } : null,
    accepted, dropped, added, changed, removed, surfaces, advisories,
  };
}
