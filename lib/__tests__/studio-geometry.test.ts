import { describe, expect, it } from "vitest";
import {
  distSegmentSegment, footprint, insidePolygon, overlapDepth, pointInPolygon, polygonArea, polygonDistance, segmentRect,
} from "../studio/validation/geom2d";

const rect = (x1: number, y1: number, x2: number, y2: number) => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]] as [number, number][];
const close = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) < tol;

describe("studio geom2d", () => {
  it("footprint puts the back-centre at the origin and the front at +y", () => {
    const p = footprint(5, 5, 0, 2, 1);
    expect(p).toEqual([[4, 5], [6, 5], [6, 6], [4, 6]]);
  });

  it("footprint rotates counter-clockwise about the back-centre", () => {
    const p = footprint(0, 0, Math.PI / 2, 2, 1); // front now points to -x
    const xs = p.map((q) => Math.round(q[0] * 1e6) / 1e6);
    expect(Math.min(...xs)).toBe(-1);
    expect(Math.max(...xs)).toBe(0);
  });

  it("segmentRect has the wall length and thickness", () => {
    const r = segmentRect([0, 0], [4, 0], 0.2);
    expect(close(polygonArea(r), 0.8)).toBe(true);
  });

  it("overlapDepth is 0 for touching and separate boxes, positive for overlapping", () => {
    expect(overlapDepth(rect(0, 0, 1, 1), rect(1, 0, 2, 1))).toBe(0);
    expect(overlapDepth(rect(0, 0, 1, 1), rect(3, 3, 4, 4))).toBe(0);
    expect(close(overlapDepth(rect(0, 0, 1, 1), rect(0.7, 0, 2, 1)), 0.3)).toBe(true);
  });

  it("overlapDepth works for rotated boxes", () => {
    const a = footprint(0, 0, Math.PI / 4, 1, 1);
    const b = footprint(0.2, 0.2, 0, 1, 1);
    expect(overlapDepth(a, b)).toBeGreaterThan(0);
  });

  it("polygonDistance measures the gap between separated boxes", () => {
    expect(close(polygonDistance(rect(0, 0, 1, 1), rect(1.5, 0, 2.5, 1)), 0.5)).toBe(true);
    expect(polygonDistance(rect(0, 0, 1, 1), rect(0.5, 0.5, 2, 2))).toBe(0);
  });

  it("distSegmentSegment is 0 for crossing segments", () => {
    expect(distSegmentSegment([0, 0], [2, 2], [0, 2], [2, 0])).toBe(0);
    expect(close(distSegmentSegment([0, 0], [1, 0], [0, 1], [1, 1]), 1)).toBe(true);
  });

  it("pointInPolygon handles an L-shaped room", () => {
    const L: [number, number][] = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]];
    expect(pointInPolygon([1, 3], L)).toBe(true);
    expect(pointInPolygon([3, 3], L)).toBe(false);
  });

  it("insidePolygon accepts boxes against the wall within tolerance and rejects protrusions", () => {
    const room = rect(0, 0, 4, 3);
    expect(insidePolygon(rect(0, 0, 1, 1), room)).toBe(true);
    expect(insidePolygon(rect(-0.01, 0, 1, 1), room, 0.02)).toBe(true);
    expect(insidePolygon(rect(-0.2, 0, 1, 1), room, 0.02)).toBe(false);
  });
});
