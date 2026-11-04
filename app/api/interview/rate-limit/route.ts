/**
 * GET /api/interview/rate-limit
 *
 * Returns the authenticated buyer's interview attempt quota for the rolling
 * 24-hour window (or since quotaResetAt if that is more recent):
 *   - attempts            : how many sessions started in the effective window
 *   - remaining           : how many more are permitted (max 2 total)
 *   - nextAvailableAt     : ISO timestamp when the oldest attempt expires (null if not blocked)
 *   - hasCompletedProfile : whether the buyer already has a characterised profile
 *   - quotaWasReset       : true when quotaResetAt is set and within the last 24 h
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";

const MAX_ATTEMPTS = 2;
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function GET(req: NextRequest) {
  const payload = extractToken(req.headers.get("authorization"));
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (payload.role !== "buyer") {
    return NextResponse.json(
      { error: "Interview is available to buyer accounts only", code: "BUYER_ONLY" },
      { status: 403 }
    );
  }

  const windowStart = new Date(Date.now() - WINDOW_MS);

  const [user, profile] = await Promise.all([
    prisma.user.findUnique({
      where: { id: payload.userId },
      select: { quotaResetAt: true },
    }),
    prisma.buyerProfile.findUnique({
      where: { userId: payload.userId },
      select: { id: true },
    }),
  ]);

  // Use the later of (now - 24h) and quotaResetAt so that attempts made
  // before an admin reset are excluded from the count.
  const quotaResetAt = user?.quotaResetAt ?? null;
  const since = quotaResetAt && quotaResetAt > windowStart ? quotaResetAt : windowStart;
  const quotaWasReset = quotaResetAt !== null && quotaResetAt > windowStart;

  const attempts = await prisma.interviewAttempt.findMany({
    where: { userId: payload.userId, startedAt: { gte: since } },
    orderBy: { startedAt: "asc" },
    select: { startedAt: true },
  });

  const count = attempts.length;
  const remaining = Math.max(0, MAX_ATTEMPTS - count);

  let nextAvailableAt: string | null = null;
  if (count >= MAX_ATTEMPTS && attempts[0]) {
    nextAvailableAt = new Date(attempts[0].startedAt.getTime() + WINDOW_MS).toISOString();
  }

  return NextResponse.json({
    attempts: count,
    remaining,
    nextAvailableAt,
    hasCompletedProfile: profile !== null,
    quotaWasReset,
  });
}
