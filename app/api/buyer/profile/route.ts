/**
 * GET /api/buyer/profile
 *
 * Returns the authenticated buyer's existing characterisation profile in the
 * same shape as POST /api/characterize, so that /processing can re-run the
 * matching step without a new interview transcript (e.g. returning users who
 * already have a saved profile).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const payload = extractToken(req.headers.get("authorization"));
  if (!payload || payload.role !== "buyer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await prisma.buyerProfile.findUnique({
    where: { userId: payload.userId },
  });

  if (!profile) {
    return NextResponse.json({ error: "No profile found" }, { status: 404 });
  }

  let buyer_preferences: Record<string, unknown> = {};
  try {
    buyer_preferences = JSON.parse(profile.preferences);
  } catch {
    // Leave as empty object if preferences JSON is malformed
  }

  return NextResponse.json({
    buyer_preferences,
    expected_score_ej: profile.expectedScore,
    min_acceptance_score_aj: profile.minAcceptanceScore,
    behavioral_insights: "",
    intent_signals: "",
    psychometric_scores: {
      verbal_reasoning: profile.verbalReasoning ?? 0,
      numerical_reasoning: profile.numericalReasoning ?? 0,
      spatial_reasoning: profile.spatialReasoning ?? 0,
      abstract_reasoning: profile.abstractReasoning ?? 0,
      memory: profile.memory ?? 0,
      attention: profile.attention ?? 0,
      processing_speed: profile.processingSpeed ?? 0,
      executive_function: profile.executiveFunction ?? 0,
    },
  });
}
