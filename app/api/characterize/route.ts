/**
 * POST /api/characterize
 *
 * Sends the buyer's interview transcript to Claude Sonnet 4.6 and returns a
 * structured buyer profile.  Also upserts the BuyerProfile row in the DB so
 * /api/match can use it.
 *
 * Body:  { transcriptId: string }
 * Returns: CharacterizationResult
 *
 * Shared prompt/types/validator live in lib/characterize.ts so the PDF demo
 * path (app/api/demo/parse-pdf/route.ts) stays in sync automatically.
 */
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import {
  CHARACTERIZATION_SYSTEM_PROMPT,
  extractJSON,
  validateCharacterizationResult,
  psychometricUpsertData,
} from "@/lib/characterize";
import { characterizeSchema } from "@/lib/validation/matching";
import { zodError } from "@/lib/validation";

// Re-export types so other modules can import CharacterizationResult from here
// without breaking existing import paths.
export type {
  BuyerPreferences,
  PsychometricScores,
  CharacterizationResult,
} from "@/lib/characterize";

function buildTranscriptText(lines: { role: string; text: string }[]): string {
  return lines
    .map((l) => `${l.role === "agent" ? "AGENT" : "BUYER"}: ${l.text}`)
    .join("\n\n");
}

export async function POST(req: NextRequest) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsedBody = characterizeSchema.safeParse(rawBody);
  if (!parsedBody.success) return zodError(parsedBody.error);
  const { transcriptId } = parsedBody.data;

  // Fetch transcript — must belong to this buyer
  const transcript = await prisma.transcript.findFirst({
    where: { id: transcriptId, buyerId: auth.userId },
  });

  if (!transcript) {
    return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
  }

  const lines = JSON.parse(transcript.raw) as { role: string; text: string; ts: number }[];
  const transcriptText = buildTranscriptText(lines);

  // ── Call Claude with retry ────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const client = new Anthropic({ apiKey });
  const USER_CONTENT = `Analyse this buyer interview transcript and return the structured JSON profile:\n\n${transcriptText}`;
  const MAX_ATTEMPTS = 3;

  let result: import("@/lib/characterize").CharacterizationResult | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // ── Claude API call ───────────────────────────────────────────────────
    let raw: string;
    try {
      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: CHARACTERIZATION_SYSTEM_PROMPT,
        messages: [{ role: "user", content: USER_CONTENT }],
      });
      const block = message.content[0];
      if (block.type !== "text") throw new Error("Unexpected response type from Claude");
      raw = block.text.trim();
    } catch (err) {
      console.error("[characterize] Claude API error:", err);
      return NextResponse.json({ error: "Claude API call failed" }, { status: 502 });
    }

    // DEBUG: log raw response before any parsing so failures are visible in server logs
    console.log(
      `[characterize] attempt ${attempt}/${MAX_ATTEMPTS} — raw response (${raw.length} chars):`,
      raw.length > 600 ? raw.slice(0, 600) + " …[truncated]" : raw
    );

    // ── JSON extraction + parse ───────────────────────────────────────────
    let parsed: unknown;
    try {
      const cleaned = extractJSON(raw);
      parsed = JSON.parse(cleaned);
    } catch {
      console.error(
        `[characterize] JSON parse failed on attempt ${attempt}/${MAX_ATTEMPTS}. Full raw:`,
        raw
      );
      if (attempt === MAX_ATTEMPTS) {
        return NextResponse.json({ error: "Claude returned invalid JSON", raw }, { status: 502 });
      }
      console.warn("[characterize] Retrying Claude call…");
      continue;
    }

    // ── Schema validation ─────────────────────────────────────────────────
    if (!validateCharacterizationResult(parsed)) {
      console.error(
        `[characterize] Schema validation failed on attempt ${attempt}/${MAX_ATTEMPTS}:`,
        parsed
      );
      if (attempt === MAX_ATTEMPTS) {
        return NextResponse.json(
          { error: "Claude response failed schema validation", result: parsed },
          { status: 502 }
        );
      }
      console.warn("[characterize] Retrying Claude call…");
      continue;
    }

    result = parsed;
    if (attempt > 1) {
      console.log(`[characterize] Succeeded on attempt ${attempt}`);
    }
    break;
  }

  if (!result) {
    return NextResponse.json({ error: "Characterization failed after retries" }, { status: 502 });
  }

  // ── Upsert BuyerProfile ───────────────────────────────────────────────────
  const psychometricData = psychometricUpsertData(result.psychometric_scores);

  await prisma.buyerProfile.upsert({
    where: { userId: auth.userId },
    create: {
      userId: auth.userId,
      expectedScore: result.expected_score_ej,
      minAcceptanceScore: result.min_acceptance_score_aj,
      preferences: JSON.stringify(result.buyer_preferences),
      ...psychometricData,
    },
    update: {
      expectedScore: result.expected_score_ej,
      minAcceptanceScore: result.min_acceptance_score_aj,
      preferences: JSON.stringify(result.buyer_preferences),
      ...psychometricData,
    },
  });

  return NextResponse.json(result);
}
