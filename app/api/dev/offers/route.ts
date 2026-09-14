/**
 * GET /api/dev/offers
 * Returns all offers on the developer's unit types, including buyer email,
 * unit type label, parent project name, and server-computed match score.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "developer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const offers = await prisma.offer.findMany({
    where: { developerId: auth.userId },
    include: {
      buyer: { select: { email: true } },
      unitType: {
        select: {
          unitLabel: true,
          project: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ offers });
}
