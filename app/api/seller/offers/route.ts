/**
 * GET /api/seller/offers
 * Returns all offers on the seller's unit types.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { withDesignFlag } from "@/lib/studio/offerFlags";

export async function GET(req: NextRequest) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "seller") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const offers = await prisma.offer.findMany({
    where: { developerId: auth.userId },
    omit: { designSnapshot: true },
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

  return NextResponse.json({ offers: await withDesignFlag(offers) });
}
