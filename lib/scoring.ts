/**
 * Developer quality scoring engine.
 *
 * behaviorScore (0-100) is derived from the developer's actual Offer history:
 *   - Responsiveness  40% — average response time (createdAt → updatedAt for resolved
 *     offers; now → createdAt for pending ones, which drags the score down)
 *   - Resolution rate 35% — proportion of offers moved out of "pending"
 *   - Engagement rate 25% — proportion resolved as "accepted" or "countered" (vs rejected)
 *
 * If the developer has zero offers, behaviorScore equals their baselineScore so
 * the combined quality_score stays at the baseline until real behavior accumulates.
 *
 * Combined: quality_score = round(0.5 * baselineScore + 0.5 * behaviorScore)
 */

import { prisma } from "@/lib/prisma";

/** Translate an average response time (hours) into a 0-100 responsiveness score. */
function responsivenessFromHours(avgHours: number): number {
  // Linear decay: 0 h → 100, 168 h (1 week) → 0, clamped below 0.
  return Math.max(0, 100 - (avgHours / 168) * 100);
}

interface BehaviorBreakdown {
  behaviorScore: number;
  responsiveness: number;
  resolutionRate: number;
  engagementRate: number;
  offerCount: number;
}

/**
 * Compute a behaviorScore for the developer identified by their User.id.
 * Returns the breakdown for debugging/logging.
 */
export async function computeBehaviorScore(
  developerId: string,
  baselineScore: number
): Promise<BehaviorBreakdown> {
  // Fetch all offers for this developer's unit types.
  const offers = await prisma.offer.findMany({
    where: { developerId },
    select: { status: true, createdAt: true, updatedAt: true },
  });

  if (offers.length === 0) {
    // No behavioral data yet — fall back to baseline.
    return {
      behaviorScore: baselineScore,
      responsiveness: baselineScore,
      resolutionRate: baselineScore,
      engagementRate: baselineScore,
      offerCount: 0,
    };
  }

  const now = Date.now();

  // For each offer, calculate a response-time in hours.
  // Resolved offers: updatedAt - createdAt (this is when the developer first acted).
  // Pending offers: now - createdAt (sitting unresolved drags responsiveness down).
  const responseTimesHours = offers.map((o) => {
    const base = o.createdAt.getTime();
    const changed =
      o.status === "pending" ? now : o.updatedAt.getTime();
    return Math.max(0, (changed - base) / (1000 * 60 * 60));
  });

  const avgHours =
    responseTimesHours.reduce((s, h) => s + h, 0) / responseTimesHours.length;
  const responsiveness = Math.round(responsivenessFromHours(avgHours));

  const resolved = offers.filter((o) => o.status !== "pending").length;
  const engaged = offers.filter(
    (o) => o.status === "accepted" || o.status === "countered"
  ).length;

  const resolutionRate = Math.round((resolved / offers.length) * 100);
  // Engagement rate is relative to total offers (not just resolved) to keep it
  // bounded and avoid inflating when almost everything is rejected.
  const engagementRate = Math.round((engaged / offers.length) * 100);

  const behaviorScore = Math.min(
    100,
    Math.max(
      0,
      Math.round(
        0.4 * responsiveness + 0.35 * resolutionRate + 0.25 * engagementRate
      )
    )
  );

  return {
    behaviorScore,
    responsiveness,
    resolutionRate,
    engagementRate,
    offerCount: offers.length,
  };
}

/**
 * Recompute and persist behaviorScore + qualityScore for a developer.
 * Call this after any offer status change.
 */
export async function refreshDeveloperQualityScore(
  developerId: string
): Promise<void> {
  const profile = await prisma.developerProfile.findUnique({
    where: { userId: developerId },
    select: { baselineScore: true },
  });
  if (!profile) return;

  const { behaviorScore } = await computeBehaviorScore(
    developerId,
    profile.baselineScore
  );

  const qualityScore = Math.round(
    0.5 * profile.baselineScore + 0.5 * behaviorScore
  );

  await prisma.developerProfile.update({
    where: { userId: developerId },
    data: { behaviorScore, qualityScore },
  });

  console.log(
    `[scoring] developer ${developerId}: behaviorScore=${behaviorScore} qualityScore=${qualityScore}`
  );
}
