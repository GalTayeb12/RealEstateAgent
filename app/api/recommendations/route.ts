/**
 * GET /api/recommendations
 *
 * Returns the four service-category recommendations for the authenticated buyer.
 * If ANTHROPIC_API_KEY is present, Claude generates personalised blurbs from
 * the buyer's stored BuyerProfile.preferences JSON.
 * Without an API key (or if the profile is absent) the generic descriptions
 * from the static CATEGORIES list are used instead.
 *
 * The buyer does not need to have a BuyerProfile — the route falls back to
 * generic blurbs if none is found.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { CATEGORIES, getOrGenerateBlurbs, Recommendation } from "@/lib/recommendations";

export async function GET(req: NextRequest) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Attempt to load the buyer's preferences for personalisation
  let preferences: Record<string, unknown> = {};
  try {
    const profile = await prisma.buyerProfile.findUnique({
      where: { userId: auth.userId },
      select: { preferences: true },
    });
    if (profile?.preferences) {
      preferences = JSON.parse(profile.preferences) as Record<string, unknown>;
    }
  } catch {
    // non-fatal — fall back to generic blurbs
  }

  const blurbs = await getOrGenerateBlurbs(auth.userId, preferences);

  const recommendations: Recommendation[] = CATEGORIES.map(c => ({
    ...c,
    blurb: blurbs.get(c.id) ?? c.genericDescription,
  }));

  return NextResponse.json({ recommendations });
}
