import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Baseline } from "@/lib/studio/baseline/fromTwin";
import { apply } from "@/lib/studio/commands/apply";
import { History } from "@/lib/studio/commands/history";
import { isPublicCommand, CommandSchema } from "@/lib/studio/commands/types";
import { compilePlan } from "@/lib/studio/ai/compile";
import { buildClaudeRequest } from "@/lib/studio/ai/claude";
import { designContext, retrieveModels } from "@/lib/studio/ai/context";
import { providerFrom, runDesigner } from "@/lib/studio/ai/designer";
import { SlidingLimiter } from "@/lib/studio/ai/limit";
import { dryRunPlan } from "@/lib/studio/ai/dryrun";
import { AiPlanSchema, SAMPLE_PROMPTS, type AiPlan } from "@/lib/studio/ai/plan";
import { catalogFrom, MaterialManifest, ModelManifest } from "@/lib/studio/schema/catalog";
import { emptyDocument, type DesignDocument } from "@/lib/studio/schema/document";
import { errorsOf, validateDocument } from "@/lib/studio/validation/placement";
import { validateProposals } from "@/lib/studio/validation/architecture";

const root = process.cwd();
const baselineFile = JSON.parse(fs.readFileSync(path.join(root, "public/walk/yarkon-twin-shell/baseline.json"), "utf8"));
const baseline = baselineFile.baseline as Baseline;
const index = JSON.parse(fs.readFileSync(path.join(root, "public/studio/catalog/index.json"), "utf8"));
const models = (index.models as unknown[]).map((m) => ModelManifest.parse(m));
const materials = (index.materials as unknown[]).map((m) => MaterialManifest.parse(m));
const catalog = catalogFrom(models, materials);
const ref = { id: baselineFile.id, version: baselineFile.version, twinHash: baseline.twinHash, mapVersion: 1 } as DesignDocument["baseline"];
const empty = () => emptyDocument(ref);

let n = 0;
const ctx = (doc = empty()) => ({ doc, baseline, catalog, models, materials, newId: () => `ai-${++n}` });
const errors = (doc: DesignDocument) => [...errorsOf(validateDocument(doc, baseline, catalog)), ...errorsOf(validateProposals(doc, baseline, catalog))];
const refsOf = (cmd: unknown): { id: string; version: number }[] => {
  const out: { id: string; version: number }[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.id === "string" && typeof o.version === "number") out.push({ id: o.id, version: o.version });
      Object.values(o).forEach(walk);
    }
  };
  walk(cmd);
  return out;
};

describe("AI designer: limits, provider switch, model request", () => {
  it("rate-limits per user in a sliding window", () => {
    let t = 0;
    const lim = new SlidingLimiter(2, 60_000, () => t);
    expect(lim.take("u1").ok).toBe(true);
    expect(lim.take("u1").ok).toBe(true);
    const third = lim.take("u1");
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.retryAfter).toBe(60);
    expect(lim.take("u2").ok).toBe(true); // other users are unaffected
    t = 60_001;
    expect(lim.take("u1").ok).toBe(true);
  });

  it("uses the paid provider only when explicitly switched on (an API key alone is not enough)", () => {
    expect(providerFrom({})).toBe("dryrun");
    expect(providerFrom({ ANTHROPIC_API_KEY: "sk-test" })).toBe("dryrun");
    expect(providerFrom({ STUDIO_AI_PROVIDER: "something" })).toBe("dryrun");
    expect(providerFrom({ STUDIO_AI_PROVIDER: "claude" })).toBe("claude");
  });

  it("runs the dry-run designer end to end without any network", async () => {
    const r = await runDesigner({ prompt: SAMPLE_PROMPTS[1].en, lang: "en", doc: empty(), baseline, catalog, models, materials }, "dryrun");
    expect(r.provider).toBe("dryrun");
    expect(r.proposal.added.length).toBe(3);
  });

  it("builds a model request whose single tool takes the AiPlan schema, with published ids in the context", () => {
    const req = buildClaudeRequest("furnish", designContext({ baseline, doc: empty(), catalog, models, materials, retrieval: { roomKinds: ["bedroom"] } }), "en");
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.tools).toHaveLength(1);
    expect(req.tools[0].name).toBe("propose_design");
    const schema = req.tools[0].input_schema as { type: string; required: string[]; properties: Record<string, unknown> };
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(expect.arrayContaining(["summary", "actions"]));
    expect("$schema" in schema).toBe(false);
    const ctxJson = JSON.parse(String(req.messages[0].content).split("\n")[1]);
    expect(ctxJson.models.map((m: { id: string }) => m.id)).toContain("bed-upholstered-01");
    expect(ctxJson.rooms.map((r: { id: string }) => r.id)).toContain("room:bed2");
    // deterministic: same input, same bytes (cache friendly)
    expect(JSON.stringify(buildClaudeRequest("x", { a: 1 }, "he"))).toBe(JSON.stringify(buildClaudeRequest("x", { a: 1 }, "he")));
  });

  it("retrieval puts room-kind and style matches first", () => {
    const top = retrieveModels(models, { roomKinds: ["kitchen"], limit: 2 }).map((m) => m.id);
    expect(top.every((id) => id.startsWith("kitchen-"))).toBe(true);
  });
});

describe("AI designer: dry-run planner", () => {
  it("always returns a schema-valid plan, also for nonsense", () => {
    for (const p of [...SAMPLE_PROMPTS.flatMap((s) => [s.en, s.he]), "", "asdf qwerty", "לא ברור"]) {
      expect(AiPlanSchema.safeParse(dryRunPlan(p)).success, p).toBe(true);
    }
    expect(dryRunPlan("asdf qwerty").actions).toHaveLength(0);
    expect(dryRunPlan("לא ברור").summary).toMatch(/[֐-׿]/);
  });
});

describe("AI designer: the five sample prompts (M10 acceptance)", () => {
  for (const s of SAMPLE_PROMPTS) {
    for (const lang of ["en", "he"] as const) {
      it(`${s.id} (${lang}) compiles to one valid public batch with no errors and only published assets`, () => {
        const plan = dryRunPlan(s[lang]);
        expect(plan.actions.length).toBeGreaterThan(0);
        const p = compilePlan(plan, ctx());
        expect(p.dropped, JSON.stringify(p.dropped)).toEqual([]);
        expect(p.command).not.toBeNull();
        const cmd = p.command!;
        expect(CommandSchema.safeParse(cmd).success).toBe(true);
        expect(isPublicCommand(cmd)).toBe(true);
        // 0 invalid asset references reach the client
        for (const r of refsOf(cmd)) {
          if (r.id.startsWith("ai-")) continue;
          expect(catalog.model(r) ?? catalog.material(r), `${r.id}@${r.version}`).toBeDefined();
        }
        const doc = apply(empty(), cmd, { baseline, catalog }).doc;
        expect(errors(doc)).toEqual([]);
        expect(p.added.length + p.surfaces.length).toBeGreaterThan(0);
      });
    }
  }

  it("the living-room plan builds the whole seating group", () => {
    const p = compilePlan(dryRunPlan(SAMPLE_PROMPTS[0].en), ctx());
    expect(p.added).toHaveLength(6);
  });

  it("the kitchen plan is the L-shaped layout and the warmer plan restyles walls and floor of the master bedroom", () => {
    const k = compilePlan(dryRunPlan(SAMPLE_PROMPTS[2].en), ctx());
    expect(k.added.length).toBeGreaterThanOrEqual(2);
    const w = compilePlan(dryRunPlan(SAMPLE_PROMPTS[3].en), ctx());
    expect(w.surfaces).toContain("surface:floor:master");
    expect(w.surfaces.filter((s) => !s.includes("floor")).length).toBeGreaterThanOrEqual(3);
  });
});

describe("AI designer: compile drops what is invalid, keeps the rest", () => {
  const plan = (actions: AiPlan["actions"]): AiPlan => ({ summary: "t", actions });

  it("never lets an unknown asset, material, room or target through", () => {
    const p = compilePlan(plan([
      { op: "place", catalogId: "golden-throne-99", room: "room:living" },
      { op: "setSurface", room: "room:living", surface: "walls", materialId: "unobtainium" },
      { op: "place", catalogId: "coffee-drum-01", room: "room:attic" },
      { op: "remove", target: "nope" },
      { op: "place", catalogId: "coffee-drum-01", room: "living" },
    ]), ctx());
    expect(p.dropped.map((d) => d.reason)).toEqual(["unknown-asset", "unknown-material", "unknown-room", "unknown-target"]);
    expect(p.accepted).toEqual([4]);
    expect(p.added).toHaveLength(1);
  });

  it("drops a placement that leaves the room, overlaps or has an illegal size, with the editor's reason", () => {
    const p = compilePlan(plan([
      { op: "place", ref: "t", catalogId: "coffee-drum-01", room: "room:living", placement: "at", at: { x: 3, y: 2 } },
      { op: "place", catalogId: "coffee-drum-01", room: "room:living", placement: "at", at: { x: 3.1, y: 2.1 } },
      { op: "place", catalogId: "coffee-drum-01", room: "room:living", placement: "at", at: { x: 30, y: 30 } },
      { op: "place", catalogId: "wardrobe-hinged-01", room: "room:bed2", size: { params: { width: 9 } } },
      { op: "place", catalogId: "coffee-drum-01", room: "room:living", size: { modules: ["seat-80"] } },
    ]), ctx());
    expect(p.accepted).toEqual([0]);
    expect(p.dropped.map((d) => d.reason)).toEqual(["err.overlap", "err.out-of-room", "bad-size", "bad-size"]);
  });

  it("resolves refs, edits existing pieces and returns ids of what changed", () => {
    const first = compilePlan(plan([{ op: "place", ref: "c", catalogId: "armchair-modern-01", room: "room:living", placement: "center" }]), ctx());
    const doc = apply(empty(), first.command!, { baseline, catalog }).doc;
    const id = first.added[0];
    const p = compilePlan(plan([
      { op: "rotate", target: id, degrees: 90 },
      { op: "setMaterial", target: id, slot: "nonexistent-slot", materialId: "fabric-textured-stone" },
      { op: "place", catalogId: "floor-lamp-01", room: "room:living", placement: "near", near: { target: id, side: "right" } },
    ]), ctx(doc));
    expect(p.changed).toEqual([id]);
    expect(p.added).toHaveLength(1);
    expect(p.dropped.map((d) => d.reason)).toEqual(["not-allowed"]);
  });

  it("an accepted proposal is exactly one undo step", () => {
    const h = new History(empty(), { baseline, catalog });
    const p = compilePlan(dryRunPlan(SAMPLE_PROMPTS[0].en), ctx());
    h.do(p.command!);
    expect(Object.keys(h.doc.nodes)).toHaveLength(6);
    h.undo();
    expect(Object.keys(h.doc.nodes)).toHaveLength(0);
    expect(h.doc.overrides).toEqual({});
  });

  it("never mutates the input document", () => {
    const doc = empty();
    const snap = JSON.stringify(doc);
    compilePlan(dryRunPlan(SAMPLE_PROMPTS[0].en), ctx(doc));
    expect(JSON.stringify(doc)).toBe(snap);
  });
});
