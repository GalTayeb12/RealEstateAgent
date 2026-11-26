/** GET /api/offers/{id}/design — the design the buyer attached to this offer; visible to that buyer and the offer's developer only. */
import { NextRequest, NextResponse } from "next/server";
import { extractToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const offer = await prisma.offer.findUnique({ where: { id }, select: { buyerId: true, developerId: true, designSnapshot: true } });
  if (!offer || !offer.designSnapshot || (offer.buyerId !== auth.userId && offer.developerId !== auth.userId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ snapshot: offer.designSnapshot });
}
