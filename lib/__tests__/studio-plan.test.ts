import { describe, expect, it } from "vitest";
import { YARKON_TWIN } from "../twin/fixtures/yarkon";
import { baselineFromTwin } from "../studio/baseline/fromTwin";
import { basis, fitView, panBy, project, threeCamera, unproject, zoomAt, MAX_PPM, MIN_PPM, type PlanView } from "../studio/plan/view";
import { centroid, doorSwings, footprintClearances, labelPoint, rayDistance, roomEdges, roomLabels, totalArea, cm } from "../studio/plan/measure";
import { footprint, polygonArea, pointInPolygon } from "../studio/validation/geom2d";

const vp = { w: 1000, h: 600 };
const baseline = baselineFromTwin(YARKON_TWIN);
const views: PlanView[] = [{ kind: "top", cx: 7.5, cy: 3, ppm: 50 }, { kind: "iso", cx: 7.5, cy: 3, ppm: 50 }];

describe("plan view math", () => {
  it("camera bases are orthonormal and iso looks down at the true isometric angle", () => {
    for (const k of ["top", "iso"] as const) {
      const b = basis(k);
      const d = (a: number[], c: number[]) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
      expect(d(b.right, b.right)).toBeCloseTo(1, 9); expect(d(b.up, b.up)).toBeCloseTo(1, 9);
      expect(d(b.right, b.up)).toBeCloseTo(0, 9); expect(d(b.right, b.toward)).toBeCloseTo(0, 9); expect(d(b.up, b.toward)).toBeCloseTo(0, 9);
    }
    expect(Math.asin(basis("iso").toward[2]) * (180 / Math.PI)).toBeCloseTo(35.264, 2);
  });

  it("the view centre projects to the middle of the viewport", () => {
    for (const v of views) { const [x, y] = project(v, vp, [v.cx, v.cy, 0]); expect(x).toBeCloseTo(500, 9); expect(y).toBeCloseTo(300, 9); }
  });

  it("top view is a pure scale: 1 m = ppm px, north is up", () => {
    const v = views[0];
    const [x0, y0] = project(v, vp, [7.5, 3, 0]);
    const [x1, y1] = project(v, vp, [8.5, 3, 0]);
    const [x2, y2] = project(v, vp, [7.5, 4, 0]);
    expect(x1 - x0).toBeCloseTo(50, 9); expect(y1 - y0).toBeCloseTo(0, 9);
    expect(y0 - y2).toBeCloseTo(50, 9); expect(x2 - x0).toBeCloseTo(0, 9);
  });

  it("height moves a point up the screen in iso and not at all in top view", () => {
    const [, topLow] = project(views[0], vp, [3, 2, 0]); const [, topHigh] = project(views[0], vp, [3, 2, 2.8]);
    expect(topHigh).toBeCloseTo(topLow, 9);
    const [, isoLow] = project(views[1], vp, [3, 2, 0]); const [, isoHigh] = project(views[1], vp, [3, 2, 2.8]);
    expect(isoLow - isoHigh).toBeCloseTo(2.8 * Math.cos(Math.atan(1 / Math.SQRT2)) * 50, 6);
  });

  it("unproject inverts project for ground points in both views", () => {
    for (const v of views) for (const p of [[0, 0], [3.2, 4.1], [14, 8], [-2, -1]]) {
      const [sx, sy] = project(v, vp, [p[0], p[1], 0]);
      const [x, y] = unproject(v, vp, sx, sy);
      expect(x).toBeCloseTo(p[0], 9); expect(y).toBeCloseTo(p[1], 9);
    }
  });

  it("zooming keeps the point under the cursor fixed and clamps the scale", () => {
    for (const v of views) {
      const sx = 700, sy = 200;
      const before = unproject(v, vp, sx, sy);
      const z = zoomAt(v, vp, 1.6, sx, sy);
      expect(z.ppm).toBeCloseTo(80, 9);
      const after = unproject(z, vp, sx, sy);
      expect(after[0]).toBeCloseTo(before[0], 9); expect(after[1]).toBeCloseTo(before[1], 9);
      expect(zoomAt(v, vp, 1e6, sx, sy).ppm).toBe(MAX_PPM);
      expect(zoomAt(v, vp, 1e-6, sx, sy).ppm).toBe(MIN_PPM);
    }
  });

  it("panning moves the content by exactly the dragged pixels", () => {
    for (const v of views) {
      const p: [number, number, number] = [4, 2, 0];
      const [x0, y0] = project(v, vp, p);
      const [x1, y1] = project(panBy(v, vp, 40, -25), vp, p);
      expect(x1 - x0).toBeCloseTo(40, 6); expect(y1 - y0).toBeCloseTo(-25, 6);
    }
  });

  it("fit shows the whole apartment inside the viewport with a margin", () => {
    const bounds: [number, number, number, number] = [-0.5, -2.5, 15.5, 8.8];
    for (const k of ["top", "iso"] as const) {
      const v = fitView(k, bounds, 2.8, vp);
      for (const x of [bounds[0], bounds[2]]) for (const y of [bounds[1], bounds[3]]) for (const z of [0, 2.8]) {
        const [sx, sy] = project(v, vp, [x, y, z]);
        expect(sx).toBeGreaterThanOrEqual(0); expect(sx).toBeLessThanOrEqual(vp.w);
        expect(sy).toBeGreaterThanOrEqual(0); expect(sy).toBeLessThanOrEqual(vp.h);
      }
    }
  });

  it("the three.js camera frustum matches the pixel scale", () => {
    const c = threeCamera(views[0], vp);
    expect(c.right - c.left).toBeCloseTo(vp.w / 50, 9);
    expect(c.top - c.bottom).toBeCloseTo(vp.h / 50, 9);
    expect(c.position[1]).toBeGreaterThan(c.target[1]); // looking down
    expect(c.target).toEqual([7.5, 0, -3]); // plan (x, y) -> three (x, up, -y)
  });
});

describe("plan measurements (centimetre accurate)", () => {
  it("room areas equal the polygon area and the labels are inside their rooms", () => {
    for (const l of roomLabels(baseline)) {
      const room = baseline.rooms[l.id];
      expect(l.area).toBeCloseTo(Math.round(polygonArea(room.polygon) * 10) / 10, 9);
      expect(pointInPolygon(l.at, room.polygon)).toBe(true);
    }
  });

  it("the L-shaped living room: area, edge lengths and perimeter come from the geometry", () => {
    const living = baseline.rooms["room:living"];
    expect(polygonArea(living.polygon)).toBeCloseTo(8.2 * 3.4 + 7 * 1.2, 9); // 27.88 + 8.4 = 36.28
    const e = roomEdges(living);
    expect(e.map((x) => x.length)).toEqual([8.2, 3.4, 1.2, 1.2, 7, 4.6]);
    expect(e.reduce((s, x) => s + x.length, 0)).toBeCloseTo(8.2 + 3.4 + 1.2 + 1.2 + 7 + 4.6, 9);
  });

  it("inward normals point into the room whatever the polygon winding", () => {
    for (const room of Object.values(baseline.rooms)) {
      for (const e of roomEdges(room)) {
        const probe: [number, number] = [e.mid[0] + e.inward[0] * 0.05, e.mid[1] + e.inward[1] * 0.05];
        expect(pointInPolygon(probe, room.polygon), `${room.id}`).toBe(true);
      }
      const reversed = { polygon: [...room.polygon].reverse() };
      for (const e of roomEdges(reversed)) expect(pointInPolygon([e.mid[0] + e.inward[0] * 0.05, e.mid[1] + e.inward[1] * 0.05], reversed.polygon)).toBe(true);
    }
  });

  it("centroid of a rectangle is its centre; label point stays inside a concave room", () => {
    expect(centroid([[0, 0], [4, 0], [4, 2], [0, 2]])).toEqual([2, 1]);
    const U: [number, number][] = [[0, 0], [6, 0], [6, 6], [4, 6], [4, 2], [2, 2], [2, 6], [0, 6]];
    expect(pointInPolygon(labelPoint(U), U)).toBe(true);
  });

  it("totals separate the balcony from the interior", () => {
    const t = totalArea(baseline);
    expect(t.balcony).toBeCloseTo(33, 1); // 15 x 2.2
    expect(t.interior).toBeGreaterThan(100);
  });

  it("every door gets a quarter-circle swing of the door width ending 90 degrees from the closed leaf", () => {
    const swings = doorSwings(baseline);
    expect(swings.length).toBe(Object.values(baseline.openings).filter((o) => o.kind === "door" || o.kind === "entry").length);
    for (const s of swings) {
      const o = baseline.openings[`opening:${s.id.replace("opening:", "")}`] ?? Object.values(baseline.openings).find((x) => x.id === s.id)!;
      expect(s.radius).toBeCloseTo(o.width, 9);
      for (const p of s.arc) expect(Math.hypot(p[0] - s.hinge[0], p[1] - s.hinge[1])).toBeCloseTo(s.radius, 6);
      const v1 = [s.closed[0] - s.hinge[0], s.closed[1] - s.hinge[1]], v2 = [s.open[0] - s.hinge[0], s.open[1] - s.hinge[1]];
      expect(Math.abs(v1[0] * v2[0] + v1[1] * v2[1])).toBeLessThan(1e-9);
    }
  });

  it("an interior bedroom door swings into the bedroom, not into the hallway", () => {
    const door = Object.values(baseline.openings).find((o) => o.id === "opening:o7")!; // bed3-front, between living (y<4.6) and bed3 (y>4.6)
    const s = doorSwings(baseline).find((x) => x.id === door.id)!;
    expect(s.open[1]).toBeGreaterThan(4.6);
  });

  it("rayDistance hits the nearest wall and ignores parallel edges", () => {
    const sq: [number, number][] = [[0, 0], [4, 0], [4, 3], [0, 3]];
    expect(rayDistance([1, 1], [1, 0], sq)).toBeCloseTo(3, 9);
    expect(rayDistance([1, 1], [0, 1], sq)).toBeCloseTo(2, 9);
    expect(rayDistance([1, 1], [-1, 0], sq)).toBeCloseTo(1, 9);
    expect(rayDistance([10, 10], [1, 0], sq)).toBeNull();
  });

  it("clearances of a table in the living room are measured to the room walls (cm)", () => {
    const fp = footprint(3, 2, 0, 1.2, 0.6); // x 2.4..3.6, y 2..2.6
    const c = footprintClearances(baseline, fp);
    expect(c.room).toBe("room:living");
    expect(c.west).toBeCloseTo(2.4, 2); expect(c.east).toBeCloseTo(8.2 - 3.6, 2);
    expect(c.south).toBeCloseTo(2, 2); expect(c.north).toBeCloseTo(4.6 - 2.6, 2);
    expect(footprintClearances(baseline, footprint(40, 40, 0, 1, 1)).room).toBeNull();
    expect(cm(1.2349)).toBe(1.23);
  });
});
