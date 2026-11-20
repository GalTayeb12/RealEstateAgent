/**
 * Golden test for the plan-twin pipeline: the hand-built Yarkon apartment,
 * written as an architect-style DXF, must parse back to the same twin, and the
 * walkthrough data generated from it must agree with the hand-made walk.json.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { YARKON_TWIN } from "../twin/fixtures/yarkon";
import { writeDxf } from "../twin/dxf/write";
import { parseDxf } from "../twin/dxf/parse";
import { validateTwin } from "../twin/validate";
import { wallBoxes, walkRooms, type Rect } from "../twin/walk";
import { planSvg } from "../twin/svg";
import { type PlanTwin, alongWall } from "../twin/schema";

const walk = JSON.parse(readFileSync(path.join(__dirname, "../../public/walk/yarkon-v2/walk.json"), "utf8")) as {
  rooms: Record<string, Rect>; boxes: Rect[];
};

const close = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;
const samePt = (p: number[], q: number[], tol = 0.01) => close(p[0], q[0], tol) && close(p[1], q[1], tol);

/** Every wall / opening / room of `want` has a geometric twin in `got` (ids may differ). */
function expectSameTwin(got: PlanTwin, want: PlanTwin) {
  expect(got.walls).toHaveLength(want.walls.length);
  for (const w of want.walls) {
    const m = got.walls.find((g) => g.kind === w.kind && close(g.thickness, w.thickness) &&
      ((samePt(g.a, w.a) && samePt(g.b, w.b)) || (samePt(g.a, w.b) && samePt(g.b, w.a))));
    expect(m, `wall ${w.id}`).toBeDefined();
  }
  const centre = (t: PlanTwin, o: PlanTwin["openings"][number]) => alongWall(t.walls.find((w) => w.id === o.wallId)!, o.at);
  expect(got.openings).toHaveLength(want.openings.length);
  for (const o of want.openings) {
    const c = centre(want, o);
    const m = got.openings.find((g) => g.kind === o.kind && close(g.width, o.width) && samePt(centre(got, g), c));
    expect(m, `opening ${o.id} (${o.kind})`).toBeDefined();
  }
  expect(got.rooms).toHaveLength(want.rooms.length);
  for (const r of want.rooms) {
    const m = got.rooms.find((g) => g.name.he === r.name.he);
    expect(m, `room ${r.id}`).toBeDefined();
    expect(m!.type).toBe(r.type);
    expect(m!.polygon).toHaveLength(r.polygon.length);
    for (const p of r.polygon) expect(m!.polygon.some((q) => samePt(p, q)), `${r.id} vertex ${p}`).toBe(true);
  }
}

describe("Yarkon fixture", () => {
  it("passes validation with every room reachable", () => {
    const rep = validateTwin(YARKON_TWIN);
    expect(rep.issues).toEqual([]);
    expect(rep.ok).toBe(true);
    expect(rep.netArea).toBeCloseTo(127.5, 1);
    const linked = (a: string, b: string) => rep.links.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
    expect(linked("living", "balcony")).toBe(true);   // through the slider
    expect(linked("master", "bath")).toBe(true);
    expect(linked("master", "balcony")).toBe(false);  // fixed glass only
  });
});

describe("DXF round trip", () => {
  it("parses the architect-style drawing (cm, offset origin) back to the same twin", () => {
    const { twin, notes } = parseDxf(writeDxf(YARKON_TWIN, { units: "cm", offset: [12000, 4500] }));
    expect(notes).toEqual([]);
    expect(twin.source.sourceUnits).toBe("cm");
    expectSameTwin(twin, YARKON_TWIN);
    expect(twin.declared).toEqual({ area: 127, balconyArea: 33, rooms: 4 });
    expect(validateTwin(twin).ok).toBe(true);
  });

  it("handles millimetres with no $INSUNITS header", () => {
    const dxf = writeDxf(YARKON_TWIN, { units: "mm", offset: [-350000, 90000] }).replace("9\n$INSUNITS\n70\n4\n", "");
    expect(dxf).not.toContain("$INSUNITS");
    const { twin } = parseDxf(dxf);
    expect(twin.source.sourceUnits).toBe("mm");
    expectSameTwin(twin, YARKON_TWIN);
  });

  it("reads Hebrew layer names", () => {
    const dxf = writeDxf(YARKON_TWIN)
      .replaceAll("A-AREA", "חדרים").replaceAll("A-WALL", "קירות").replaceAll("A-GLAZ", "חלונות")
      .replaceAll("A-DOOR", "דלתות").replaceAll("A-RAIL", "מעקה");
    expectSameTwin(parseDxf(dxf).twin, YARKON_TWIN);
  });
});

describe("walkthrough data from the twin", () => {
  const twin = parseDxf(writeDxf(YARKON_TWIN)).twin;

  it("room rectangles match the hand-made walk.json", () => {
    const got = Object.values(walkRooms(twin)).map((r) => r.join(",")).sort();
    const want = Object.values(walk.rooms).map((r) => r.join(",")).sort();
    expect(got).toEqual(want);
  });

  it("every generated wall box is solid in the hand-made collision map", () => {
    const { boxes, skipped } = wallBoxes(twin);
    expect(skipped).toEqual([]);
    const solid = (x: number, y: number) => walk.boxes.some(([x1, y1, x2, y2]) => x >= x1 - 0.002 && x <= x2 + 0.002 && y >= y1 - 0.002 && y <= y2 + 0.002);
    for (const [x1, y1, x2, y2] of boxes)
      for (let i = 0; i <= 4; i++)
        for (let j = 0; j <= 4; j++) {
          const x = x1 + ((x2 - x1) * i) / 4, y = y1 + ((y2 - y1) * j) / 4;
          expect(solid(x, y), `(${x.toFixed(3)}, ${y.toFixed(3)}) in [${x1},${y1},${x2},${y2}]`).toBe(true);
        }
  });

  it("draws a plan with every room label", () => {
    const svg = planSvg(twin);
    for (const r of YARKON_TWIN.rooms) expect(svg).toContain(r.name.he);
  });
});

describe("validator catches broken plans", () => {
  const clone = (): PlanTwin => structuredClone(YARKON_TWIN);

  it("flags a room with no door", () => {
    const t = clone();
    t.openings = t.openings.filter((o) => !(o.wallId === "master-back" && o.kind === "door"));
    const rep = validateTwin(t);
    expect(rep.ok).toBe(false);
    expect(rep.issues.find((i) => i.code === "room-unreachable")?.ref).toBe("bath");
  });

  it("flags overlapping rooms, narrow doors and wrong areas", () => {
    const t = clone();
    t.rooms.find((r) => r.id === "bed2")!.polygon = [[8.2, 3.6], [11.2, 3.6], [11.2, 8.5], [8.2, 8.5]];
    t.openings.find((o) => o.wallId === "bed3-front")!.width = 0.5;
    t.rooms.find((r) => r.id === "kitchen")!.areaDeclared = 20;
    const codes = validateTwin(t).issues.map((i) => i.code);
    expect(codes).toContain("room-overlap");
    expect(codes).toContain("door-narrow");
    expect(codes).toContain("room-area");
  });

  it("flags a bedroom without a window", () => {
    const t = clone();
    t.openings = t.openings.filter((o) => !(o.wallId === "back" && o.kind === "window" && o.at < 3));
    expect(validateTwin(t).issues.some((i) => i.code === "no-window" && i.ref === "bed3")).toBe(true);
  });
});
