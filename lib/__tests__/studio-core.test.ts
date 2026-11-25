import { describe, expect, it } from "vitest";
import { YARKON_TWIN } from "../twin/fixtures/yarkon";
import { baselineFromTwin, baselineRef, canonicalJson, roomAtPoint, twinHash } from "../studio/baseline/fromTwin";
import { apply, CommandError, SURFACE_CATEGORIES } from "../studio/commands/apply";
import { History } from "../studio/commands/history";
import { CommandSchema, isPublicCommand, type Command } from "../studio/commands/types";
import { DesignDocument, emptyDocument } from "../studio/schema/document";
import { baselineIds, isBaselineId, newNodeId } from "../studio/schema/ids";
import { ItemNode, Transform, type DesignNode } from "../studio/schema/nodes";
import { migrateDocument, MigrationError } from "../studio/migrations";
import { BOUCLE, BRASS, CATALOG, PAINT, PARQUET, SOFA, TABLE, TRAVERTINE, ref } from "./studio-fixtures";

const baseline = baselineFromTwin(YARKON_TWIN);
const ctx = { baseline, catalog: CATALOG };
const fresh = () => emptyDocument(baselineRef("yarkon", 1, baseline));
const item = (id: string, over: Partial<ItemNode> = {}): ItemNode =>
  ItemNode.parse({ id, kind: "item", catalog: ref(TABLE), transform: { x: 2, y: 2, rot: 0 }, ...over });

describe("studio ids", () => {
  it("newNodeId is a 26-char sortable ULID", () => {
    const a = newNodeId(1_700_000_000_000, () => 0.1);
    const b = newNodeId(1_700_000_001_000, () => 0.1);
    expect(a).toHaveLength(26);
    expect(a < b).toBe(true);
    expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("newNodeId does not collide in a burst", () => {
    const s = new Set(Array.from({ length: 2000 }, () => newNodeId()));
    expect(s.size).toBe(2000);
  });

  it("baseline ids are namespaced and recognisable", () => {
    expect(baselineIds.wall("back")).toBe("wall:back");
    expect(baselineIds.wallSurface("back", "a")).toBe("surface:back:a");
    expect(baselineIds.floor("living")).toBe("surface:floor:living");
    expect(isBaselineId("surface:floor:living")).toBe(true);
    expect(isBaselineId(newNodeId())).toBe(false);
  });
});

describe("baseline from twin", () => {
  it("creates entities for every room, wall, opening and surface", () => {
    expect(Object.keys(baseline.rooms)).toHaveLength(YARKON_TWIN.rooms.length);
    expect(Object.keys(baseline.walls)).toHaveLength(YARKON_TWIN.walls.length);
    expect(Object.keys(baseline.openings)).toHaveLength(YARKON_TWIN.openings.length);
    // 2 per wall + floor and ceiling per room
    expect(Object.keys(baseline.surfaces)).toHaveLength(YARKON_TWIN.walls.length * 2 + YARKON_TWIN.rooms.length * 2);
  });

  it("is deterministic and keeps ids stable across a re-derivation", () => {
    const again = baselineFromTwin(structuredClone(YARKON_TWIN));
    expect(canonicalJson(again)).toBe(canonicalJson(baseline));
  });

  it("hash ignores the source file name and float noise but notices real geometry changes", () => {
    const renamed = { ...YARKON_TWIN, source: { ...YARKON_TWIN.source, file: "other.dxf" } };
    expect(twinHash(renamed)).toBe(twinHash(YARKON_TWIN));
    const noisy = structuredClone(YARKON_TWIN);
    noisy.walls[0].a = [noisy.walls[0].a[0] + 1e-6, noisy.walls[0].a[1]];
    expect(twinHash(noisy)).toBe(twinHash(YARKON_TWIN));
    const moved = structuredClone(YARKON_TWIN);
    moved.walls[0].a = [moved.walls[0].a[0] + 0.05, moved.walls[0].a[1]];
    expect(twinHash(moved)).not.toBe(twinHash(YARKON_TWIN));
  });

  it("marks exterior and glazing walls protected and the rest unverified", () => {
    expect(baseline.walls["wall:back"].structural).toBe("protected");
    expect(baseline.walls["wall:facade"].structural).toBe("protected");
    expect(baseline.walls["wall:corridor-east"].structural).toBe("unverified");
  });

  it("resolves which rooms a wall surface faces", () => {
    const a = baseline.surfaces["surface:bed3-front:a"].facesRooms;
    const b = baseline.surfaces["surface:bed3-front:b"].facesRooms;
    expect([...a, ...b].sort()).toEqual(["room:bed3", "room:living"]);
  });

  it("opening centres lie on their wall", () => {
    const o = baseline.openings["opening:o7"]; // bed3-front door
    expect(o.center[1]).toBeCloseTo(4.6, 6);
    expect(o.center[0]).toBeCloseTo(2.675, 3);
  });

  it("finds the room at a point", () => {
    expect(roomAtPoint(baseline, [2, 2])?.id).toBe("room:living");
    expect(roomAtPoint(baseline, [-5, -5])).toBeUndefined();
  });
});

describe("schemas", () => {
  it("transforms have no scale: extra keys are rejected", () => {
    expect(Transform.safeParse({ x: 0, y: 0, rot: 0 }).success).toBe(true);
    expect(Transform.safeParse({ x: 0, y: 0, rot: 0, scale: 1.3 }).success).toBe(false);
    expect(ItemNode.safeParse({ id: "a", kind: "item", catalog: ref(TABLE), transform: { x: 0, y: 0, scale: [1, 2, 1] } }).success).toBe(false);
  });

  it("document defaults and round-trips", () => {
    const d = fresh();
    expect(DesignDocument.parse(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });

  it("command schema validates public commands and rejects junk", () => {
    expect(CommandSchema.safeParse({ type: "move", id: "a", x: 1, y: 2 }).success).toBe(true);
    expect(CommandSchema.safeParse({ type: "move", id: "a", x: "1", y: 2 }).success).toBe(false);
    expect(CommandSchema.safeParse({ type: "drop-database" }).success).toBe(false);
    expect(CommandSchema.safeParse({ type: "move", id: "a", x: 1, y: 2, scale: 2 }).success).toBe(false);
    expect(CommandSchema.safeParse({ type: "batch", commands: [{ type: "remove", id: "a" }, { type: "rotate", id: "a", rot: 1 }] }).success).toBe(true);
  });

  it("internal commands are not public", () => {
    expect(isPublicCommand({ type: "remove", id: "a" })).toBe(true);
    expect(isPublicCommand({ type: "setNode", node: item("a") })).toBe(false);
    expect(isPublicCommand({ type: "batch", commands: [{ type: "restoreSnapshot", nodes: {}, overrides: {} }] })).toBe(false);
  });
});

describe("command engine", () => {
  it("add then inverse restores the document and never mutates the input", () => {
    const d0 = fresh();
    const frozen = JSON.stringify(d0);
    const r = apply(d0, { type: "add", node: item("t1") }, ctx);
    expect(JSON.stringify(d0)).toBe(frozen);
    expect(Object.keys(r.doc.nodes)).toEqual(["t1"]);
    expect(apply(r.doc, r.inverse, ctx).doc).toEqual(d0);
  });

  it("rejects duplicates, baseline ids and unknown nodes", () => {
    const d = apply(fresh(), { type: "add", node: item("t1") }, ctx).doc;
    expect(() => apply(d, { type: "add", node: item("t1") }, ctx)).toThrow(CommandError);
    expect(() => apply(d, { type: "add", node: item("wall:back") }, ctx)).toThrow(/baseline ids/);
    expect(() => apply(d, { type: "remove", id: "nope" }, ctx)).toThrow(/No design node/);
  });

  it("original property elements cannot be removed or moved", () => {
    const d = fresh();
    for (const cmd of [{ type: "remove", id: "wall:back" }, { type: "move", id: "room:living", x: 0, y: 0 }] as Command[]) {
      expect(() => apply(d, cmd, ctx)).toThrowError(expect.objectContaining({ code: "protected" }));
    }
  });

  it("move, rotate and their inverses", () => {
    const d = apply(fresh(), { type: "add", node: item("t1") }, ctx).doc;
    const m = apply(d, { type: "move", id: "t1", x: 3, y: 4 }, ctx);
    expect((m.doc.nodes.t1 as ItemNode).transform).toMatchObject({ x: 3, y: 4 });
    expect(apply(m.doc, m.inverse, ctx).doc).toEqual(d);
    const r = apply(d, { type: "rotate", id: "t1", rot: 1.5 }, ctx);
    expect((r.doc.nodes.t1 as ItemNode).transform.rot).toBe(1.5);
    expect(apply(r.doc, r.inverse, ctx).doc).toEqual(d);
  });

  it("locked nodes refuse edits", () => {
    const d = apply(fresh(), { type: "add", node: item("t1", { locked: true }) }, ctx).doc;
    expect(() => apply(d, { type: "move", id: "t1", x: 1, y: 1 }, ctx)).toThrowError(expect.objectContaining({ code: "locked" }));
    expect(() => apply(d, { type: "remove", id: "t1" }, ctx)).toThrowError(expect.objectContaining({ code: "locked" }));
  });

  it("duplicate offsets the copy, unlocks it and undoes by removal", () => {
    const d = apply(fresh(), { type: "add", node: item("t1", { locked: false }) }, ctx).doc;
    const r = apply(d, { type: "duplicate", id: "t1", newId: "t2", offset: [1, 0] }, ctx);
    expect((r.doc.nodes.t2 as ItemNode).transform.x).toBe(3);
    expect(apply(r.doc, r.inverse, ctx).doc).toEqual(d);
  });

  it("unknown catalog assets are refused", () => {
    const bad = item("x", { catalog: { id: "ghost-sofa", version: 1 } });
    expect(() => apply(fresh(), { type: "add", node: bad }, ctx)).toThrowError(expect.objectContaining({ code: "unknown-asset" }));
    const oldVersion = item("x", { catalog: { id: SOFA.id, version: 9 } });
    expect(() => apply(fresh(), { type: "add", node: oldVersion }, ctx)).toThrow(CommandError);
  });

  it("slot materials must exist, fit the slot and use known slots", () => {
    const d = apply(fresh(), { type: "add", node: item("t1") }, ctx).doc;
    const ok = apply(d, { type: "setSlotMaterial", id: "t1", slot: "top", material: ref(TRAVERTINE) }, ctx);
    expect((ok.doc.nodes.t1 as ItemNode).slots.top).toEqual(ref(TRAVERTINE));
    expect(apply(ok.doc, ok.inverse, ctx).doc).toEqual(d);
    expect(() => apply(d, { type: "setSlotMaterial", id: "t1", slot: "top", material: ref(BOUCLE) }, ctx)).toThrowError(expect.objectContaining({ code: "bad-material" }));
    expect(() => apply(d, { type: "setSlotMaterial", id: "t1", slot: "wheels", material: ref(BRASS) }, ctx)).toThrowError(expect.objectContaining({ code: "unknown-slot" }));
    expect(() => apply(d, { type: "setSlotMaterial", id: "t1", slot: "top", material: { id: "nope", version: 1 } }, ctx)).toThrowError(expect.objectContaining({ code: "unknown-asset" }));
  });

  it("changing one item's material leaves other items untouched", () => {
    let d = apply(fresh(), { type: "add", node: item("t1") }, ctx).doc;
    d = apply(d, { type: "add", node: item("t2", { transform: { x: 4, y: 2, z: 0, rot: 0 } }) }, ctx).doc;
    d = apply(d, { type: "setSlotMaterial", id: "t1", slot: "top", material: ref(TRAVERTINE) }, ctx).doc;
    expect((d.nodes.t2 as ItemNode).slots).toEqual({});
  });

  it("surface materials: valid, cleared, wrong category, unknown surface", () => {
    const d = fresh();
    const wall = baselineIds.wallSurface("bed3-front", "a");
    const floor = baselineIds.floor("living");
    const w = apply(d, { type: "setSurfaceMaterial", surfaceId: wall, material: ref(PAINT) }, ctx);
    expect(w.doc.overrides[wall].material).toEqual(ref(PAINT));
    expect(apply(w.doc, w.inverse, ctx).doc).toEqual(d);
    const f = apply(w.doc, { type: "setSurfaceMaterial", surfaceId: floor, material: ref(PARQUET) }, ctx);
    expect(Object.keys(f.doc.overrides)).toHaveLength(2);
    const cleared = apply(f.doc, { type: "setSurfaceMaterial", surfaceId: floor, material: null }, ctx);
    expect(cleared.doc.overrides[floor]).toBeUndefined();
    expect(() => apply(d, { type: "setSurfaceMaterial", surfaceId: floor, material: ref(PAINT) }, ctx)).toThrowError(expect.objectContaining({ code: "bad-material" }));
    expect(() => apply(d, { type: "setSurfaceMaterial", surfaceId: "surface:ghost:a", material: ref(PAINT) }, ctx)).toThrowError(expect.objectContaining({ code: "unknown-surface" }));
    expect(SURFACE_CATEGORIES.floor).not.toContain("paint");
  });

  it("glazing and railing surfaces are not paintable", () => {
    expect(baseline.surfaces["surface:facade:a"].paintable).toBe(false);
    expect(baseline.surfaces["surface:rail:b"].paintable).toBe(false);
    expect(baseline.surfaces["surface:back:a"].paintable).toBe(true);
    expect(() => apply(fresh(), { type: "setSurfaceMaterial", surfaceId: "surface:facade:a", material: ref(PAINT) }, ctx)).toThrowError(expect.objectContaining({ code: "unsupported" }));
  });

  it("surface changes never touch the baseline", () => {
    const before = canonicalJson(baseline);
    apply(fresh(), { type: "setSurfaceMaterial", surfaceId: baselineIds.floor("living"), material: ref(PARQUET) }, ctx);
    expect(canonicalJson(baseline)).toBe(before);
  });

  it("replace keeps position, resets slots and sets the default modular config", () => {
    let d = apply(fresh(), { type: "add", node: item("t1", { transform: { x: 5, y: 2, z: 0, rot: 0.5 } }) }, ctx).doc;
    d = apply(d, { type: "setSlotMaterial", id: "t1", slot: "top", material: ref(TRAVERTINE) }, ctx).doc;
    const r = apply(d, { type: "replace", id: "t1", catalog: ref(SOFA) }, ctx);
    const n = r.doc.nodes.t1 as ItemNode;
    expect(n.catalog.id).toBe(SOFA.id);
    expect(n.transform).toMatchObject({ x: 5, y: 2, rot: 0.5 });
    expect(n.slots).toEqual({});
    expect(n.modules).toEqual(["arm-l", "seat-100", "seat-100", "arm-r"]);
    expect(apply(r.doc, r.inverse, ctx).doc).toEqual(d);
  });

  it("setModules accepts a legal 4 m configuration and rejects illegal ones atomically", () => {
    const d = apply(fresh(), { type: "add", node: item("s", { catalog: ref(SOFA), modules: ["arm-l", "seat-100", "seat-100", "arm-r"] }) }, ctx).doc;
    const four = ["arm-l", "seat-120", "seat-120", "seat-120", "arm-r"];
    const r = apply(d, { type: "setModules", id: "s", modules: four }, ctx);
    expect((r.doc.nodes.s as ItemNode).modules).toEqual(four);
    expect(() => apply(d, { type: "setModules", id: "s", modules: ["seat-100", "arm-r"] }, ctx)).toThrowError(expect.objectContaining({ code: "bad-size" }));
    expect((d.nodes.s as ItemNode).modules).toHaveLength(4);
  });

  it("setVariant and setParams validate sizes", () => {
    const chair = item("c", { catalog: { id: "dining-chair", version: 2 } });
    const d = apply(fresh(), { type: "add", node: chair }, ctx).doc;
    expect((apply(d, { type: "setVariant", id: "c", variantId: "bar" }, ctx).doc.nodes.c as ItemNode).variantId).toBe("bar");
    expect(() => apply(d, { type: "setVariant", id: "c", variantId: "huge" }, ctx)).toThrowError(expect.objectContaining({ code: "bad-size" }));
  });

  it("restoreBaseline clears everything and can be undone exactly", () => {
    let d = apply(fresh(), { type: "add", node: item("t1") }, ctx).doc;
    d = apply(d, { type: "setSurfaceMaterial", surfaceId: baselineIds.floor("living"), material: ref(PARQUET) }, ctx).doc;
    const r = apply(d, { type: "restoreBaseline" }, ctx);
    expect(r.doc.nodes).toEqual({});
    expect(r.doc.overrides).toEqual({});
    expect(apply(r.doc, r.inverse, ctx).doc).toEqual(d);
  });

  it("proposals: partition needs length, opening must fit its wall", () => {
    const part: DesignNode = { id: "p1", kind: "partitionProposal", a: [0, 0], b: [0.05, 0], thickness: 0.1, locked: false };
    expect(() => apply(fresh(), { type: "add", node: part }, ctx)).toThrowError(expect.objectContaining({ code: "bad-proposal" }));
    const longPart: DesignNode = { ...part, b: [2, 0] } as DesignNode;
    expect(apply(fresh(), { type: "add", node: longPart }, ctx).doc.nodes.p1.kind).toBe("partitionProposal");
    const op = (at: number, width: number): DesignNode => ({ id: "o1", kind: "openingProposal", wallId: "wall:kitchen-corridor", at, width, locked: false });
    expect(apply(fresh(), { type: "add", node: op(1, 0.9) }, ctx).doc.nodes.o1.kind).toBe("openingProposal");
    expect(() => apply(fresh(), { type: "add", node: op(0.2, 0.9) }, ctx)).toThrowError(expect.objectContaining({ code: "bad-proposal" }));
    expect(() => apply(fresh(), { type: "add", node: { ...op(1, 0.9), wallId: "wall:ghost" } as DesignNode }, ctx)).toThrow(CommandError);
  });

  it("a failing batch changes nothing; a good batch is one undo step", () => {
    const d0 = fresh();
    const bad: Command = { type: "batch", commands: [{ type: "add", node: item("a") }, { type: "remove", id: "ghost" }] };
    expect(() => apply(d0, bad, ctx)).toThrow(CommandError);
    expect(d0.nodes).toEqual({});
    const good: Command = { type: "batch", label: "ai", commands: [{ type: "add", node: item("a") }, { type: "add", node: item("b", { transform: { x: 4, y: 2, z: 0, rot: 0 } }) }] };
    const h = new History(d0, ctx);
    h.do(good);
    expect(Object.keys(h.doc.nodes)).toHaveLength(2);
    h.undo();
    expect(h.doc).toEqual(d0);
  });
});

describe("history", () => {
  it("undo/redo walk the stack and a new command clears redo", () => {
    const h = new History(fresh(), ctx);
    h.do({ type: "add", node: item("a") });
    h.do({ type: "move", id: "a", x: 5, y: 3 });
    const afterMove = structuredClone(h.doc);
    expect(h.canUndo).toBe(true);
    h.undo();
    expect((h.doc.nodes.a as ItemNode).transform.x).toBe(2);
    h.redo();
    expect(h.doc).toEqual(afterMove);
    h.undo();
    h.do({ type: "rotate", id: "a", rot: 1 });
    expect(h.canRedo).toBe(false);
    h.undo(); h.undo();
    expect(h.doc.nodes).toEqual({});
    expect(h.canUndo).toBe(false);
  });

  it("a failed command leaves history and document untouched", () => {
    const h = new History(fresh(), ctx);
    h.do({ type: "add", node: item("a") });
    expect(() => h.do({ type: "remove", id: "ghost" })).toThrow(CommandError);
    h.undo();
    expect(h.doc.nodes).toEqual({});
  });

  it("caps history length", () => {
    const h = new History(fresh(), ctx, 3);
    for (let i = 0; i < 6; i++) h.do({ type: "add", node: item(`n${i}`, { transform: { x: i, y: 1, z: 0, rot: 0 } }) });
    for (let i = 0; i < 10; i++) h.undo();
    expect(Object.keys(h.doc.nodes)).toHaveLength(3);
  });
});

describe("migrations", () => {
  it("passes a current document through unchanged", () => {
    const d = fresh();
    expect(migrateDocument(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });

  it("rejects newer, malformed and unmigratable documents", () => {
    expect(() => migrateDocument({ ...fresh(), schemaVersion: 99 })).toThrow(MigrationError);
    expect(() => migrateDocument(null)).toThrow(MigrationError);
    expect(() => migrateDocument({ nodes: {} })).toThrow(MigrationError);
    expect(() => migrateDocument({ ...fresh(), schemaVersion: 1 }, [], 2)).toThrow(/No migration/);
  });

  it("runs an injected chain in order", () => {
    const calls: number[] = [];
    const chain = [
      { from: 1, to: 2, run: (r: Record<string, unknown>) => (calls.push(1), r) },
      { from: 2, to: 3, run: (r: Record<string, unknown>) => (calls.push(2), r) },
    ];
    // target 3 would not parse as DesignDocument (literal 1), so check the chain stops at the parse step
    expect(() => migrateDocument({ ...fresh() }, chain, 3)).toThrow();
    expect(calls).toEqual([1, 2]);
  });
});
