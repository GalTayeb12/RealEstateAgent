/**
 * POST /api/dev/register
 * Creates a User (role=developer) + DeveloperProfile with crnStatus=pending.
 * Accepts questionnaire answers, calls Claude to compute a baselineScore.
 * Does NOT issue a JWT — developer must wait for approval before logging in.
 */
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { performAndStoreResearch } from "@/lib/research";
import { performAndStoreRegistryLookup } from "@/lib/registry";
import { createVerificationToken } from "@/lib/tokens";
import { emailVerificationLink } from "@/lib/email";
import { devRegisterSchema } from "@/lib/validation/admin";
import { zodError } from "@/lib/validation";

const BASELINE_PROMPT = `You are evaluating a real estate developer's registration questionnaire for a property marketplace platform. Assess their professionalism, credibility, and buyer-friendliness based solely on the answers provided.

Score on a 0–100 scale:
  85–100  Highly credible: extensive experience, strong track record, clear buyer-first approach
  70–84   Credible: solid experience, reasonable track record, professional tone
  55–69   Adequate: moderate experience, some track record, acceptable communication style
  40–54   Below average: limited experience, vague track record, generic or impersonal answers
  0–39    Weak: very limited experience, no real track record, concerning tone

Return ONLY valid JSON — no markdown, no explanation:
{ "baselineScore": <number 0-100>, "rationale": "<one sentence>" }`;

async function computeBaselineScore(
  yearsExperience: number,
  completedProjects: number,
  companyDescription: string
): Promise<{ baselineScore: number; rationale: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[dev/register] ANTHROPIC_API_KEY not set — using default baseline score");
    return { baselineScore: 50, rationale: "API key not configured; default score assigned." };
  }

  const client = new Anthropic({ apiKey });
  const userContent = `Years of experience in real estate development: ${yearsExperience}
Number of completed projects to date: ${completedProjects}
Company description / working style with buyers:
${companyDescription}`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      system: BASELINE_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const block = message.content[0];
    if (block.type !== "text") throw new Error("Unexpected response type");

    const cleaned = block.text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(cleaned);

    const score = Number(parsed.baselineScore);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      throw new Error(`Invalid score value: ${parsed.baselineScore}`);
    }

    return { baselineScore: Math.round(score), rationale: String(parsed.rationale ?? "") };
  } catch (err) {
    console.error("[dev/register] Claude baseline scoring failed:", err);
    // Fail gracefully — don't block registration
    return { baselineScore: 50, rationale: "Scoring unavailable at registration time." };
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parsedBody = devRegisterSchema.safeParse(rawBody);
    if (!parsedBody.success) return zodError(parsedBody.error);
    const {
      companyName, crn, contactName, phone, email, password,
      yearsExperience, completedProjects, companyDescription,
    } = parsedBody.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    const crnTaken = await prisma.developerProfile.findUnique({ where: { crn } });
    if (crnTaken) {
      return NextResponse.json({ error: "A company with this CRN is already registered" }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);

    // Score the questionnaire via Claude before persisting
    const { baselineScore, rationale } = await computeBaselineScore(
      Number(yearsExperience),
      Number(completedProjects),
      companyDescription.trim()
    );

    const questionnaireAnswers = JSON.stringify({
      yearsExperience: Number(yearsExperience),
      completedProjects: Number(completedProjects),
      companyDescription: companyDescription.trim(),
      baselineRationale: rationale,
    });

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: "developer",
        developerProfile: {
          create: {
            companyName,
            crn,
            contactName,
            phone,
            baselineScore,
            qualityScore: baselineScore, // initial quality score = baseline (no behavior yet)
            questionnaireAnswers,
          },
        },
      },
      include: { developerProfile: true },
    });

    // Kick off background tasks — user proceeds to /dev/pending immediately.
    // Both functions catch all errors internally, so these never throw.
    void performAndStoreResearch(user.id, companyName, crn);
    void performAndStoreRegistryLookup(user.id, crn, companyName);

    // Send verification email — fire-and-forget.
    createVerificationToken(user.id, "email_verify")
      .then((verifyToken) => emailVerificationLink({ to: user.email, token: verifyToken }))
      .catch((err) => console.error("[dev/register] verification email failed:", err));

    return NextResponse.json(
      {
        message: "Registration submitted for verification",
        userId: user.id,
        crnStatus: user.developerProfile?.crnStatus,
        baselineScore,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[dev/register POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
