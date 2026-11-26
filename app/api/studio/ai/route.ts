/**
 * POST /api/studio/ai  { slug, prompt, lang, doc }  ->  { provider, summary, command, accepted, dropped, ... }
 *
 * The AI designer. Studio flag + developer/admin role (404 otherwise, like the other studio routes),
 * a per-user rate limit, and server-side validation: the plan is compiled against the baseline and
 * the published catalog loaded HERE (never trusted from the client), so the returned batch holds only
 * published assets and passes the editor's placement rules. The client still re-applies it through
 * its own command engine before showing the ghost preview.
 *
 * Provider: the free dry-run planner unless STUDIO_AI_PROVIDER=claude (paid; owner approval required).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { extractToken } from "@/lib/auth";
import { studioAccess } from "@/lib/studio/flags";
import type { Baseline } from "@/lib/studio/baseline/fromTwin";
import { runDesigner } from "@/lib/studio/ai/designer";
import { SlidingLimiter } from "@/lib/studio/ai/limit";
import { parseDocument } from "@/lib/studio/persist/ops";
import { browsableCatalog, currentCatalog } from "@/lib/studio/catalog/server";
import { catalogFrom } from "@/lib/studio/schema/catalog";

export const dynamic = "force-dynamic";

const PER_MINUTE = Number(process.env.STUDIO_AI_PER_MINUTE ?? 8);
const limiter = new SlidingLimiter(PER_MINUTE, 60_000);
const PROMPT_MAX = 500;

type Loaded = { baselineId: string; baseline: Baseline };
const baselines = new Map<string, Promise<Loaded | null>>();

function loadBaseline(slug: string): Promise<Loaded | null> {
  if (!baselines.has(slug)) {
    baselines.set(slug, fs.readFile(path.join(process.cwd(), "public", "walk", slug, "baseline.json"), "utf8")
      .then((s) => { const j = JSON.parse(s); return { baselineId: j.id as string, baseline: j.baseline as Baseline }; })
      .catch(() => null));
  }
  return baselines.get(slug)!;
}

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || !studioAccess(auth.role).allowed) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const gate = limiter.take(auth.userId);
  if (!gate.ok) return NextResponse.json({ error: "rate_limited", retryAfter: gate.retryAfter }, { status: 429, headers: { "Retry-After": String(gate.retryAfter) } });

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return bad("invalid_json"); }
  const slug = typeof body.slug === "string" && /^[a-z0-9-]{1,80}$/.test(body.slug) ? body.slug : null;
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const lang = body.lang === "he" ? "he" : "en";
  if (!slug) return bad("bad_slug");
  if (!prompt || prompt.length > PROMPT_MAX) return bad("bad_prompt");

  const loaded = await loadBaseline(slug);
  if (!loaded) return bad("unknown_apartment", 404);
  let doc;
  try { doc = parseDocument(body.doc); } catch { return bad("bad_document"); }
  if (doc.baseline.id !== loaded.baselineId) return bad("document_for_another_apartment");

  // the latest published release: every entry resolves (existing designs), only browsable ones may be proposed
  const current = await currentCatalog();
  const catalog = catalogFrom(current.models, current.materials);
  const { models, materials } = browsableCatalog(current);
  try {
    const { provider, proposal, error } = await runDesigner({ prompt, lang, doc, baseline: loaded.baseline, catalog, models, materials });
    return NextResponse.json({ provider, ...proposal, ...(error ? { error } : {}), remaining: gate.remaining });
  } catch (e) {
    console.error("[studio/ai]", e);
    return bad("designer_failed", 500);
  }
}
