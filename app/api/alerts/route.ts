/**
 * GET  /api/alerts — return current buyer alert preferences (or null)
 * POST /api/alerts — upsert buyer alert preferences
 */

import { NextRequest, NextResponse } from "next/server";
import { extractToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const token = extractToken(req.headers.get("Authorization"));
  if (!token || token.role !== "buyer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pref = await prisma.alertPreference.findUnique({
    where: { buyerId: token.userId },
  });

  return NextResponse.json({ preference: pref });
}

export async function POST(req: NextRequest) {
  const token = extractToken(req.headers.get("Authorization"));
  if (!token || token.role !== "buyer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as {
    active?: boolean;
    frequency?: string;
    minScore?: number;
    emailAlerts?: boolean;
    siteAlerts?: boolean;
  };

  const data = {
    active:      typeof body.active      === "boolean" ? body.active      : true,
    frequency:   body.frequency === "daily" ? "daily" : "immediate",
    minScore:    typeof body.minScore    === "number"  ? Math.max(0, Math.min(100, body.minScore)) : 0,
    emailAlerts: typeof body.emailAlerts === "boolean" ? body.emailAlerts : true,
    siteAlerts:  typeof body.siteAlerts  === "boolean" ? body.siteAlerts  : true,
  };

  const pref = await prisma.alertPreference.upsert({
    where:  { buyerId: token.userId },
    create: { buyerId: token.userId, ...data },
    update: data,
  });

  return NextResponse.json({ preference: pref });
}
