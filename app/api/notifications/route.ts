/**
 * GET /api/notifications — return unread (and recent read) notifications for the buyer
 */

import { NextRequest, NextResponse } from "next/server";
import { extractToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const token = extractToken(req.headers.get("Authorization"));
  if (!token || token.role !== "buyer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Return up to 50 most recent notifications
  const notifications = await prisma.notification.findMany({
    where: { buyerId: token.userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const unreadCount = notifications.filter(n => !n.readAt).length;

  return NextResponse.json({ notifications, unreadCount });
}
