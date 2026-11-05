/**
 * GET /api/profile/download — export all data for the authenticated user as JSON.
 * Returns a downloadable JSON file with all user-owned data.
 */

import { NextRequest, NextResponse } from "next/server";
import { extractToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
      id: true,
      email: true,
      role: true,
      name: true,
      phone: true,
      locale: true,
      createdAt: true,
      buyerProfile: { select: { expectedScore: true, minAcceptanceScore: true, preferences: true, updatedAt: true } },
      offersAsBuyer: {
        select: { id: true, offeredPrice: true, status: true, terms: true, createdAt: true, unitType: { select: { unitLabel: true, project: { select: { name: true } } } } },
      },
      transcripts: { select: { id: true, createdAt: true, raw: false } }, // raw excluded — can be large
      alertPreference: { select: { active: true, frequency: true, minScore: true, emailAlerts: true, siteAlerts: true } },
      notifications: { select: { id: true, type: true, title: true, body: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 100 },
    },
  });

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const filename = `haveniq-data-${user.email.replace("@", "-at-")}-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(user, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
