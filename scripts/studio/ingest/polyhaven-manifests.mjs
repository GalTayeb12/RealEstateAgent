#!/usr/bin/env node
// Writes catalog/manifests/<id>@1.json for the Poly Haven (CC0) models normalised by
// scripts/blender/studio_normalize_gltf.py. Dimensions come from the normalised <id>.json report.
//   node scripts/studio/ingest/polyhaven-manifests.mjs
import fs from "node:fs";
const norm = "assets-src/studio/items-norm";
const L = (he, en) => ({ he, en });
const base = { clearance: { front: 0.6, back: 0, sides: 0 }, againstWall: false };
const ITEMS = [
  { id: "armchair-midcentury-01", name: L("כורסת מידסנצ'ורי", "Mid-century lounge chair"), category: "armchair", styles: ["contemporary", "quiet-luxury"], rooms: ["living", "bedroom"], slots: [],
    placement: { on: "floor", layer: "furniture", elevation: 0, ...{ clearance: base.clearance, againstWall: false } } },
  { id: "coffee-wood-01", name: L("שולחן סלון עץ", "Wooden coffee table"), category: "coffee-table", styles: ["scandinavian", "japandi"], rooms: ["living"], slots: [],
    placement: { on: "floor", layer: "furniture", elevation: 0, clearance: { front: 0.4, back: 0, sides: 0.3 }, againstWall: false } },
  { id: "chair-dining-01", name: L("כיסא אוכל", "Dining chair"), category: "chair", styles: ["contemporary", "scandinavian"], rooms: ["living", "kitchen", "bedroom"], slots: [],
    placement: { on: "floor", layer: "furniture", elevation: 0, clearance: { front: 0.4, back: 0, sides: 0 }, againstWall: false } },
  { id: "vase-ceramic-03", name: L("אגרטל קרמיקה גבוה", "Tall ceramic vase"), category: "decor", styles: ["organic-modern", "japandi", "scandinavian"], rooms: ["living", "bedroom"], slots: [],
    placement: { on: "surface", layer: "decor", elevation: 0, clearance: { front: 0, back: 0, sides: 0 }, againstWall: false } },
];
for (const it of ITEMS) {
  const rep = JSON.parse(fs.readFileSync(`${norm}/${it.id}.json`, "utf8"));
  const r3 = (n) => Math.round(n * 1000) / 1000;
  const m = {
    type: "model", id: it.id, version: 1, name: it.name, category: it.category, styles: it.styles, rooms: it.rooms,
    dims: { w: r3(rep.dims.w), d: r3(rep.dims.d), h: r3(rep.dims.h) }, sizing: { mode: "fixed" }, slots: it.slots, placement: it.placement,
    capabilities: ["move", "rotate", ...(it.slots.length ? ["material"] : []), "duplicate", "remove"],
    assets: { glb: `${it.id}/1/model.glb`, preview: `${it.id}/1/preview.webp` },
    license: { spdx: "CC0-1.0", sourceUrl: `https://polyhaven.com/a/${rep.collection}`, author: "Poly Haven contributors", retrievedAt: "2026-11-26" },
  };
  fs.writeFileSync(`catalog/manifests/${it.id}@1.json`, JSON.stringify(m, null, 2) + "\n");
  console.log("wrote", it.id);
}
