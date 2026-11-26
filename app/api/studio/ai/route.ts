import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { extractToken } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { aiLive, proposeWithClaude } from "@/lib/studio/ai/anthropic";
import { dryRunPropose } from "@/lib/studio/ai/dryRun";
import { sanitizeAiCommands } from "@/lib/studio/ai/validate";
import type { Baseline } from "@/lib/studio/baseline/fromTwin";
import { studioAccess } from "@/lib/studio/flags";
import { catalogFrom, MaterialManifest, ModelManifest } from "@/lib/studio/schema/catalog";
import { DesignDocument } from "@/lib/studio/schema/document";

export const dynamic = "force-dynamic";

const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/**
 * POST /api/studio/ai { baselineId, doc, prompt } -> { mode, summary, batch, accepted, rejected }
 * Developer/admin only (studio flag), rate limited. Free dry-run planner unless STUDIO_AI=live
 * and ANTHROPIC_API_KEY are set (paid: owner approval needed). The result is a validated batch; nothing is saved here.
 */
export async function POST(req: NextRequest) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || !studioAccess(auth.role).allowed) return notFound();
  const limited = rateLimit(req, "studio-ai", 12, 60_000);
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as { baselineId?: string; doc?: unknown; prompt?: string } | null;
  if (!body || typeof body.prompt !== "string" || !body.prompt.trim() || !body.baselineId || !SLUG.test(body.baselineId)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const doc = DesignDocument.safeParse(body.doc);
  if (!doc.success) return NextResponse.json({ error: "bad_document" }, { status: 400 });

  const pub = path.join(process.cwd(), "public");
  let baseline: Baseline, models: ModelManifest[], materials: MaterialManifest[];
  try {
    baseline = JSON.parse(fs.readFileSync(path.join(pub, "walk", body.baselineId, "baseline.json"), "utf8")).baseline;
    const cat = JSON.parse(fs.readFileSync(path.join(pub, "studio/catalog/index.json"), "utf8"));
    models = cat.models.map((m: unknown) => ModelManifest.parse(m));
    materials = cat.materials.map((m: unknown) => MaterialManifest.parse(m));
  } catch {
    return NextResponse.json({ error: "unknown_baseline" }, { status: 404 });
  }
  const catalog = catalogFrom(models, materials);
  const live = aiLive();
  let proposal;
  try {
    proposal = live ? await proposeWithClaude(body.prompt, doc.data, baseline, models) : dryRunPropose(body.prompt, doc.data, baseline, catalog);
  } catch {
    return NextResponse.json({ error: "ai_failed" }, { status: 502 });
  }
  const out = sanitizeAiCommands(proposal.commands, doc.data, baseline, catalog);
  return NextResponse.json({ mode: live ? "live" : "dry-run", summary: proposal.summary, batch: out.batch, accepted: out.accepted, rejected: out.rejected });
}
