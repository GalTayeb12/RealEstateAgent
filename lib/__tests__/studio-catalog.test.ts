import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MaterialManifest, ModelManifest } from "../studio/schema/catalog";
import { reachableWidths, solveForWidth, validateConfig } from "../studio/catalog/modular";

const root = path.join(__dirname, "../..");
const dir = path.join(root, "catalog/manifests");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
const raw = files.map((f) => ({ f, json: JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Record<string, unknown> }));
for (const r of raw) delete r.json._note;

describe("catalog manifests (catalog/manifests)", () => {
  it("every manifest parses against the strict schema", () => {
    for (const { f, json } of raw) {
      const parsed = (json.type === "model" ? ModelManifest : MaterialManifest).safeParse(json);
      expect(parsed.success, `${f}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues)}`).toBe(true);
    }
  });

  it("(type, id, version) is unique and the file name matches id@version", () => {
    const keys = raw.map(({ json }) => `${json.type}:${json.id}@${json.version}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const { f, json } of raw) expect(f).toBe(`${json.id}@${json.version}.json`);
  });

  it("every asset carries a license and an author (distribution rights are never implied)", () => {
    for (const { f, json } of raw) {
      const l = json.license as { spdx?: string; author?: string; sourceUrl?: string };
      expect(l?.spdx && l?.author && l?.sourceUrl, f).toBeTruthy();
    }
  });

  it("every model slot has a bilingual label and at least one allowed material category", () => {
    for (const { json } of raw.filter((r) => r.json.type === "model")) {
      const m = ModelManifest.parse(json);
      for (const s of m.slots) {
        expect(s.label.he && s.label.en).toBeTruthy();
        expect(s.allowed.length).toBeGreaterThan(0);
      }
    }
  });

  it("the published snapshot matches the manifests (run: npx tsx scripts/studio/ingest/publish.mts)", () => {
    const idx = path.join(root, "public/studio/catalog/index.json");
    expect(existsSync(idx)).toBe(true);
    const snap = JSON.parse(readFileSync(idx, "utf8")) as { models: { id: string; version: number }[]; materials: { id: string; version: number }[] };
    const want = raw.map(({ json }) => `${json.id}@${json.version}`).sort();
    const got = [...snap.models, ...snap.materials].map((m) => `${m.id}@${m.version}`).sort();
    expect(got).toEqual(want);
  });

  it("every published model's GLB exists", () => {
    for (const { json } of raw.filter((r) => r.json.type === "model")) {
      const m = ModelManifest.parse(json);
      expect(existsSync(path.join(root, "public/studio/catalog", m.assets.glb)), m.id).toBe(true);
    }
  });

  it("the published modular sofa has a valid default and legal 2.4 / 3.4 / 4.0 m configurations", () => {
    const m = ModelManifest.parse(raw.find((r) => r.json.id === "sofa-modular-01")!.json);
    expect(m.sizing.mode).toBe("modular");
    if (m.sizing.mode !== "modular") return;
    expect(validateConfig(m.sizing, m.sizing.defaultConfig!)).toEqual([]);
    for (const target of [2.4, 3.4, 4.0]) {
      const sols = solveForWidth(m.sizing, target, { tol: 0.005, limit: 50 });
      expect(sols.length, `${target} m`).toBeGreaterThan(0);
      for (const sol of sols) expect(validateConfig(m.sizing, sol.modules)).toEqual([]);
    }
    expect(reachableWidths(m.sizing, { min: 1.5, max: 5 })).toContain(4);
    // the 4 m sofa is real modules end to end: both arms present, no module appears at a different width than catalogued
    const four = solveForWidth(m.sizing, 4.0, { tol: 0.005, limit: 50 }).find((x) => x.modules[0] === "arm-l" && x.modules.at(-1) === "arm-r")!;
    expect(four).toBeDefined();
  });

  it("every textured material points at maps that exist", () => {
    for (const { json } of raw.filter((r) => r.json.type === "material")) {
      const mat = MaterialManifest.parse(json);
      for (const file of Object.values(mat.pbr.maps)) {
        if (file) expect(existsSync(path.join(root, "public/studio/catalog", mat.id, String(mat.version), file)), `${mat.id}/${file}`).toBe(true);
      }
    }
  });
});
