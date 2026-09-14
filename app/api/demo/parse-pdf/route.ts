/**
 * POST /api/demo/parse-pdf
 *
 * DEMO ONLY — remove before production.
 *
 * Accepts a PDF upload, extracts text, asks Claude to infer the buyer's
 * profile, upserts BuyerProfile + creates a Transcript record, then returns
 * the same CharacterizationResult shape as /api/characterize so the
 * /processing page can feed it straight into /api/match.
 *
 * Shared prompt/types/validator live in lib/characterize.ts — both paths
 * stay in sync automatically, including psychometric scoring.
 *
 * FormData fields:
 *   file  — the PDF file (required)
 */
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { PDFParse } from "pdf-parse";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import {
  CHARACTERIZATION_SYSTEM_PROMPT,
  extractJSON,
  validateCharacterizationResult,
  psychometricUpsertData,
} from "@/lib/characterize";
import type { CharacterizationResult } from "@/lib/characterize";

// Keep Node.js runtime so pdf-parse (uses pdfjs workers) works correctly.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse multipart form data ─────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[parse-pdf] formData() failed:", msg);
    return NextResponse.json({ error: "Could not parse multipart form data", detail: msg }, { status: 400 });
  }

  const file = formData.get("file");
  console.log("[parse-pdf] file field type:", file === null ? "null" : typeof file, file instanceof Blob ? "(Blob/File)" : "");
  if (!file) {
    return NextResponse.json({ error: "No file field found in form data. Expected field name: 'file'." }, { status: 400 });
  }
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: `'file' field is not a Blob/File (got ${typeof file})` }, { status: 400 });
  }

  // ── Extract text from PDF (pdf-parse v2 class API) ────────────────────────
  // DEMO ONLY — remove before production
  let pdfText: string;
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log("[parse-pdf] buffer size:", buffer.byteLength, "bytes");

    // pdf-parse v2 passes options straight to pdfjs.getDocument().
    // disableWorker:true runs parsing on the main thread — required for
    // Next.js/Turbopack server-side because the worker .mjs file is not
    // placed where pdfjs-dist expects it after bundling. No functional
    // difference for text extraction; workers only matter for browser perf.
    // DEMO ONLY — remove before production
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parser = new PDFParse({ data: buffer, disableWorker: true } as any);
    const pdfData = await parser.getText();
    await parser.destroy();
    pdfText = pdfData.text.trim();
    console.log("[parse-pdf] extracted", pdfText.length, "chars of text");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[parse-pdf] PDF extraction failed:", msg, stack);
    return NextResponse.json(
      { error: "Could not extract text from PDF.", detail: msg },
      { status: 422 }
    );
  }

  if (!pdfText) {
    return NextResponse.json(
      { error: "PDF appears to be empty or image-only — no extractable text found." },
      { status: 422 }
    );
  }

  // ── Call Claude with retry ────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const client = new Anthropic({ apiKey });
  const USER_CONTENT = `Analyse this buyer's written requirements document and return the structured JSON profile:\n\n${pdfText}`;
  const MAX_ATTEMPTS = 3;

  let result: CharacterizationResult | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // ── Claude API call ───────────────────────────────────────────────────
    let rawResponse: string;
    try {
      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: CHARACTERIZATION_SYSTEM_PROMPT,
        messages: [{ role: "user", content: USER_CONTENT }],
      });
      const block = message.content[0];
      if (block.type !== "text") throw new Error("Unexpected response type from Claude");
      rawResponse = block.text.trim();
    } catch (err) {
      // API-level failure — no point retrying, surface immediately
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[parse-pdf] Claude API error:", msg);
      return NextResponse.json({ error: "Claude API call failed", detail: msg }, { status: 502 });
    }

    // DEBUG: log raw response before any parsing so failures are visible in server logs
    console.log(
      `[parse-pdf] attempt ${attempt}/${MAX_ATTEMPTS} — raw response (${rawResponse.length} chars):`,
      rawResponse.length > 600 ? rawResponse.slice(0, 600) + " …[truncated]" : rawResponse
    );

    // ── JSON extraction + parse ───────────────────────────────────────────
    let parsed: unknown;
    try {
      const cleaned = extractJSON(rawResponse);
      parsed = JSON.parse(cleaned);
    } catch (err) {
      console.error(
        `[parse-pdf] JSON parse failed on attempt ${attempt}/${MAX_ATTEMPTS}. Full raw:`,
        rawResponse
      );
      if (attempt === MAX_ATTEMPTS) {
        return NextResponse.json(
          { error: "Claude returned invalid JSON", raw: rawResponse },
          { status: 502 }
        );
      }
      console.warn(`[parse-pdf] Retrying Claude call…`);
      continue;
    }

    // ── Schema validation ─────────────────────────────────────────────────
    if (!validateCharacterizationResult(parsed)) {
      console.error(
        `[parse-pdf] Schema validation failed on attempt ${attempt}/${MAX_ATTEMPTS}:`,
        parsed
      );
      if (attempt === MAX_ATTEMPTS) {
        return NextResponse.json(
          { error: "Claude response failed schema validation", result: parsed },
          { status: 502 }
        );
      }
      console.warn(`[parse-pdf] Retrying Claude call…`);
      continue;
    }

    result = parsed;
    if (attempt > 1) {
      console.log(`[parse-pdf] Succeeded on attempt ${attempt}`);
    }
    break;
  }

  if (!result) {
    // Defensive — loop always returns or sets result
    return NextResponse.json({ error: "Characterization failed after retries" }, { status: 502 });
  }

  // ── Persist: Transcript + BuyerProfile ───────────────────────────────────
  // Store the PDF text as a single "user" transcript line so there's an audit
  // record — same Transcript model as the real interview flow.
  // DEMO ONLY — in production the transcript comes from the avatar interview.
  const transcript = await prisma.transcript.create({
    data: {
      buyerId: auth.userId,
      raw: JSON.stringify([{ role: "user", text: pdfText, ts: Date.now() }]),
    },
  });

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

  return NextResponse.json({ ...result, transcriptId: transcript.id });
}
