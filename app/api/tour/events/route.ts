/**
 * POST /api/tour/events
 * Captures analytics events from the apartment tour.
 * Non-critical — always returns { ok: true } even on failure.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      unitId,
      unitTypeId,
      profileId,
      eventType,
      roomId,
      durationMs,
      payload,
      sessionId,
    } = body as {
      unitId?: string;
      unitTypeId?: string;
      profileId: string;
      eventType: string;
      roomId?: string;
      durationMs?: number;
      payload?: unknown;
      sessionId: string;
    };

    await prisma.tourEvent.create({
      data: {
        unitId: unitId ?? null,
        unitTypeId: unitTypeId ?? null,
        profileId,
        eventType,
        roomId: roomId ?? null,
        durationMs: durationMs ?? null,
        payload: payload ?? undefined,
        sessionId,
      },
    });
  } catch {
    // Analytics are non-critical — swallow errors
  }

  return NextResponse.json({ ok: true });
}
