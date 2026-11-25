import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MaterialManifest, ModelManifest } from "../studio/schema/catalog";

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
});
