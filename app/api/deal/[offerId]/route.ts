/**
 * GET /api/deal/[offerId]
 *
 * Returns full deal data for the Deal Room.
 *
 * Access rules (server-enforced — not just UI):
 *   - Caller must be authenticated (valid JWT)
 *   - Caller must be the buyer OR the developer on this offer
 *   - Offer.status must be "accepted" — no Deal Room before a deal exists
 *
 * Returns 403 with a clear message (not a generic 500) for every access violation.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ offerId: string }> }
) {
  try {
    const { offerId } = await params;
    const auth = extractToken(req.headers.get("Authorization"));
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        buyer: { select: { email: true } },
        developer: {
          select: {
            email: true,
            name: true,
            developerProfile: { select: { companyName: true } },
          },
        },
        unitType: {
          select: {
            unitLabel: true,
            price: true,
            ownerType: true,
            project: { select: { name: true, location: true } },
          },
        },
      },
    });

    if (!offer) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    }

    // Access control: caller must be one of the two parties
    if (auth.userId !== offer.buyerId && auth.userId !== offer.developerId) {
      return NextResponse.json(
        { error: "Access denied — you are not a party to this deal" },
        { status: 403 }
      );
    }

    // Deal Room only exists for accepted offers
    if (offer.status !== "accepted") {
      return NextResponse.json(
        { error: "Deal Room is only available once an offer has been accepted" },
        { status: 403 }
      );
    }

    return NextResponse.json({ offer });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/deal] error:", msg);
    return NextResponse.json({ error: `Server error: ${msg}` }, { status: 500 });
  }
}
