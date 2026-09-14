/**
 * GET /api/dev/me
 * Returns the authenticated developer's profile including crnStatus.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "developer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await prisma.developerProfile.findUnique({
    where: { userId: auth.userId },
  });

  if (!profile) {
    return NextResponse.json({ error: "Developer profile not found" }, { status: 404 });
  }

  return NextResponse.json({
    userId: auth.userId,
    email: auth.email,
    companyName: profile.companyName,
    crn: profile.crn,
    contactName: profile.contactName,
    phone: profile.phone,
    crnStatus: profile.crnStatus,
    qualityScore: profile.qualityScore,
    googleConnected: profile.googleConnected,
  });
}
