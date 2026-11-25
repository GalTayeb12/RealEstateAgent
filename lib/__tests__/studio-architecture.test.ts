import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { YARKON_TWIN } from "../twin/fixtures/yarkon";
import { baselineFromTwin, baselineRef } from "../studio/baseline/fromTwin";
import { apply, CommandError } from "../studio/commands/apply";
import { CommandSchema, isPublicCommand, type Command } from "../studio/commands/types";
import { previewProposal } from "../studio/design/preview";
import { BASE_ID, proposeKitchenLayouts, WALL_ID } from "../studio/design/kitchen";
import { catalogFrom, ModelManifest } from "../studio/schema/catalog";
import { emptyDocument, type DesignDocument } from "../studio/schema/document";
import type { DesignNode, ItemNode } from "../studio/schema/nodes";
import { nearestWall, snapToWallFace, validateProposals } from "../studio/validation/architecture";
import { errorsOf, validateDocument } from "../studio/validation/placement";
import { TABLE } from "./studio-fixtures";

const baseline = baselineFromTwin(YARKON_TWIN);
const dir = path.resolve(__dirname, "../../catalog/manifests");
const kitchenModels = [BASE_ID, WALL_ID].map((id) => { const j = JSON.parse(fs.readFileSync(path.join(dir, `${id}@1.json`), "utf8")); delete j._note; return ModelManifest.parse(j); });
const catalog = catalogFrom([TABLE, ...kitchenModels], []);
const doc0 = (): DesignDocument => emptyDocument(baselineRef("yarkon", 1, baseline));
const withNodes = (...nodes: DesignNode[]): DesignDocument => ({ ...doc0(), nodes: Object.fromEntries(nodes.map((n) => [n.id, n])) });

const partition = (id: string, a: [number, number], b: [number, number], thickness = 0.1): DesignNode => ({ id, kind: "partitionProposal", locked: false, a, b, thickness });
const opening = (id: string, wallId: string, at: number, width = 0.9): DesignNode => ({ id, kind: "openingProposal", locked: false, wallId, at, width });
const table = (id: string, x: number, y: number, rot = 0): ItemNode => ({ id, kind: "item", locked: false, catalog: { id: TABLE.id, version: 1 }, slots: {}, transform: { x, y, z: 0, rot } });
const codes = (d: DesignDocument, id: string, sev: "error" | "advisory") => validateProposals(d, baseline, catalog).filter((i) => i.nodeId === id && i.severity === sev).map((i) => i.code);

describe("partition proposals", () => {
  it("a free-standing divider inside the living room is accepted, and always labelled unverified", () => {
    const d = withNodes(partition("p1", [4, 4.5], [4, 2]));
    expect(codes(d, "p1", "error")).toEqual([]);
    expect(codes(d, "p1", "advisory")).toContain("unverified");
  });

  it("refuses a partition shorter than 40 cm", () => {
    expect(codes(withNodes(partition("p1", [4, 2], [4, 2.3])), "p1", "error")).toContain("partition-length");
  });

  it("refuses to run through a protected exterior wall, an interior wall, or across the room edge", () => {
    expect(codes(withNodes(partition("p1", [-0.5, 2], [1, 2])), "p1", "error")).toContain("protected-wall");
    expect(codes(withNodes(partition("p1", [1, 4.0], [1, 4.7])), "p1", "error")).toContain("hits-wall");
    expect(codes(withNodes(partition("p1", [4, -0.5], [4, 2])), "p1", "error")).toContain("out-of-room");
  });

  it("refuses to block an existing doorway and to cut through furniture", () => {
    expect(codes(withNodes(partition("p1", [7.0, 4.0], [8.14, 4.0])), "p1", "error")).toContain("blocks-opening");
    expect(codes(withNodes(partition("p1", [4, 4.5], [4, 2]), table("t", 4, 3.2, 0)), "p1", "error")).toContain("hits-item");
  });

  it("refuses two overlapping partitions", () => {
    const d = withNodes(partition("p1", [4, 4.5], [4, 2]), partition("p2", [4.02, 4.0], [4.02, 3.0]));
    expect(codes(d, "p2", "error")).toContain("overlap");
  });

  it("warns about a narrow passage between the partition and a wall", () => {
    const d = withNodes(partition("p1", [4, 4.5], [4, 2]), partition("p2", [4.5, 4.5], [4.5, 2]));
    expect(validateProposals(d, baseline, catalog).some((i) => i.code === "narrow-passage")).toBe(false); // 40 cm apart but not walls
    const near = withNodes(partition("p1", [1, 4.5], [1, 2]), partition("p3", [0.35, 4.5], [0.35, 2]));
    expect(validateProposals(near, baseline, catalog).some((i) => i.code === "narrow-passage")).toBe(true); // 35 cm from the west wall
  });
});

describe("opening proposals", () => {
  it("accepts a doorway in an unverified interior wall with the structural-check advisory", () => {
    const d = withNodes(opening("o1", "wall:kitchen-corridor", 1.25));
    expect(codes(d, "o1", "error")).toEqual([]);
    expect(codes(d, "o1", "advisory").sort()).toEqual(["structural-check", "unverified"]);
  });

  it("never allows an opening in a protected wall", () => {
    expect(codes(withNodes(opening("o1", "wall:back", 6)), "o1", "error")).toContain("protected-wall");
    expect(codes(withNodes(opening("o1", "wall:west", 3)), "o1", "error")).toContain("protected-wall");
  });

  it("checks width, wall edges, existing openings and unknown walls", () => {
    expect(codes(withNodes(opening("o", "wall:kitchen-corridor", 1.25, 0.4)), "o", "error")).toContain("opening-width");
    expect(codes(withNodes(opening("o", "wall:kitchen-corridor", 0.3, 0.9)), "o", "error")).toContain("outside-wall");
    expect(codes(withNodes(opening("o", "wall:bed3-front", 2.0, 0.9)), "o", "error")).toContain("overlap"); // door o7 is right there
    expect(codes(withNodes(opening("o", "wall:nope", 1)), "o", "error")).toContain("no-wall");
  });

  it("rejects two proposed openings that crowd each other, and furniture standing in the way", () => {
    const d = withNodes(opening("o1", "wall:kitchen-corridor", 0.8), opening("o2", "wall:kitchen-corridor", 1.6));
    expect(codes(d, "o2", "error")).toContain("overlap");
    const blocked = withNodes(opening("o1", "wall:kitchen-corridor", 1.25), table("t", 7.0, 7.25, Math.PI / 2));
    expect(codes(blocked, "o1", "error")).toContain("blocks-opening");
  });
});

describe("proposals act as real obstacles for furniture", () => {
  it("an item cannot stand inside a proposed partition, nor in front of a proposed doorway", () => {
    const d = withNodes(partition("p1", [4, 4.5], [4, 2]), table("t", 4, 3, 0));
    expect(errorsOf(validateDocument(d, baseline, catalog)).some((i) => i.nodeId === "t" && i.code === "wall-collision")).toBe(true);
    const d2 = withNodes(opening("o1", "wall:kitchen-corridor", 1.25), table("t", 7.0, 7.25, Math.PI / 2));
    expect(errorsOf(validateDocument(d2, baseline, catalog)).some((i) => i.nodeId === "t" && i.code === "blocks-opening")).toBe(true);
  });

  it("previewProposal reports only the issues of the proposal itself", () => {
    const d = withNodes(partition("p1", [4, 4.5], [4, 2]), opening("o1", "wall:back", 6));
    const p = previewProposal(d, d.nodes.o1, baseline, catalog);
    expect(p.ok).toBe(false);
    expect(p.errors.every((e) => e.nodeId === "o1" || e.otherId === "o1")).toBe(true);
  });
});

describe("snapping to the wall", () => {
  it("snaps a drawn end point to the nearest wall face, otherwise leaves it alone", () => {
    const s = snapToWallFace(baseline, [1.0, 4.45]);
    expect(s.snapped).toBe(true);
    expect(s.point[1]).toBeCloseTo(4.6 - 0.06, 9); // living side face of wall:bed3-front
    const far = snapToWallFace(baseline, [4, 2.5]);
    expect(far).toEqual({ point: [4, 2.5], snapped: false });
    // a snapped partition ends flush: it is accepted where an unsnapped overlap would not be
    const flush = withNodes(partition("p", [1, snapToWallFace(baseline, [1, 4.45]).point[1]], [1, 2]));
    expect(codes(flush, "p", "error")).toEqual([]);
  });

  it("finds the wall nearest to a point and the position along it", () => {
    const n = nearestWall(baseline, [7.1, 7.0])!;
    expect(n.wallId).toBe("wall:kitchen-corridor");
    expect(n.at).toBeCloseTo(1.0, 9);
    expect(nearestWall(baseline, [4, 2.5], 0.5)).toBeNull();
  });
});

describe("commands on proposals", () => {
  const ctx = { baseline, catalog };

  it("add and setProposal are exact and undoable; the baseline is never touched", () => {
    const before = JSON.stringify(baseline);
    let doc = doc0();
    const add: Command = { type: "add", node: partition("p1", [4, 4.5], [4, 2]) };
    const a = apply(doc, add, ctx);
    doc = a.doc;
    const s = apply(doc, { type: "setProposal", id: "p1", patch: { thickness: 0.15, note: "pocket door here" } }, ctx);
    expect((s.doc.nodes.p1 as { thickness: number }).thickness).toBe(0.15);
    expect(apply(s.doc, s.inverse, ctx).doc).toEqual(doc);
    expect(JSON.stringify(baseline)).toBe(before);
    expect(apply(s.doc, { type: "restoreBaseline" }, ctx).doc.nodes).toEqual({}); // proposals vanish with "restore original"
  });

  it("setProposal rejects fields of the wrong kind, bad thickness and non-proposals", () => {
    const doc = withNodes(partition("p1", [4, 4.5], [4, 2]), opening("o1", "wall:kitchen-corridor", 1.25), table("t", 4, 3));
    expect(() => apply(doc, { type: "setProposal", id: "p1", patch: { width: 1 } }, ctx)).toThrow(CommandError);
    expect(() => apply(doc, { type: "setProposal", id: "o1", patch: { thickness: 0.2 } }, ctx)).toThrow(CommandError);
    expect(() => apply(doc, { type: "setProposal", id: "p1", patch: { thickness: 0.9 } }, ctx)).toThrow(CommandError);
    expect(() => apply(doc, { type: "setProposal", id: "t", patch: { note: "x" } }, ctx)).toThrow(CommandError);
    expect(apply(doc, { type: "setProposal", id: "o1", patch: { at: 1.0, width: 1.0 } }, ctx).doc.nodes.o1).toMatchObject({ at: 1.0, width: 1.0 });
  });

  it("the command is part of the public vocabulary and its schema is strict", () => {
    const c: Command = { type: "setProposal", id: "p1", patch: { thickness: 0.12 } };
    expect(isPublicCommand(c)).toBe(true);
    expect(CommandSchema.safeParse(c).success).toBe(true);
    expect(CommandSchema.safeParse({ type: "setProposal", id: "p1", patch: { hacked: 1 } }).success).toBe(false);
  });
});

describe("kitchen layout proposals", () => {
  const layouts = () => proposeKitchenLayouts(baseline, doc0(), catalog);

  it("finds single-wall, galley and L layouts for the Yarkon kitchen (open to the living room on one side, so no U)", () => {
    const ids = layouts().map((l) => l.id);
    expect(ids).toContain("single");
    expect(ids).toContain("galley");
    expect(ids).toContain("l-shape");
    expect(ids).not.toContain("u-shape");
  });

  it("is sorted by counter length and every layout is ONE undoable batch that applies cleanly with zero placement errors", () => {
    const ls = layouts();
    for (let i = 1; i < ls.length; i++) expect(ls[i - 1].counter).toBeGreaterThanOrEqual(ls[i].counter);
    for (const l of ls) {
      expect(l.commands).toHaveLength(1);
      expect(l.commands[0].type).toBe("batch");
      const r = apply(doc0(), l.commands[0], { baseline, catalog });
      expect(errorsOf(validateDocument(r.doc, baseline, catalog)), l.id).toEqual([]);
      expect(apply(r.doc, r.inverse, { baseline, catalog }).doc.nodes).toEqual({}); // one undo removes the whole kitchen
      const runs = Object.values(r.doc.nodes).filter((n): n is ItemNode => n.kind === "item" && n.catalog.id === BASE_ID);
      expect(Math.round(runs.reduce((s, n) => s + (n.params?.width ?? 0), 0) * 10) / 10, l.id).toBeCloseTo(l.counter, 9);
      expect(runs.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("runs stand against real walls with their backs to them (no run floats in the open-plan side)", () => {
    for (const l of layouts()) {
      const r = apply(doc0(), l.commands[0], { baseline, catalog }).doc;
      for (const n of Object.values(r.nodes)) {
        if (n.kind !== "item") continue;
        expect(validateDocument(r, baseline, catalog).filter((i) => i.nodeId === n.id && i.code === "not-against-wall"), `${l.id} ${n.id}`).toEqual([]);
      }
    }
  });

  it("proposing again replaces the earlier kitchen instead of stacking a second one", () => {
    const first = layouts()[0];
    const doc1 = apply(doc0(), first.commands[0], { baseline, catalog }).doc;
    const again = proposeKitchenLayouts(baseline, doc1, catalog)[0];
    const doc2 = apply(doc1, again.commands[0], { baseline, catalog }).doc;
    expect(Object.keys(doc2.nodes).length).toBeLessThanOrEqual(Object.keys(doc1.nodes).length + 2);
    expect(errorsOf(validateDocument(doc2, baseline, catalog))).toEqual([]);
  });

  it("returns nothing when the room is unknown or the catalog lacks the kitchen runs", () => {
    expect(proposeKitchenLayouts(baseline, doc0(), catalog, "room:nope")).toEqual([]);
    expect(proposeKitchenLayouts(baseline, doc0(), catalogFrom([TABLE], []))).toEqual([]);
  });

  it("layouts are rejected when furniture occupies the wall", () => {
    // a large table across the whole west side leaves no valid run there; layouts using it must disappear or move
    const blocked = withNodes(table("t", 3.5, 6.5, Math.PI / 2));
    const ls = proposeKitchenLayouts(baseline, blocked, catalog);
    for (const l of ls) {
      const r = apply(blocked, l.commands[0], { baseline, catalog }).doc;
      expect(errorsOf(validateDocument(r, baseline, catalog)), l.id).toEqual([]);
    }
  });
});
