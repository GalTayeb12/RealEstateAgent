import { describe, expect, it } from "vitest";
import { againstWall, openDepth } from "@/lib/studio/ai/place";
import { baselineFromTwin } from "@/lib/studio/baseline/fromTwin";
import { emptyDocument } from "@/lib/studio/schema/document";
import type { PlanTwin, Wall } from "@/lib/twin/schema";
import { CATALOG, SOFA } from "./studio-fixtures";

// One "living" outline = a 5 x 5 main space plus a 1.1 m strip along its south side that runs on to the east
// (what an open plan with a corridor and an entrance becomes when the wall between them is missing).
const poly: [number, number][] = [[0, 0], [5, 0], [5, 5], [11, 5], [11, 6.1], [0, 6.1]];
const walls: Wall[] = [
  ...poly.map((a, i) => ({ id: `w${i}`, a, b: poly[(i + 1) % poly.length], thickness: 0.2, kind: "exterior" as const })),
  // the partition between the living area and the strip, with a 1 m gap
  { id: "p1", a: [0, 5] as [number, number], b: [2, 5] as [number, number], thickness: 0.12, kind: "interior" as const },
  { id: "p2", a: [3, 5] as [number, number], b: [5, 5] as [number, number], thickness: 0.12, kind: "interior" as const },
];
const twin: PlanTwin = {
  version: 1, units: "m", source: { kind: "manual" }, wallHeight: 2.7, walls, openings: [],
  rooms: [{ id: "living", type: "living", name: { he: "סלון", en: "Living room" }, polygon: poly }], declared: {},
};
const baseline = baselineFromTwin(twin);
const doc = emptyDocument({ id: "t", version: 1, twinHash: baseline.twinHash });
const ctx = { doc, baseline, catalog: CATALOG };

describe("against-wall placement in an open-plan outline", () => {
  it("puts the sofa where the room is roomy, not on the long wall of the narrow strip", () => {
    const spot = againstWall(ctx, SOFA, baseline.rooms["room:living"]);
    expect(spot).not.toBeNull();
    // the strip is y in [5, 6.1]; its long south wall would win on length alone
    expect(spot!.y).toBeLessThan(5);
    // and the spot keeps the room a sofa wants in front of it (its depth + 0.9 m), partitions counted
    const n: [number, number] = [-Math.sin(spot!.rot), Math.cos(spot!.rot)];
    expect(openDepth(baseline, poly, [spot!.x, spot!.y], n, 2.4)).toBeGreaterThanOrEqual(0.95 + 0.9);
  });

  it("measures the open depth ahead of a wall, partitions included", () => {
    expect(openDepth(baseline, poly, [1, 6.0], [0, -1], 0.8)).toBeLessThan(1.3); // partition right ahead
    expect(openDepth(baseline, poly, [2.5, 0.1], [0, 1], 0.8)).toBeGreaterThan(4.5); // the roomy side
  });

  it("an ordinary rectangular room is unaffected", () => {
    const r: [number, number][] = [[0, 0], [4, 0], [4, 3], [0, 3]];
    const tw: PlanTwin = { ...twin, walls: r.map((a, i) => ({ id: `r${i}`, a, b: r[(i + 1) % 4], thickness: 0.2, kind: "exterior" as const })), rooms: [{ id: "living", type: "living", name: { he: "סלון", en: "Living room" }, polygon: r }] };
    const b = baselineFromTwin(tw);
    expect(againstWall({ doc, baseline: b, catalog: CATALOG }, SOFA, b.rooms["room:living"])).not.toBeNull();
  });
});
