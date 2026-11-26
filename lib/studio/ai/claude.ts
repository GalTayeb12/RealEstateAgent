/**
 * The real designer model (Claude tool use). OFF unless STUDIO_AI_PROVIDER=claude: every call is
 * paid, and the owner must approve turning it on. Not exercised by tests or e2e (they use the
 * dry-run planner); `buildClaudeRequest` is pure and unit-tested.
 *
 * The model gets the apartment + ranked catalog as JSON and must answer by calling the single tool
 * `propose_design`, whose input schema IS the AiPlan schema. Its output is validated with zod and
 * then compiled and validated like any other plan (compile.ts), so a bad answer can only lose
 * actions, never break the design.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { AiPlanSchema, type AiPlan } from "./plan";

export const CLAUDE_MODEL = "claude-opus-5-5";
export const TOOL_NAME = "propose_design";

const SYSTEM = `You are HAVENIQ's interior designer inside a 3D apartment studio.
You change a design only by calling the tool ${TOOL_NAME} once, with a short summary for the user (in the user's language) and a list of actions.
Rules:
- Use only catalog ids and material ids listed in the context; never invent ids.
- Rooms are named by their baseline id (for example "room:living").
- Prefer placement modes over coordinates: "against-wall" for pieces made to stand against a wall, "near" to group pieces (give earlier pieces a short ref), "center" for free-standing pieces. Use "at" only when the user asks for an exact position.
- Never scale furniture. Change size only through the catalog entry's variants, modules or parameters, within their min/max.
- Do not change walls or openings: architectural changes are out of scope for you.
- Keep plans small and coherent (at most 12 actions). If the request is unclear or impossible, return an empty action list and say why in the summary.`;

/** JSON schema of the tool input (draft keys the API does not need are removed). */
export function toolInputSchema(): Record<string, unknown> {
  const { $schema: _drop, ...schema } = z.toJSONSchema(AiPlanSchema) as Record<string, unknown>;
  void _drop;
  return schema;
}

/** The request body (pure, deterministic for the same inputs, so the system prompt and tool cache). */
export function buildClaudeRequest(prompt: string, context: unknown, lang: "he" | "en") {
  return {
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium" as const },
    system: [{ type: "text" as const, text: SYSTEM, cache_control: { type: "ephemeral" as const } }],
    tools: [{
      name: TOOL_NAME,
      description: "Propose a set of design actions for the apartment. Call exactly once.",
      input_schema: toolInputSchema() as Anthropic.Tool.InputSchema,
    }],
    tool_choice: { type: "auto" as const },
    messages: [{
      role: "user" as const,
      content: `Apartment and catalog (JSON):\n${JSON.stringify(context)}\n\nUser language: ${lang}\nRequest: ${prompt}`,
    }],
  };
}

export type ClaudeOutcome = { plan: AiPlan } | { error: "refusal" | "no-tool-call" | "bad-output" | "truncated"; detail?: string };

/** Calls the model once. Only reached when STUDIO_AI_PROVIDER=claude (see designer.ts). */
export async function planWithClaude(prompt: string, context: unknown, lang: "he" | "en"): Promise<ClaudeOutcome> {
  const client = new Anthropic();
  const res = await client.beta.messages.create({
    ...buildClaudeRequest(prompt, context, lang),
    // refusal fallback: on a policy decline the API re-runs the request on the fallback model
    betas: ["server-side-fallback-2026-06-01"],
    fallbacks: [{ model: "claude-opus-4-8" }],
  });
  if (res.stop_reason === "refusal") return { error: "refusal" };
  if (res.stop_reason === "max_tokens") return { error: "truncated" };
  const call = res.content.find((b) => b.type === "tool_use" && b.name === TOOL_NAME);
  if (!call || call.type !== "tool_use") return { error: "no-tool-call" };
  const parsed = AiPlanSchema.safeParse(call.input);
  return parsed.success ? { plan: parsed.data } : { error: "bad-output", detail: parsed.error.issues[0]?.message };
}
