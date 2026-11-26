import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generate, partsBounds, type GeneratorId } from "@/lib/studio/catalog/generators";
import { verifyGenerated } from "@/lib/studio/catalog/generators/verify";
import { resolveParams, resolveSize } from "@/lib/studio/catalog/sizing";
import { parseManifest } from "@/lib/studio/catalog/gates";
import type { ModelManifest } from "@/lib/studio/schema/catalog";

const dir = path.join(process.cwd(), "catalog/manifests");
const manifests = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))
  .map((raw) => parseManifest(raw)).flatMap((p) => ("manifest" in p && p.manifest.type === "model" ? [p.manifest as ModelManifest] : []));
const byId = (id: string) => manifests.find((m) => m.id === id)!;
const NEW = ["dining-table-01", "desk-01", "console-table-01", "coffee-rect-01", "bench-01", "sideboard-01", "tv-unit-01", "nightstand-01", "dresser-01", "wall-shelf-01"];
const fronts = (id: string, params: Record<string, number> = {}) => {
  const m = byId(id);
  const node = { params };
  const gen = (m.sizing as { generator: GeneratorId }).generator;
  return generate(gen, resolveSize(m, node), resolveParams(m, node)).filter((p) => p.kind === "front");
};

describe("M11 original parametric furniture", () => {
  it("every new model passes the generator publish gates at min / default / max", () => {
    for (const id of NEW) expect(verifyGenerated(byId(id)), id).toEqual([]);
  });

  it("generators get the catalog defaults for parameters that drive no dimension", () => {
    expect(resolveParams(byId("nightstand-01"), {})).toEqual({ width: 0.5, drawers: 2 });
    expect(resolveParams(byId("nightstand-01"), { params: { drawers: 3 } }).drawers).toBe(3);
    // one column of drawers in a 50 cm nightstand: rows == fronts
    expect(fronts("nightstand-01")).toHaveLength(2);
    expect(fronts("nightstand-01", { drawers: 3 })).toHaveLength(3);
    // a 1.2 m chest has two columns
    expect(fronts("dresser-01")).toHaveLength(4 * 2);
    expect(fronts("tv-unit-01").every((f) => f.id.startsWith("drawer-"))).toBe(true);
  });

  it("sideboard: drawers over doors, a handle on every front, nothing past the item's depth", () => {
    const m = byId("sideboard-01");
    const node = { params: {} };
    const parts = generate("case-mixed", resolveSize(m, node), resolveParams(m, node));
    const f = parts.filter((p) => p.kind === "front");
    expect(f.some((p) => p.id.startsWith("drawer-")) && f.some((p) => p.id.startsWith("door-"))).toBe(true);
    expect(parts.filter((p) => p.kind === "hardware")).toHaveLength(f.length);
    const b = partsBounds(parts);
    expect(b.z0).toBeCloseTo(-m.dims.d, 6);
    expect(b.z1).toBeCloseTo(0, 6);
  });

  it("tables: legs inside the top's footprint, slab tables get a modesty panel only at desk height", () => {
    const legs = generate("table-legs", { w: 1.8, d: 0.9, h: 0.75 }).filter((p) => p.id.startsWith("leg-"));
    expect(legs).toHaveLength(4);
    for (const l of legs) expect(Math.abs(l.cx) + l.w / 2).toBeLessThanOrEqual(0.9);
    expect(generate("table-panel", { w: 1.4, d: 0.65, h: 0.75 }, { modesty: 1 }).some((p) => p.id === "modesty")).toBe(true);
    expect(generate("table-panel", { w: 1.2, d: 0.6, h: 0.38 }, { modesty: 1 }).some((p) => p.id === "modesty")).toBe(false);
  });
});
