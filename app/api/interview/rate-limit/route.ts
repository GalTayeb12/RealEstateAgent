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
  try {
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

    // Fetch quotaResetAt separately — extra select on User avoids joining on every call.
    // Falls back gracefully when the column is not yet in the ORM cache.
    let quotaResetAt: Date | null = null;
    try {
      const userRow = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { quotaResetAt: true },
      });
      quotaResetAt = userRow?.quotaResetAt ?? null;
    } catch {
      // If quotaResetAt is unavailable (schema mismatch), ignore and use windowStart.
    }

    const [profile, attempts] = await Promise.all([
      prisma.buyerProfile.findUnique({
        where: { userId: payload.userId },
        select: { id: true },
      }),
      prisma.interviewAttempt.findMany({
        where: {
          userId: payload.userId,
          startedAt: {
            gte:
              quotaResetAt && quotaResetAt > windowStart ? quotaResetAt : windowStart,
          },
        },
        orderBy: { startedAt: "asc" },
        select: { startedAt: true },
      }),
    ]);

    const since =
      quotaResetAt && quotaResetAt > windowStart ? quotaResetAt : windowStart;
    const quotaWasReset = quotaResetAt !== null && quotaResetAt > windowStart;
    const count = attempts.length;
    const remaining = Math.max(0, MAX_ATTEMPTS - count);

    let nextAvailableAt: string | null = null;
    if (count >= MAX_ATTEMPTS && attempts[0]) {
      nextAvailableAt = new Date(
        attempts[0].startedAt.getTime() + WINDOW_MS
      ).toISOString();
    }

    void since; // used only for the attempts query above

    return NextResponse.json({
      attempts: count,
      remaining,
      nextAvailableAt,
      hasCompletedProfile: profile !== null,
      quotaWasReset,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/interview/rate-limit] error:", msg);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
