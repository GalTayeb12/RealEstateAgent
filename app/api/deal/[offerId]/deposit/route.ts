/**
 * POST /api/deal/[offerId]/deposit
 *
 * Simulation-only: marks the deposit step as paid (no real payment processed).
 * Sets Offer.depositPaid = true.
 *
 * Access rules: same as the Deal Room — buyer or developer on an accepted offer.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ offerId: string }> }
) {
  try {
    const { offerId } = await params;
    const auth = extractToken(req.headers.get("Authorization"));
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const offer = await prisma.offer.findUnique({ where: { id: offerId } });

    if (!offer) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    }

    if (auth.userId !== offer.buyerId && auth.userId !== offer.developerId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (offer.status !== "accepted") {
      return NextResponse.json(
        { error: "Deal Room is only available for accepted offers" },
        { status: 403 }
      );
    }

    if (offer.depositPaid) {
      return NextResponse.json({ depositPaid: true }); // idempotent
    }

    await prisma.offer.update({
      where: { id: offerId },
      data: { depositPaid: true },
    });

    return NextResponse.json({ depositPaid: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/deal/deposit] error:", msg);
    return NextResponse.json({ error: `Server error: ${msg}` }, { status: 500 });
  }
}
