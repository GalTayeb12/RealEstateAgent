/**
 * GET /api/interview/rate-limit
 *
 * Returns the authenticated buyer's interview attempt quota for the rolling
 * 24-hour window:
 *   - attempts       : how many sessions started in the last 24 h
 *   - remaining      : how many more are permitted (max 2 total)
 *   - nextAvailableAt: ISO timestamp when the oldest attempt expires (null if not blocked)
 *   - hasCompletedProfile: whether the buyer already has a characterised profile
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";

const MAX_ATTEMPTS = 2;
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function GET(req: NextRequest) {
  const payload = extractToken(req.headers.get("authorization"));
  if (!payload || payload.role !== "buyer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = new Date(Date.now() - WINDOW_MS);

  const [attempts, profile] = await Promise.all([
    prisma.interviewAttempt.findMany({
      where: { userId: payload.userId, startedAt: { gte: since } },
      orderBy: { startedAt: "asc" },
      select: { startedAt: true },
    }),
    prisma.buyerProfile.findUnique({
      where: { userId: payload.userId },
      select: { id: true },
    }),
  ]);

  const count = attempts.length;
  const remaining = Math.max(0, MAX_ATTEMPTS - count);

  // The window opens again when the oldest recorded attempt falls outside 24 h.
  let nextAvailableAt: string | null = null;
  if (count >= MAX_ATTEMPTS && attempts[0]) {
    nextAvailableAt = new Date(attempts[0].startedAt.getTime() + WINDOW_MS).toISOString();
  }

  return NextResponse.json({
    attempts: count,
    remaining,
    nextAvailableAt,
    hasCompletedProfile: profile !== null,
  });
}
