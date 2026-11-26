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
import type { CatalogLookup } from "../schema/catalog";
import type { DesignDocument } from "../schema/document";
import { centroid } from "../plan/measure";

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
    if (!m || !room) return false;
    let at: { x: number; y: number; rot: number } | null = null;
    if (m.placement.againstWall) at = findWallSpot({ doc: working, baseline, catalog, manifest: m, roomId });
    if (!at) {
      const c = centroid(room.polygon);
      const spot = findFreeSpot({ doc: working, baseline, catalog, manifest: m, near: [c[0], c[1]], rot });
      if (spot) at = { ...spot, rot };
    }
    if (!at) return false;
    const node = makeItem(m, at.x, at.y, at.rot);
    working = { ...working, nodes: { ...working.nodes, [node.id]: node } };
    commands.push({ type: "add", node });
    return true;
  };
  const roomOf = (...types: string[]) => Object.values(baseline.rooms).find((r) => types.includes(r.type));

  if (has(p, "kitchen", "מטבח")) {
    const l = proposeKitchenLayouts(baseline, doc, catalog)[0];
    if (l && l.commands[0].type === "batch") { commands.push(...l.commands[0].commands); notes.push(`${l.name.en} kitchen (${l.counter} m of counter)`); }
  }
  if (has(p, "living", "salon", "סלון", "sofa", "ספה")) {
    const r = roomOf("living");
    if (r && place("sofa-modular-01", r.id) && place("coffee-drum-01", r.id) && place("armchair-modern-01", r.id)) {
      const tv = place("tv-unit-01", r.id);
      notes.push(`a modular sofa, coffee table${tv ? ", TV unit" : ""} and armchair in the living room`);
    }
  }
  if (has(p, "dining", "פינת אוכל", "שולחן אוכל", "table")) {
    const r = roomOf("dining", "living");
    if (r && place("dining-table-01", r.id)) { const sb = place("sideboard-01", r.id); notes.push(`a dining table${sb ? " and sideboard" : ""}`); }
  }
  if (has(p, "bedroom", "חדר שינה", "bed", "מיטה")) {
    const r = roomOf("master", "bedroom");
    if (r && place("bed-upholstered-01", r.id) && place("wardrobe-hinged-01", r.id)) {
      const ns = place("nightstand-01", r.id);
      const dr = place("dresser-01", r.id);
      notes.push(`a bed, wardrobe${ns ? ", nightstand" : ""}${dr ? ", chest of drawers" : ""} in ${r.name.en}`);
    }
  }
  return {
    summary: notes.length ? `Proposed: ${notes.join("; ")}.` : "I could not turn that into a design. Try: living room, dining, bedroom, kitchen.",
    commands,
  };
}
