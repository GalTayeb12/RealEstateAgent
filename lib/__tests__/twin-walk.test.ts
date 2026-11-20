/**
 * walk.json generated from a plan twin (lib/twin/walk.ts + scripts/twin/build-walk.mjs):
 * the Yarkon twin must reproduce the hand-made walk's rooms, structure, spawn and
 * probes, and every generated walk (Yarkon and the synthetic tlv3 plan) must leave
 * a 0.6 m path to both sides of every door once the furniture is in.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { YARKON_TWIN } from "../twin/fixtures/yarkon";
import { TLV3_TWIN } from "../twin/fixtures/tlv3";
import { validateTwin } from "../twin/validate";
import { assembleWalk, openingSides, unreachableDoors, walkLayout, type Rect, type WalkJson } from "../twin/walk";
import { type PlanTwin, polygonArea, wallLength } from "../twin/schema";

const pub = (slug: string) => path.join(__dirname, "../../public/walk", slug, "walk.json");
const load = (slug: string) => JSON.parse(readFileSync(pub(slug), "utf8")) as WalkJson;
const hand = load("yarkon-v2");

const solidIn = (boxes: Rect[], x: number, y: number, eps = 0.002) =>
  boxes.some(([x1, y1, x2, y2]) => x >= x1 - eps && x <= x2 + eps && y >= y1 - eps && y <= y2 + eps);

/** Sample every wall's centre line (away from opening edges) and compare solid / open. */
function structureMismatches(t: PlanTwin, want: Rect[], got: Rect[]): string[] {
  const bad: string[] = [];
  for (const w of t.walls) {
    const L = wallLength(w);
    const edges = t.openings.filter((o) => o.wallId === w.id).flatMap((o) => [o.at - o.width / 2, o.at + o.width / 2]);
    for (let s = 0.05; s < L - 0.05; s += 0.05) {
      if (edges.some((e) => Math.abs(e - s) < 0.08)) continue;
      const x = w.a[0] + ((w.b[0] - w.a[0]) * s) / L, y = w.a[1] + ((w.b[1] - w.a[1]) * s) / L;
      if (solidIn(want, x, y) !== solidIn(got, x, y)) bad.push(`${w.id}@${s.toFixed(2)}`);
    }
  }
  return bad;
}

describe("walk layout from the Yarkon twin", () => {
  const lay = walkLayout(YARKON_TWIN);

  it("has the hand-made room rectangles", () => {
    expect(lay.rooms).toEqual(hand.rooms);
  });

  it("is solid exactly where the hand-made collision map is, along every wall", () => {
    expect(lay.skippedWalls).toEqual([]);
    expect(structureMismatches(YARKON_TWIN, hand.boxes, lay.wallBoxes)).toEqual([]);
  });

  it("spawns inside the front door looking in, like the hand-made walk", () => {
    const [x, y, yaw] = lay.spawn;
    expect(Math.hypot(x - hand.spawn[0], y - hand.spawn[1])).toBeLessThan(0.1);
    expect(Math.abs(Math.abs(yaw) - Math.abs(hand.spawn[2]))).toBeLessThan(0.01);
  });

  it("puts a reflection probe in every indoor room, near the hand-placed ones", () => {
    expect(Object.keys(lay.probeAt).sort()).toEqual(Object.keys(hand.probeAt).sort());
    for (const [room, p] of Object.entries(lay.probeAt)) {
      const q = hand.probeAt[room];
      expect(Math.hypot(p[0] - q[0], p[1] - q[1]), room).toBeLessThan(1.0); // hand-placed off-centre in the kitchen
    }
  });

  it("knows which rooms each door joins", () => {
    const side = (id: string) => openingSides(YARKON_TWIN).find((o) => o.id === id)!;
    const bath = YARKON_TWIN.openings.find((o) => o.wallId === "master-back")!;
    expect([side(bath.id).front, side(bath.id).back].sort()).toEqual(["bath", "master"]);
    const entry = YARKON_TWIN.openings.find((o) => o.kind === "entry")!;
    expect([side(entry.id).front, side(entry.id).back]).toContain(null);
  });
});

describe("assembleWalk", () => {
  const bake = {
    meta: { LM_A: { scale: 6 }, LM_B: { scale: 4 }, sky: { scale: 3, rot_z: 0.5 }, probe_living: { scale: 2 }, probe_bath: { scale: 0.5 } },
    furniture: [[1, 1, 2, 2], [1, 1, 2, 2], [3, 3, 3, 4]] as Rect[],
  };
  const w = assembleWalk(YARKON_TWIN, bake);

  it("has exactly the WalkData keys the viewer reads", () => {
    expect(Object.keys(w).sort()).toEqual(Object.keys(hand).sort());
    expect(w.lightmaps).toEqual({ A: 6, B: 4 });
    expect([w.sky, w.skyRot]).toEqual([3, 0.5]);
  });

  it("keeps probes only for rooms that were baked, and dedups / drops empty boxes", () => {
    expect(Object.keys(w.probes).sort()).toEqual(["bath", "living"]);
    expect(Object.keys(w.probeAt).sort()).toEqual(["bath", "living"]);
    const lay = walkLayout(YARKON_TWIN);
    expect(w.boxes.length).toBe(lay.wallBoxes.length + 1);
  });
});

describe("walkability check", () => {
  it("finds the tight spots of the hand-made Yarkon walk", () => {
    // a balcony lounge chair 5 cm in front of the slider, and < 0.5 m past the bath door
    const id = (wall: string, kind: string) => YARKON_TWIN.openings.find((o) => o.wallId === wall && o.kind === kind)!.id;
    expect(unreachableDoors(YARKON_TWIN, hand, 0.6).sort()).toEqual([id("facade", "slider"), id("master-back", "door")].sort());
    expect(unreachableDoors(YARKON_TWIN, hand, 0.45)).toEqual([id("facade", "slider")]);
  });

  it("catches a doorway blocked by furniture", () => {
    const door = openingSides(YARKON_TWIN).find((o) => o.kind === "door" && (o.front === "bed3" || o.back === "bed3"))!;
    const [cx, cy] = door.centre;
    const blocked = { ...hand, boxes: [...hand.boxes, [cx - 0.5, cy - 0.9, cx + 0.5, cy + 0.9] as Rect] };
    expect(unreachableDoors(YARKON_TWIN, blocked)).toContain(door.id);
  });
});

describe("synthetic second plan (tlv3)", () => {
  it("is a valid 3-room plan with a mamad and a non-rectangular living room", () => {
    const rep = validateTwin(TLV3_TWIN);
    expect(rep.issues.filter((i) => i.level === "error")).toEqual([]);
    const living = TLV3_TWIN.rooms.find((r) => r.type === "living")!;
    expect(living.polygon.length).toBeGreaterThan(4);
    const rect = walkLayout(TLV3_TWIN).rooms.living;
    expect((rect[2] - rect[0]) * (rect[3] - rect[1])).toBeLessThan(polygonArea(living.polygon) - 1);
    expect(TLV3_TWIN.rooms.some((r) => r.type === "mamad")).toBe(true);
  });
});

for (const [slug, twin] of [["yarkon-twin", YARKON_TWIN], ["tlv3", TLV3_TWIN]] as const) {
  describe.skipIf(!existsSync(pub(slug)))(`generated public/walk/${slug}/walk.json`, () => {
    const got = existsSync(pub(slug)) ? load(slug) : (null as unknown as WalkJson);
    const lay = walkLayout(twin);

    it("carries the twin's rooms, wall boxes and spawn", () => {
      expect(got.rooms).toEqual(lay.rooms);
      expect(got.spawn).toEqual(lay.spawn);
      for (const b of lay.wallBoxes) expect(got.boxes).toContainEqual(b);
      expect(Object.keys(got.probes).sort()).toEqual(Object.keys(lay.probeAt).sort());
    });

    it("has furniture, and a 0.6 m path from the entry to both sides of every door", () => {
      expect(got.boxes.length).toBeGreaterThan(lay.wallBoxes.length + 20);
      expect(unreachableDoors(twin, got, 0.6)).toEqual([]);
    });

    it("keeps furniture out of door swings", () => {
      // the swing square on the opening side of each interior door holds only the open leaf
      for (const o of openingSides(twin).filter((s) => s.kind === "door")) {
        for (const sgn of [1, -1]) {
          const px = o.centre[0] + o.normal[0] * sgn * (o.thickness / 2 + 0.4), py = o.centre[1] + o.normal[1] * sgn * (o.thickness / 2 + 0.4);
          const hits = got.boxes.filter(([x1, y1, x2, y2]) => px >= x1 && px <= x2 && py >= y1 && py <= y2);
          expect(hits, `${o.id} side ${sgn}`).toEqual([]);
        }
      }
    });
  });
}
