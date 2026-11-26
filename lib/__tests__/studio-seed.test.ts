import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { useStudio } from "@/components/studio/store";
import type { Baseline } from "@/lib/studio/baseline/fromTwin";
import { catalogFrom, MaterialManifest, ModelManifest } from "@/lib/studio/schema/catalog";
import { DesignDocument } from "@/lib/studio/schema/document";
import { ProjectExperience } from "@/lib/experience/types";
import { validateProposals } from "@/lib/studio/validation/architecture";
import { errorsOf, validateDocument } from "@/lib/studio/validation/placement";

const root = process.cwd();
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const file = read("public/walk/yarkon-twin-shell/baseline.json") as { id: string; version: number; baseline: Baseline };
const index = read("public/studio/catalog/index.json") as { models: unknown[]; materials: unknown[] };
const models = index.models.map((m) => ModelManifest.parse(m));
const materials = index.materials.map((m) => MaterialManifest.parse(m));
const catalog = catalogFrom(models, materials);
const seed = DesignDocument.parse(read("public/walk/yarkon-twin-shell/seed-design.json"));
const ref = { id: file.id, version: file.version, twinHash: file.baseline.twinHash };
const boot = (s: DesignDocument | null) => useStudio.getState().init({ baseline: file.baseline, ref, models, materials, mobile: false, seed: s });

describe("the developer's design (seed)", () => {
  it("is a legal design for its own baseline made only of published pieces", () => {
    expect(Object.keys(seed.nodes).length).toBeGreaterThanOrEqual(15);
    expect([...errorsOf(validateDocument(seed, file.baseline, catalog)), ...errorsOf(validateProposals(seed, file.baseline, catalog))]).toEqual([]);
    expect(seed.baseline.twinHash).toBe(file.baseline.twinHash);
  });

  it("a new visitor starts from it; an apartment without one starts empty", () => {
    boot(seed);
    expect(Object.keys(useStudio.getState().doc!.nodes)).toHaveLength(Object.keys(seed.nodes).length);
    expect(useStudio.getState().canUndo).toBe(false);
    boot(null);
    expect(Object.keys(useStudio.getState().doc!.nodes)).toHaveLength(0);
    expect(useStudio.getState().resetToSeed()).toBe(false);
  });

  it("a seed made for another version of the apartment is ignored", () => {
    boot({ ...seed, baseline: { ...seed.baseline, twinHash: "stale" } });
    expect(Object.keys(useStudio.getState().doc!.nodes)).toHaveLength(0);
    expect(useStudio.getState().seed).toBeNull();
  });

  it("'Developer's design' puts everything back in ONE undoable step", () => {
    boot(seed);
    const n = Object.keys(seed.nodes).length;
    useStudio.getState().dispatch({ type: "restoreBaseline" });
    expect(Object.keys(useStudio.getState().doc!.nodes)).toHaveLength(0);
    expect(useStudio.getState().resetToSeed()).toBe(true);
    expect(Object.keys(useStudio.getState().doc!.nodes)).toHaveLength(n);
    useStudio.getState().undo(); // back to empty
    expect(Object.keys(useStudio.getState().doc!.nodes)).toHaveLength(0);
    useStudio.getState().undo(); // back to the seed
    expect(Object.keys(useStudio.getState().doc!.nodes)).toHaveLength(n);
  });
});

describe("tour -> studio link", () => {
  it("the Yarkon tour points at the studio apartment of the same plan, and that apartment exists", () => {
    const exp = ProjectExperience.parse(read("public/projects/yarkon/experience.json"));
    expect(exp.studio).toBe("yarkon-twin-shell");
    expect(fs.existsSync(path.join(root, "public/walk", exp.studio!, "baseline.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "public/walk", exp.studio!, "seed-design.json"))).toBe(true);
  });
});
