import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { auditManifest, contentHash, immutabilityViolations, offered, statusOf, transition } from "../studio/catalog/admin";
import { filterModels, materialsForSlot } from "../studio/design/options";
import { MaterialManifest, ModelManifest } from "../studio/schema/catalog";
import { TABLE } from "./studio-fixtures";

const root = path.resolve(__dirname, "../..");
const idx = JSON.parse(fs.readFileSync(path.join(root, "public/studio/catalog/index.json"), "utf8"));
const models: ModelManifest[] = idx.models.map((m: unknown) => ModelManifest.parse(m));
const materials: MaterialManifest[] = idx.materials.map((m: unknown) => MaterialManifest.parse(m));
const exists = (rel: string) => fs.existsSync(path.join(root, "public/studio/catalog", rel));

describe("catalog lifecycle", () => {
  it("allows only the documented transitions", () => {
    expect(transition("draft", "submit")).toBe("review");
    expect(transition("review", "publish")).toBe("published");
    expect(transition("review", "return")).toBe("draft");
    expect(transition("published", "retire")).toBe("retired");
    expect(transition("retired", "reopen")).toBe("published");
    expect(transition("draft", "publish")).toBeNull(); // no skipping review
    expect(transition("published", "submit")).toBeNull();
  });

  it("older manifests without a status count as published; retired ones are not offered", () => {
    expect(statusOf({})).toBe("published");
    expect(offered({ status: "retired" })).toBe(false);
    const retired = { ...TABLE, status: "retired" as const };
    expect(filterModels([TABLE, retired], {}, "en")).toHaveLength(1);
    const brass = materials.find((m) => m.id === "metal-brushed-brass")!;
    const slot = { id: "handle", label: { he: "x", en: "x" }, allowed: ["metal" as const] };
    expect(materialsForSlot([brass, { ...brass, id: "old", status: "retired" }], slot).map((m) => m.id)).toEqual(["metal-brushed-brass"]);
  });
});

describe("published versions are immutable", () => {
  it("content hash ignores the lifecycle status but sees any content change", () => {
    expect(contentHash({ ...TABLE, status: "retired" })).toBe(contentHash(TABLE));
    expect(contentHash({ ...TABLE, dims: { ...TABLE.dims, w: 1.3 } })).not.toBe(contentHash(TABLE));
  });

  it("blocks editing a published version and deleting one; allows a new version and retiring", () => {
    const v1 = TABLE, edited = { ...TABLE, dims: { ...TABLE.dims, w: 1.3 } };
    expect(immutabilityViolations([v1], [edited]).join()).toContain("bump");
    expect(immutabilityViolations([v1], []).join()).toContain("retire it instead");
    expect(immutabilityViolations([v1], [v1, { ...edited, version: 2 }])).toEqual([]);
    expect(immutabilityViolations([v1], [{ ...v1, status: "retired" }])).toEqual([]);
  });

  it("the committed catalog passes the immutability check against itself", () => {
    expect(immutabilityViolations([...models, ...materials], [...models, ...materials])).toEqual([]);
  });
});

describe("catalog audit", () => {
  it("every published model and material has no blocking issue", () => {
    for (const m of [...models, ...materials]) expect(auditManifest(m, exists, materials).issues, m.id).toEqual([]);
  });

  it("flags missing files, missing attribution and wrong slot defaults", () => {
    const bad = { ...TABLE, license: { spdx: "CC-BY-4.0" as const, sourceUrl: "https://x.test/a", author: "A" }, slots: [{ ...TABLE.slots[0], default: { id: "metal-brushed-brass", version: 1 } }] };
    const issues = auditManifest(bad, () => false, materials).issues.join(" | ");
    expect(issues).toContain("attribution");
    expect(issues).toContain("missing GLB");
    expect(issues).toContain("not allowed here");
  });

  it("every handle slot can now choose a published metal", () => {
    for (const m of models) for (const s of m.slots.filter((x) => x.id === "handle")) expect(materialsForSlot(materials, s).length, m.id).toBeGreaterThanOrEqual(3);
  });

  it("catalog grew: at least 20 materials including cabinet lacquers and metals", () => {
    expect(materials.length).toBeGreaterThanOrEqual(20);
    expect(materials.filter((m) => m.category === "cabinet").length).toBeGreaterThanOrEqual(4);
    expect(materials.filter((m) => m.category === "metal").length).toBeGreaterThanOrEqual(3);
  });
});
