/**
 * GET /api/dev/reservations
 * Returns accepted offers on developer-owned units (instant-reserved by buyers).
 * Read-only — developers cannot counter or reject these.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "developer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reservations = await prisma.offer.findMany({
    where: { developerId: auth.userId, status: "accepted" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      offeredPrice: true,
      depositPaid: true,
      buyerSignature: true,
      developerSignature: true,
      createdAt: true,
      buyer: { select: { email: true } },
      unitType: {
        select: {
          unitLabel: true,
          price: true,
          project: { select: { name: true } },
        },
      },
    },
  });

  return NextResponse.json({ reservations });
}
