/**
 * Free, deterministic stand-in for the AI designer: understands a few Hebrew / English
 * keywords and builds real commands from the catalog and the planners. It costs nothing,
 * needs no API key, and goes through exactly the same validation as a model response,
 * so the whole accept / reject / undo flow can be built and tested without paid calls.
 */
import type { Baseline } from "../baseline/fromTwin";
import type { Command } from "../commands/types";
import { proposeKitchenLayouts } from "../design/kitchen";
import { findFreeSpot, findWallSpot, makeItem } from "../design/spot";
import { previewNode } from "../design/preview";
import { settleOnSurface } from "../design/surface";
import type { CatalogLookup } from "../schema/catalog";
import type { DesignDocument } from "../schema/document";
import type { ItemNode } from "../schema/nodes";
import { centroid } from "../plan/measure";
import { resolveSize } from "../catalog/sizing";

export type Proposal = { summary: string; commands: unknown[] };

const has = (p: string, ...words: string[]) => words.some((w) => p.includes(w));

export function dryRunPropose(prompt: string, doc: DesignDocument, baseline: Baseline, catalog: CatalogLookup): Proposal {
  const p = prompt.toLowerCase();
  const commands: Command[] = [];
  const notes: string[] = [];
  let working = doc;

  const place = (modelId: string, roomId: string, rot = 0) => {
    const m = catalog.model({ id: modelId, version: 1 });
    const room = baseline.rooms[roomId];
    if (!m || !room) return null;
    let at: { x: number; y: number; rot: number } | null = null;
    if (m.placement.againstWall) at = findWallSpot({ doc: working, baseline, catalog, manifest: m, roomId });
    if (!at) {
      const c = centroid(room.polygon);
      const spot = findFreeSpot({ doc: working, baseline, catalog, manifest: m, near: [c[0], c[1]], rot });
      if (spot) at = { ...spot, rot };
    }
    if (!at) return null;
    const node = makeItem(m, at.x, at.y, at.rot);
    working = { ...working, nodes: { ...working.nodes, [node.id]: node } };
    commands.push({ type: "add", node });
    return node;
  };
  /** A surface item on top of `host`, toward one end (`side` -1 left, +1 right), facing the same way; validated. */
  const placeOn = (modelId: string, host: ItemNode | null, side = 1) => {
    const m = catalog.model({ id: modelId, version: 1 });
    const hm = host ? catalog.model(host.catalog) : null;
    if (!m || !host || !hm) return null;
    const w = host.params?.width ?? hm.dims.w, d = host.params?.depth ?? hm.dims.d;
    const lx = side * Math.max(0, w / 2 - m.dims.w / 2 - 0.04), ly = Math.max(0.02, d / 2 - m.dims.d / 2);
    const t = host.transform, c = Math.cos(t.rot), sn = Math.sin(t.rot);
    const x = Math.round((t.x + lx * c - ly * sn) * 100) / 100, y = Math.round((t.y + lx * sn + ly * c) * 100) / 100;
    const node = settleOnSurface(working, catalog, makeItem(m, x, y, t.rot));
    if (node.transform.z <= 0 || !previewNode(working, node, baseline, catalog).ok) return null;
    working = { ...working, nodes: { ...working.nodes, [node.id]: node } };
    commands.push({ type: "add", node });
    return node;
  };
  /** Chairs on both long sides of a table, facing it, 1 cm clear of its footprint; each validated in `d`. */
  const chairsFor = (table: ItemNode, d: DesignDocument): ItemNode[] => {
    const chair = catalog.model({ id: "dining-chair-01", version: 1 });
    const tm = catalog.model(table.catalog);
    if (!chair || !tm) return [];
    const t = table.transform;
    const w = table.params?.width ?? tm.dims.w, dep = table.params?.depth ?? tm.dims.d;
    const c = Math.cos(t.rot), sn = Math.sin(t.rot);
    const at = (lx: number, ly: number): [number, number] => [t.x + lx * c - ly * sn, t.y + lx * sn + ly * c];
    const out: ItemNode[] = [];
    let cur = d;
    const per = Math.max(1, Math.floor(w / 0.6));
    for (let i = 0; i < per; i++) {
      const lx = -w / 2 + (w / per) * (i + 0.5);
      for (const [ly, rot] of [[-0.01 - chair.dims.d, t.rot], [dep + 0.01 + chair.dims.d, t.rot + Math.PI]] as [number, number][]) {
        const [x, y] = at(lx, ly);
        const node = makeItem(chair, Math.round(x * 100) / 100, Math.round(y * 100) / 100, rot);
        if (!previewNode(cur, node, baseline, catalog).ok) continue;
        cur = { ...cur, nodes: { ...cur.nodes, [node.id]: node } };
        out.push(node);
      }
    }
    return out;
  };
  /** A floor piece standing just beside `host` (side -1 left / +1 right of its front), facing the same way. */
  const placeBeside = (modelId: string, host: ItemNode | null, side = 1) => {
    const m = catalog.model({ id: modelId, version: 1 });
    const hm = host ? catalog.model(host.catalog) : null;
    if (!m || !host || !hm) return null;
    const w = resolveSize(hm, host).w;
    const t = host.transform, c = Math.cos(t.rot), sn = Math.sin(t.rot);
    for (const sd of [side, -side]) {
      const lx = sd * (w / 2 + m.dims.w / 2 + 0.08), ly = 0.05;
      const spot = findFreeSpot({ doc: working, baseline, catalog, manifest: m, near: [t.x + lx * c - ly * sn, t.y + lx * sn + ly * c], rot: t.rot, radius: 0.6 });
      if (!spot) continue;
      const node = makeItem(m, spot.x, spot.y, t.rot);
      working = { ...working, nodes: { ...working.nodes, [node.id]: node } };
      commands.push({ type: "add", node });
      return node;
    }
    return null;
  };
  const roomOf = (...types: string[]) => Object.values(baseline.rooms).find((r) => types.includes(r.type));

  if (has(p, "kitchen", "מטבח")) {
    const l = proposeKitchenLayouts(baseline, doc, catalog)[0];
    if (l && l.commands[0].type === "batch") { commands.push(...l.commands[0].commands); notes.push(`${l.name.en} kitchen (${l.counter} m of counter)`); }
  }
  if (has(p, "living", "salon", "סלון", "sofa", "ספה")) {
    const r = roomOf("living");
    const sofa = r ? place("sofa-modular-01", r.id) : null;
    if (r && sofa && place("coffee-drum-01", r.id) && place("lounge-chair-01", r.id)) {
      const tv = place("tv-unit-01", r.id); place("pendant-01", r.id); place("ottoman-01", r.id);
      const fl = placeBeside("floor-lamp-01", sofa, 1);
      const tl = placeOn("table-lamp-02", tv, -1);
      place("vase-brass-01", r.id);
      notes.push(`a modular sofa, coffee table${tv ? ", TV unit" : ""}, lounge chair, ottoman, pendant${fl ? ", floor lamp" : ""}${tl ? ", table lamp" : ""} and vase in the living room`);
    }
  }
  if (has(p, "dining", "פינת אוכל", "שולחן אוכל", "table")) {
    const r = roomOf("dining", "living");
    const tm = catalog.model({ id: "dining-table-01", version: 1 });
    if (r && tm) {
      // try table positions across the room and keep the one that seats the most people
      const xs = r.polygon.map((q) => q[0]), ys = r.polygon.map((q) => q[1]);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      let best: { table: ItemNode; chairs: ItemNode[] } | null = null;
      for (const fx of [0.2, 0.4, 0.6, 0.8]) for (const fy of [0.25, 0.5, 0.75]) {
        const spot = findFreeSpot({ doc: working, baseline, catalog, manifest: tm, near: [x0 + (x1 - x0) * fx, y0 + (y1 - y0) * fy], rot: 0, radius: 0.8 });
        if (!spot) continue;
        const table = makeItem(tm, spot.x, spot.y, 0);
        const chairs = chairsFor(table, { ...working, nodes: { ...working.nodes, [table.id]: table } });
        if (!best || chairs.length > best.chairs.length) best = { table, chairs };
      }
      if (best) {
        for (const n of [best.table, ...best.chairs]) { working = { ...working, nodes: { ...working.nodes, [n.id]: n } }; commands.push({ type: "add", node: n }); }
        const sb = place("sideboard-01", r.id);
        const lamp = placeOn("table-lamp-01", sb, 1);
        notes.push(`a dining table with ${best.chairs.length} chairs${sb ? ` and a sideboard${lamp ? " with a lamp" : ""}` : ""}`);
      }
    }
  }
  if (has(p, "bedroom", "חדר שינה", "bed", "מיטה")) {
    const r = roomOf("master", "bedroom");
    if (r && place("bed-upholstered-01", r.id) && place("wardrobe-hinged-01", r.id)) {
      const ns = place("nightstand-01", r.id);
      const lamp = placeOn("table-lamp-01", ns, 0);
      const dr = place("dresser-01", r.id);
      notes.push(`a bed, wardrobe${ns ? `, nightstand${lamp ? " with a lamp" : ""}` : ""}${dr ? ", chest of drawers" : ""} in ${r.name.en}`);
    }
  }
  return {
    summary: notes.length ? `Proposed: ${notes.join("; ")}.` : "I could not turn that into a design. Try: living room, dining, bedroom, kitchen.",
    commands,
  };
}
