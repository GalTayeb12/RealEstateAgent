import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GENERATORS, GAP, generate, partsBounds, splitRun, type GeneratorId, type Part } from "../studio/catalog/generators";
import { paramCombos, verifyGenerated, verifyParts } from "../studio/catalog/generators/verify";
import { resolveSize } from "../studio/catalog/sizing";
import { ModelManifest } from "../studio/schema/catalog";
import { partGeometry } from "../../components/studio/scene/generated";

const dir = path.resolve(__dirname, "../../catalog/manifests");
const manifests = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))).filter((j) => j.type === "model").map((j) => { delete j._note; return ModelManifest.parse(j); }).filter((m) => m.sizing.mode === "parametric" && m.sizing.generator);
const byGen = (g: GeneratorId) => manifests.find((m) => m.sizing.mode === "parametric" && m.sizing.generator === g)!;
const parts = (g: GeneratorId, params: Record<string, number>) => { const m = byGen(g); return generate(g, resolveSize(m, { params }), params); };
const count = (ps: Part[], kind: Part["kind"]) => ps.filter((p) => p.kind === kind).length;

describe("parametric generators: catalog", () => {
  it("every generator has a published manifest", () => {
    expect([...new Set(manifests.map((m) => (m.sizing.mode === "parametric" ? m.sizing.generator : "")))].sort()).toEqual(Object.keys(GENERATORS).sort());
  });

  it("all manifests pass the quality gates at min / default / max of every parameter", () => {
    for (const m of manifests) {
      expect(paramCombos(m).length).toBeGreaterThan(1);
      expect(verifyGenerated(m), m.id).toEqual([]);
    }
  });

  it("the generated size always equals the resolved size within 1 cm, across a sweep of every step", () => {
    for (const m of manifests) {
      if (m.sizing.mode !== "parametric") continue;
      const first = m.sizing.params[0];
      for (let v = first.min; v <= first.max + 1e-9; v += first.step) {
        const params = { [first.id]: Math.round(v * 100) / 100 };
        const dims = resolveSize(m, { params });
        const b = partsBounds(generate(m.sizing.generator!, dims, params));
        expect(Math.abs(b.x1 - b.x0 - dims.w), `${m.id} ${JSON.stringify(params)}`).toBeLessThan(0.01);
        expect(Math.abs(b.z0 + dims.d)).toBeLessThan(0.01);
        expect(Math.abs(b.y1 - dims.h)).toBeLessThan(0.01);
      }
    }
  });
});

describe("kitchen run", () => {
  it("splits a run into equal units between 40 and 90 cm", () => {
    for (let w = 0.4; w <= 6; w += 0.1) {
      const { n, unit } = splitRun(Math.round(w * 10) / 10);
      expect(unit * n).toBeCloseTo(Math.round(w * 10) / 10, 9);
      expect(unit).toBeLessThanOrEqual(0.9 + 1e-9);
      if (w >= 0.8) expect(unit).toBeGreaterThanOrEqual(0.4 - 1e-9);
    }
  });

  it("2.4 m = four 60 cm units, the second a three-drawer stack: 3 doors + 3 drawers, a handle on each", () => {
    const ps = parts("base-run", { width: 2.4 });
    expect(ps.filter((p) => p.id.startsWith("door-")).length).toBe(3);
    expect(ps.filter((p) => p.id.startsWith("drawer-")).length).toBe(3);
    expect(count(ps, "hardware")).toBe(count(ps, "front"));
    const door = ps.find((p) => p.id === "door-0")!;
    expect(door.w).toBeCloseTo(0.6 - GAP, 9);
  });

  it("adjacent doors keep exactly a 3 mm gap", () => {
    const ps = parts("base-run", { width: 2.4 }).filter((p) => p.id.startsWith("door-")).sort((a, b) => a.cx - b.cx);
    for (let i = 1; i < ps.length; i++) {
      if (ps[i].cx - ps[i - 1].cx > 0.7) continue; // a drawer stack sits between these two
      expect(ps[i].cx - ps[i].w / 2 - (ps[i - 1].cx + ps[i - 1].w / 2)).toBeCloseTo(GAP, 9);
    }
  });

  it("countertop is 4 cm stone at 86-90 cm covering the full run and overhanging the fronts", () => {
    const ps = parts("base-run", { width: 3 });
    const top = ps.find((p) => p.id === "countertop")!;
    expect(top.slot).toBe("countertop");
    expect(top.w).toBeCloseTo(3, 9);
    expect(top.cy + top.h / 2).toBeCloseTo(0.9, 9);
    expect(top.h).toBeCloseTo(0.04, 9);
    const door = ps.find((p) => p.id === "door-0")!;
    expect(top.cz - top.d / 2).toBeLessThan(door.cz - door.d / 2); // overhang at the front
  });

  it("wall units hang as a 35 cm deep run with a handle per door", () => {
    const ps = parts("wall-run", { width: 1.8 });
    expect(ps.filter((p) => p.id.startsWith("door-")).length).toBe(3);
    expect(count(ps, "hardware")).toBe(3);
    expect(partsBounds(ps).z0).toBeCloseTo(-0.35, 9);
  });
});

describe("wardrobe, shelving, bed", () => {
  it("wardrobe doors stay between 40 and 75 cm and the count grows with the width", () => {
    let last = 0;
    for (let w = 0.8; w <= 3.6 + 1e-9; w += 0.1) {
      const ps = parts("wardrobe", { width: Math.round(w * 10) / 10, height: 2.4 });
      const doors = ps.filter((p) => p.id.startsWith("door-"));
      expect(doors.length).toBeGreaterThanOrEqual(last);
      last = doors.length;
      for (const d of doors) { expect(d.w + GAP).toBeGreaterThanOrEqual(0.39); expect(d.w + GAP).toBeLessThanOrEqual(0.76); }
    }
  });

  it("wardrobe height follows the parameter and the doors stop 6 cm above the floor", () => {
    for (const h of [2.0, 2.3, 2.6]) {
      const ps = parts("wardrobe", { width: 2, height: h });
      expect(partsBounds(ps).y1).toBeCloseTo(h, 9);
      const door = ps.find((p) => p.id === "door-0")!;
      expect(door.cy - door.h / 2).toBeGreaterThan(0.06);
    }
  });

  it("shelving has an upright at least every 90 cm and shelf openings of 28-50 cm", () => {
    for (const w of [0.6, 1.2, 1.9, 3.0]) for (const h of [1.0, 1.7, 2.6]) {
      const ps = parts("shelving", { width: w, height: h });
      const uprights = ps.filter((p) => p.id.startsWith("upright-")).sort((a, b) => a.cx - b.cx);
      for (let i = 1; i < uprights.length; i++) expect(uprights[i].cx - uprights[i - 1].cx - 0.022).toBeLessThanOrEqual(0.9 + 1e-9);
      const ys = [...new Set(ps.filter((p) => p.id.startsWith("shelf-")).map((p) => p.cy.toFixed(4)))].map(Number).sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) { const open = ys[i] - ys[i - 1] - 0.022; expect(open).toBeGreaterThan(0.28); expect(open).toBeLessThan(0.5); }
    }
  });

  it("bed: headboard height drives the size, the mattress sits on the base, pillows follow the width", () => {
    const wide = parts("bed", { width: 1.8, headboard: 1.3 }), single = parts("bed", { width: 0.9, headboard: 0.9 });
    expect(partsBounds(wide).y1).toBeCloseTo(1.3, 9);
    expect(count(wide.filter((p) => p.id.startsWith("pillow-")), "body")).toBe(2);
    expect(single.filter((p) => p.id.startsWith("pillow-")).length).toBe(1);
    const m = wide.find((p) => p.id === "mattress")!, base = wide.find((p) => p.id === "base")!;
    expect(m.cy - m.h / 2).toBeCloseTo(base.cy + base.h / 2, 9);
  });
});

describe("quality gates reject bad geometry", () => {
  const slots = ["fronts"];
  const good = (): Part => ({ id: "a", slot: "fronts", cx: 0, cy: 0.5, cz: -0.3, w: 1, h: 1, d: 0.6, r: 0.002, kind: "body" });
  const dims = { w: 1, d: 0.6, h: 1 };

  it("accepts a sound part", () => expect(verifyParts([good()], slots, dims, "x")).toEqual([]));
  it("flags a razor-sharp edge", () => expect(verifyParts([{ ...good(), r: 0 }], slots, dims, "x").join()).toContain("no edge bevel"));
  it("flags the wrong overall size", () => expect(verifyParts([good()], slots, { w: 1.2, d: 0.6, h: 1 }, "x").join()).toContain("width"));
  it("flags an undeclared or empty slot", () => {
    expect(verifyParts([{ ...good(), slot: "ghost" }], slots, dims, "x").join()).toContain("undeclared slot");
    expect(verifyParts([good()], ["fronts", "handle"], dims, "x").join()).toContain('slot "handle" has no geometry');
  });
  it("flags overlapping fronts, tight gaps and missing handles", () => {
    const f = (id: string, cx: number): Part => ({ ...good(), id, cx, w: 0.5, kind: "front" });
    expect(verifyParts([f("a", -0.25), f("b", -0.25)], slots, { w: 0.5, d: 0.6, h: 1 }, "x").join()).toContain("overlap");
    expect(verifyParts([f("a", -0.2505), f("b", 0.2505)], slots, { w: 1.001, d: 0.6, h: 1 }, "x").join()).toContain("closer than");
    expect(verifyParts([f("a", -0.2515), f("b", 0.2515)], slots, { w: 1.003, d: 0.6, h: 1 }, "x").join()).toContain("handles");
  });
});

describe("world-scale UVs and bevels", () => {
  it("UVs are in metres: the front face of a 0.6 x 0.76 m part spans 0.6 x 0.76 of UV space", () => {
    const g = partGeometry({ id: "d", slot: "fronts", cx: 0.3, cy: 0.5, cz: -0.4, w: 0.6, h: 0.76, d: 0.02, r: 0.002, kind: "front" });
    const pos = g.getAttribute("position"), nor = g.getAttribute("normal"), uv = g.getAttribute("uv");
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let i = 0; i < pos.count; i++) if (nor.getZ(i) < -0.99) { u0 = Math.min(u0, uv.getX(i)); u1 = Math.max(u1, uv.getX(i)); v0 = Math.min(v0, uv.getY(i)); v1 = Math.max(v1, uv.getY(i)); }
    expect(u1 - u0).toBeCloseTo(0.6, 2);
    expect(v1 - v0).toBeCloseTo(0.76, 2);
  });

  it("neighbouring parts share one UV space: the same world x gives the same u (grain continues)", () => {
    const a = partGeometry({ id: "a", slot: "x", cx: 0, cy: 0.5, cz: -0.3, w: 1, h: 0.04, d: 0.6, r: 0.002, kind: "top" });
    const b = partGeometry({ id: "b", slot: "x", cx: 1, cy: 0.5, cz: -0.3, w: 1, h: 0.04, d: 0.6, r: 0.002, kind: "top" });
    const edge = (g: THREE.BufferGeometry, x: number) => { const p = g.getAttribute("position"), n = g.getAttribute("normal"), uv = g.getAttribute("uv"); for (let i = 0; i < p.count; i++) if (n.getY(i) > 0.99 && Math.abs(p.getX(i) - x) < 1e-6) return uv.getX(i); return NaN; };
    expect(edge(a, 0.5 - 0.002)).toBeDefined();
    const ua = (() => { const p = a.getAttribute("position"), n = a.getAttribute("normal"), uv = a.getAttribute("uv"); let m = -Infinity; for (let i = 0; i < p.count; i++) if (n.getY(i) > 0.99) m = Math.max(m, uv.getX(i)); return m; })();
    const ub = (() => { const p = b.getAttribute("position"), n = b.getAttribute("normal"), uv = b.getAttribute("uv"); let m = Infinity; for (let i = 0; i < p.count; i++) if (n.getY(i) > 0.99) m = Math.min(m, uv.getX(i)); return m; })();
    expect(Math.abs(ub - ua)).toBeLessThan(0.01); // 1 m wide parts touching at x = 0.5 meet in UV space
  });

  it("every generated part has a real bevel (RoundedBox, not a razor edge): edge normals are not axis-aligned", () => {
    const g = partGeometry({ id: "a", slot: "x", cx: 0, cy: 0, cz: 0, w: 0.6, h: 0.76, d: 0.02, r: 0.002, kind: "front" });
    const n = g.getAttribute("normal");
    let diag = 0;
    for (let i = 0; i < n.count; i++) if (Math.max(Math.abs(n.getX(i)), Math.abs(n.getY(i)), Math.abs(n.getZ(i))) < 0.98) diag++;
    expect(diag).toBeGreaterThan(0);
  });
});

describe("manifest schema", () => {
  const base = JSON.parse(fs.readFileSync(path.join(dir, "wardrobe-hinged-01@1.json"), "utf8"));
  it("a generator-built model must not ship a GLB, and a GLB-less model must have a generator", () => {
    expect(ModelManifest.safeParse({ ...base, assets: { ...base.assets, glb: "x/1/model.glb" } }).success).toBe(false);
    expect(ModelManifest.safeParse({ ...base, sizing: { ...base.sizing, generator: undefined } }).success).toBe(false);
    expect(ModelManifest.safeParse(base).success).toBe(true);
  });
});

describe("case furniture and tables", () => {
  it("a table has its top at the full height and four legs inside the footprint", () => {
    const ps = parts("table", { width: 1.8, depth: 0.7 });
    const top = ps.find((p) => p.id === "top")!;
    expect(top.cy + top.h / 2).toBeCloseTo(byGen("table").dims.h, 9); // desk 74 cm, dining table 75 cm
    const legs = ps.filter((p) => p.id.startsWith("leg-"));
    expect(legs).toHaveLength(4);
    for (const l of legs) { expect(Math.abs(l.cx) + l.w / 2).toBeLessThanOrEqual(0.9 + 1e-9); expect(l.cy - l.h / 2).toBeCloseTo(0, 9); }
  });

  it("a sideboard splits into doors of 35-70 cm, each with a handle, standing on legs", () => {
    for (const w of [1.0, 1.8, 2.5, 3.0]) {
      const ps = parts("sideboard", { width: w });
      const doors = ps.filter((p) => p.kind === "front");
      for (const d of doors) { expect(d.w + GAP).toBeGreaterThanOrEqual(0.35 - 1e-9); expect(d.w + GAP).toBeLessThanOrEqual(0.7 + 1e-9); }
      expect(count(ps, "hardware")).toBe(doors.length);
      expect(ps.filter((p) => p.slot === "legs")).toHaveLength(4);
    }
  });

  it("nightstand has 2 drawer rows, dresser 3, with 3 mm between drawers", () => {
    const n = parts("nightstand", { width: 0.5 }).filter((p) => p.kind === "front");
    const d = parts("dresser", { width: 1.2 }).filter((p) => p.kind === "front");
    expect(new Set(n.map((p) => p.cy.toFixed(4))).size).toBe(2);
    expect(new Set(d.map((p) => p.cy.toFixed(4))).size).toBe(3);
    const col = d.filter((p) => Math.abs(p.cx - d[0].cx) < 1e-6).sort((a, b) => a.cy - b.cy);
    expect(col[1].cy - col[1].h / 2 - (col[0].cy + col[0].h / 2)).toBeCloseTo(GAP, 9);
  });

  it("bench and floating shelf are single-material solid wood pieces", () => {
    expect(new Set(parts("bench", { width: 1.4 }).map((p) => p.slot))).toEqual(new Set(["frame"]));
    expect(parts("wall-shelf", { width: 1.2 })).toHaveLength(1);
  });
});
