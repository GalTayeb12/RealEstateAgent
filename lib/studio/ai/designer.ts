/**
 * One designer request: plan (dry-run or Claude) -> compile + validate -> Proposal.
 *
 * Provider selection is explicit and fails safe: the dry-run planner is the default; the paid
 * Claude provider runs only when STUDIO_AI_PROVIDER=claude (an API key being present is NOT enough).
 */
import type { Baseline } from "../baseline/fromTwin";
import type { CatalogLookup, MaterialManifest, ModelManifest } from "../schema/catalog";
import type { DesignDocument } from "../schema/document";
import { compilePlan, type Proposal } from "./compile";
import { designContext } from "./context";
import { dryRunPlan } from "./dryrun";
import type { AiPlan } from "./plan";

export type ProviderName = "dryrun" | "claude";

export function providerFrom(env: Record<string, string | undefined> = process.env): ProviderName {
  return env.STUDIO_AI_PROVIDER?.trim().toLowerCase() === "claude" ? "claude" : "dryrun";
}

export type DesignerInput = {
  prompt: string; lang: "he" | "en";
  doc: DesignDocument; baseline: Baseline; catalog: CatalogLookup; models: ModelManifest[]; materials: MaterialManifest[];
};

export type DesignerResult = { provider: ProviderName; proposal: Proposal; error?: string };

export async function runDesigner(input: DesignerInput, provider: ProviderName = providerFrom()): Promise<DesignerResult> {
  let plan: AiPlan;
  let error: string | undefined;
  if (provider === "claude") {
    const { planWithClaude } = await import("./claude");
    const out = await planWithClaude(input.prompt, designContext(input), input.lang);
    if ("plan" in out) plan = out.plan;
    else { error = out.error; plan = { summary: "", actions: [] }; }
  } else {
    plan = dryRunPlan(input.prompt);
  }
  const proposal = compilePlan(plan, input);
  return { provider, proposal, ...(error ? { error } : {}) };
}
