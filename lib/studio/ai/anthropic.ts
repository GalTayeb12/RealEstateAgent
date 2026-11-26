/**
 * Live AI designer (Claude tool use). INACTIVE by default: it runs only when
 * STUDIO_AI=live and ANTHROPIC_API_KEY are set, which costs money, so it needs the
 * owner's explicit approval. The model never edits anything: it returns commands
 * through one forced tool call, and `sanitizeAiCommands` validates every one of them.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Baseline } from "../baseline/fromTwin";
import type { ModelManifest } from "../schema/catalog";
import type { DesignDocument } from "../schema/document";
import type { Proposal } from "./dryRun";

export const AI_MODEL = "claude-sonnet-5-5";

export const aiLive = () => process.env.STUDIO_AI === "live" && !!process.env.ANTHROPIC_API_KEY;

/** Compact, retrieval-style context: only what the model needs to pick valid assets and places. */
export function buildContext(doc: DesignDocument, baseline: Baseline, models: ModelManifest[]) {
  return {
    rooms: Object.values(baseline.rooms).map((r) => ({ id: r.id, type: r.type, name: r.name.en, area: r.area, polygon: r.polygon })),
    openings: Object.values(baseline.openings).map((o) => ({ id: o.id, kind: o.kind, center: o.center, width: o.width })),
    catalog: models.filter((m) => m.status !== "retired").map((m) => ({
      id: m.id, version: m.version, name: m.name.en, category: m.category, styles: m.styles, rooms: m.rooms,
      sizing: m.sizing.mode, dims: m.dims, slots: m.slots.map((s) => s.id),
      params: m.sizing.mode === "parametric" ? m.sizing.params.map((p) => ({ id: p.id, min: p.min, max: p.max, step: p.step })) : undefined,
      placement: { on: m.placement.on, againstWall: m.placement.againstWall },
    })),
    current: Object.values(doc.nodes).map((n) => (n.kind === "item" ? { id: n.id, catalog: n.catalog.id, at: n.transform } : { id: n.id, kind: n.kind })),
  };
}

const SYSTEM = `You are the HAVENIQ interior designer. Propose changes to one apartment by calling propose_changes once.
Rules: use ONLY catalog ids and versions from the context; sizes come only from variantId, modules or params (never scale); coordinates are metres in plan axes (x east, y north), rot in radians counter-clockwise, an item's back is its origin and its front is local +y, so place furniture against walls with the back to the wall; stay inside the rooms; keep doorways free; minimalist, calm, premium taste. Command types you may use: add (node with kind "item", unique id of your choice, catalog {id,version}, transform {x,y,z:0,rot}, slots {}, optional params/modules/variantId), move, rotate, setVariant, setModules, setParams, setSlotMaterial, setSurfaceMaterial, replace, remove, duplicate. The server validates everything and drops what does not fit.`;

export async function proposeWithClaude(prompt: string, doc: DesignDocument, baseline: Baseline, models: ModelManifest[]): Promise<Proposal> {
  const client = new Anthropic();
  const res = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    tools: [{
      name: "propose_changes",
      description: "Return the design change as a list of commands plus a one-sentence summary.",
      input_schema: {
        type: "object",
        properties: { summary: { type: "string" }, commands: { type: "array", items: { type: "object" } } },
        required: ["summary", "commands"],
      },
    }],
    tool_choice: { type: "tool", name: "propose_changes" },
    messages: [{ role: "user", content: `Context (JSON):\n${JSON.stringify(buildContext(doc, baseline, models))}\n\nRequest: ${prompt.slice(0, 600)}` }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  const input = block && block.type === "tool_use" ? (block.input as { summary?: string; commands?: unknown[] }) : {};
  return { summary: String(input.summary ?? ""), commands: Array.isArray(input.commands) ? input.commands : [] };
}
