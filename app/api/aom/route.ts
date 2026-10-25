/**
 * GET /api/aom — list all active unit types (public, for the matching engine)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listingAsk } from "@/lib/listingPrice";

export async function GET() {
  try {
    const listings = await prisma.unitType.findMany({
      where: { active: true },
      include: {
        seller: { select: { id: true, email: true } },
        project: { select: { name: true, location: true } },
        units: { select: { status: true, price: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const withAsk = listings.map((listing) => {
      const ask = listingAsk(listing.price, listing.units);
      const { units: _units, ...rest } = listing;
      return { ...rest, price: ask.price, priceFrom: ask.from, listPrice: listing.price };
    });
    return NextResponse.json({ listings: withAsk });
  } catch (err) {
    console.error("[aom GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
