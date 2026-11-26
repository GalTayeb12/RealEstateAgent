import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { glbGates, parseManifest, staticGates } from "@/lib/studio/catalog/gates";
import { browsable, CatalogError, CatalogRegistry, keyOf } from "@/lib/studio/catalog/registry";
import { MemoryKv } from "@/lib/studio/persist/kv";
import { MaterialManifest, ModelManifest } from "@/lib/studio/schema/catalog";

const root = process.cwd();
const index = JSON.parse(fs.readFileSync(path.join(root, "public/studio/catalog/index.json"), "utf8"));
const models = (index.models as unknown[]).map((m) => ModelManifest.parse(m));
const materials = (index.materials as unknown[]).map((m) => MaterialManifest.parse(m));
const paint = (id: string, version = 1, extra: Record<string, unknown> = {}) => ({
  type: "material", id, version, name: { he: "צבע", en: "Paint" }, category: "paint", styles: [], tileSize: [1, 1],
  pbr: { baseColor: "#c8b8a2", roughness: 0.9, metalness: 0, maps: {} },
  license: { spdx: "HAVENIQ-ORIGINAL", sourceUrl: "https://haveniq.local/flat-colour", author: "HAVENIQ" }, ...extra,
});

function setup(gate: (id: string) => string[] = () => []) {
  let t = Date.parse("2026-11-27T10:00:00Z");
  const reg = new CatalogRegistry(new MemoryKv(), async (m) => gate(m.id), () => new Date((t += 1000)));
  return reg;
}

describe("catalog gates (shared by the CLI and the admin catalog)", () => {
  it("parses manifests strictly and reports schema problems with their paths", () => {
    expect("manifest" in parseManifest(paint("p-1"))).toBe(true);
    const bad = parseManifest({ ...paint("p-1"), pbr: { baseColor: "beige", roughness: 2, metalness: 0, maps: {} } });
    expect("issues" in bad && bad.issues.some((i) => i.startsWith("pbr.baseColor"))).toBe(true);
    expect("issues" in parseManifest({ type: "chair" })).toBe(true);
    expect("issues" in parseManifest(null)).toBe(true);
  });

  it("accepts only CC0 / CC-BY / original / approved licences, and CC-BY needs attribution", () => {
    expect("issues" in parseManifest(paint("p-1", 1, { license: { spdx: "CC-BY-NC-4.0", sourceUrl: "x", author: "y" } }))).toBe(true);
    const ccby = parseManifest(paint("p-1", 1, { license: { spdx: "CC-BY-4.0", sourceUrl: "x", author: "y" } }));
    expect("manifest" in ccby && staticGates(ccby.manifest)).toEqual(["CC-BY needs attributionText"]);
  });

  it("passes every published GLB model and catches a manifest that lies about its size", async () => {
    for (const m of models.filter((x) => x.assets.glb)) {
      expect(await glbGates(m, fs.readFileSync(path.join(root, "public/studio/catalog", m.assets.glb!))), m.id).toEqual([]);
    }
    const drum = models.find((m) => m.id === "coffee-drum-01")!;
    const lying = { ...drum, dims: { ...drum.dims, w: drum.dims.w + 0.2 } };
    const issues = await glbGates(lying, fs.readFileSync(path.join(root, "public/studio/catalog", drum.assets.glb!)));
    expect(issues.some((i) => i.startsWith("w is"))).toBe(true);
    expect(await glbGates(drum, new Uint8Array([1, 2, 3]))).toEqual([expect.stringMatching(/cannot be read/)]);
  });

  it("runs the generator gates on generator-built models", () => {
    const wardrobe = models.find((m) => m.id === "wardrobe-hinged-01")!;
    expect(staticGates(wardrobe)).toEqual([]);
  });
});

describe("admin catalog lifecycle and versioned releases", () => {
  it("seeds release 1 from the repository snapshot and syncs only what is new", async () => {
    const reg = setup();
    const r1 = await reg.sync({ models, materials }, "admin");
    expect(r1?.release).toBe(1);
    expect(r1?.models).toHaveLength(models.length);
    expect((await reg.entries()).every((e) => e.status === "published")).toBe(true);
    expect(await reg.sync({ models, materials }, "admin")).toBeNull();
    const r2 = await reg.sync({ models, materials: [...materials, MaterialManifest.parse(paint("new-paint"))] }, "admin");
    expect(r2?.release).toBe(2);
    expect(r2?.changes.added).toEqual(["material:new-paint@1"]);
  });

  it("draft -> check -> publish creates a new release and keeps the old one", async () => {
    const reg = setup();
    await reg.sync({ models, materials }, "admin");
    const d = await reg.importDraft(paint("sage-deep"), "admin");
    expect(d.status).toBe("draft");
    await expect(reg.publish([d.key], "admin")).rejects.toMatchObject({ code: "not-checked" });
    await reg.check(d.key);
    const r = await reg.publish([d.key], "admin", "new paint");
    expect(r.release).toBe(2);
    expect(r.previous).toBe(1);
    expect(r.materials.map(keyOf)).toContain("material:sage-deep@1");
    expect((await reg.release(1))!.materials.map(keyOf)).not.toContain("material:sage-deep@1"); // release 1 unchanged
    expect((await reg.entry(d.key))!.status).toBe("published");
    expect((await reg.releases()).map((x) => x.release)).toEqual([2, 1]);
  });

  it("refuses to publish a draft that fails its gates, was never checked, or changed after the check", async () => {
    const reg = setup((id) => (id === "broken" ? ["w is 1.2 m in the GLB but 1.0 in the manifest (>1 cm)"] : []));
    const b = await reg.importDraft(paint("broken"), "admin");
    await reg.check(b.key);
    const err = await reg.publish([b.key], "admin").catch((e) => e as CatalogError);
    expect(err).toMatchObject({ code: "failed-gates", issues: ["w is 1.2 m in the GLB but 1.0 in the manifest (>1 cm)"] });
    const ok = await reg.importDraft(paint("fine"), "admin");
    await reg.check(ok.key);
    await reg.importDraft(paint("fine", 1, { pbr: { baseColor: "#000000", roughness: 0.5, metalness: 0, maps: {} } }), "admin"); // edited after check
    await expect(reg.publish([ok.key], "admin")).rejects.toMatchObject({ code: "not-checked" }); // replaced draft loses its check
    // all-or-nothing: one bad key blocks the whole publish and nothing is written
    await reg.check(ok.key);
    await expect(reg.publish([ok.key, b.key], "admin")).rejects.toMatchObject({ code: "failed-gates" });
    expect(await reg.head()).toBe(0);
  });

  it("published versions are immutable; a change needs a higher version", async () => {
    const reg = setup();
    const d = await reg.importDraft(paint("clay", 1), "admin");
    await reg.check(d.key);
    await reg.publish([d.key], "admin");
    await expect(reg.importDraft(paint("clay", 1), "admin")).rejects.toMatchObject({ code: "immutable" });
    await expect(reg.importDraft({ ...paint("clay", 1), version: 0 }, "admin")).rejects.toMatchObject({ code: "invalid" });
    const v2 = await reg.importDraft(paint("clay", 2), "admin");
    expect(v2.key).toBe("material:clay@2");
    await reg.check(v2.key);
    await reg.publish([v2.key], "admin");
    await expect(reg.importDraft(paint("clay", 2), "admin")).rejects.toMatchObject({ code: "immutable" });
  });

  it("retiring hides an entry from browsing but keeps it resolvable for existing designs", async () => {
    const reg = setup();
    await reg.sync({ models, materials }, "admin");
    const r = await reg.retire(["model:armchair-modern-01@1"], "admin", "replaced");
    expect(r.release).toBe(2);
    expect(r.models.map((m) => m.id)).toContain("armchair-modern-01"); // still in the release
    expect(r.retired).toEqual(["model:armchair-modern-01@1"]);
    expect(browsable(r.models, r.retired).map((m) => m.id)).not.toContain("armchair-modern-01");
    expect((await reg.entry("model:armchair-modern-01@1"))!.status).toBe("retired");
    await expect(reg.retire(["model:armchair-modern-01@1"], "admin")).rejects.toMatchObject({ code: "state" });
    await expect(reg.importDraft({ ...models.find((m) => m.id === "armchair-modern-01"), version: 1 }, "admin")).rejects.toMatchObject({ code: "immutable" });
  });

  it("drafts can be discarded; published history cannot", async () => {
    const reg = setup();
    await reg.sync({ models, materials }, "admin");
    const d = await reg.importDraft(paint("temp"), "admin");
    await reg.discard(d.key);
    expect(await reg.entry(d.key)).toBeNull();
    await expect(reg.discard("material:paint-clay@1")).rejects.toMatchObject({ code: "state" });
  });

  it("serialises concurrent publishes: release numbers never collide", async () => {
    const reg = setup();
    const keys: string[] = [];
    for (const id of ["a1", "a2", "a3"]) { const d = await reg.importDraft(paint(id), "admin"); await reg.check(d.key); keys.push(d.key); }
    const rs = await Promise.all(keys.map((k) => reg.publish([k], "admin")));
    expect(rs.map((r) => r.release).sort()).toEqual([1, 2, 3]);
    expect((await reg.release())!.materials).toHaveLength(3);
  });
});
