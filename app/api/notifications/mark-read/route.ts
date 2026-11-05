/**
 * POST /api/notifications/mark-read
 * Body: { ids?: string[] } — mark specific notification IDs as read.
 *       If ids is omitted or empty, marks ALL unread notifications as read.
 */

import { NextRequest, NextResponse } from "next/server";
import { extractToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const token = extractToken(req.headers.get("Authorization"));
  if (!token || token.role !== "buyer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as { ids?: string[] };
  const now = new Date();

  if (body.ids && body.ids.length > 0) {
    await prisma.notification.updateMany({
      where: {
        buyerId: token.userId,
        id: { in: body.ids },
        readAt: null,
      },
      data: { readAt: now },
    });
  } else {
    await prisma.notification.updateMany({
      where: { buyerId: token.userId, readAt: null },
      data: { readAt: now },
    });
  }

  return NextResponse.json({ ok: true });
}
