/**
 * GET  /api/offers — list authenticated buyer's own offers
 * POST /api/offers — buyer submits an offer on a unit type
 *
 * POST body: { unitTypeId, offeredPrice (£), terms? }
 *
 * The buyer sends a £ price.  The server looks up the buyer's most recent
 * MatchResult for this unit type to get the pfij score and stores it as
 * matchScore — the buyer never sets or sees this value.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { createOfferSchema } from "@/lib/validation/offers";
import { zodError } from "@/lib/validation";
import { atomicAcceptOffer, OutOfStockError } from "@/lib/inventory";
import { appendBlock } from "@/lib/ledger";
import { emailReservationConfirmed } from "@/lib/email";

export async function GET(req: NextRequest) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const offers = await prisma.offer.findMany({
    where: { buyerId: auth.userId },
    include: {
      unitType: {
        select: {
          unitLabel: true,
          price: true,
          project: { select: { name: true, location: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ offers });
}

export async function POST(req: NextRequest) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createOfferSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);
  const { unitTypeId, offeredPrice, terms = "" } = parsed.data;

  const unitType = await prisma.unitType.findUnique({
    where: { id: unitTypeId },
    select: { id: true, sellerId: true, active: true, quantityAvailable: true, ownerType: true, price: true },
  });

  if (!unitType || !unitType.active) {
    return NextResponse.json({ error: "Unit type not found or inactive" }, { status: 404 });
  }
  if (unitType.quantityAvailable <= 0) {
    return NextResponse.json({ error: "No units available for this listing" }, { status: 409 });
  }
  if (unitType.sellerId === auth.userId) {
    return NextResponse.json({ error: "Cannot submit an offer on your own listing" }, { status: 400 });
  }

  // Prevent duplicate pending offers from the same buyer on the same unit type
  const existing = await prisma.offer.findFirst({
    where: { buyerId: auth.userId, unitTypeId, status: { in: ["pending", "countered"] } },
  });
  if (existing) {
    return NextResponse.json({ error: "You already have a pending offer on this listing" }, { status: 409 });
  }

  // Retrieve server-side match score (pfij) from the most recent MatchResult
  // for this (buyer, unitType) pair — never exposed to the buyer as an input
  const matchResult = await prisma.matchResult.findFirst({
    where: { buyerId: auth.userId, unitTypeId },
    orderBy: { createdAt: "desc" },
    select: { pfij: true },
  });

  // ── Developer-owned unit: instant-accept at listed price ────────────────────
  if (unitType.ownerType === "developer") {
    const pendingOffer = await prisma.offer.create({
      data: {
        buyerId: auth.userId,
        unitTypeId,
        developerId: unitType.sellerId,
        offeredPrice: unitType.price, // always at listed price
        matchScore: matchResult?.pfij ?? null,
        terms: "",
        status: "pending",
      },
    });

    let acceptedOffer;
    try {
      acceptedOffer = await atomicAcceptOffer(pendingOffer.id, unitTypeId);
    } catch (err) {
      if (err instanceof OutOfStockError) {
        await prisma.offer.delete({ where: { id: pendingOffer.id } });
        return NextResponse.json({ error: "No units available for this listing" }, { status: 409 });
      }
      throw err;
    }

    // Fetch unit context for email
    const unitForCtx = await prisma.unitType.findUnique({
      where: { id: unitTypeId },
      select: { unitLabel: true, project: { select: { name: true } } },
    });

    // Write to ledger (fire-and-forget)
    appendBlock("seller", {
      event: "deal_reserved",
      offerId: acceptedOffer.id,
      buyerId: auth.userId,
      developerId: unitType.sellerId,
      unitTypeId,
      finalPrice: unitType.price,
      timestamp: new Date().toISOString(),
    }).then(block =>
      prisma.offer.update({ where: { id: acceptedOffer.id }, data: { ledgerBlockHash: block.hash } })
    ).catch(console.error);

    // Email buyer
    if (unitForCtx) {
      emailReservationConfirmed({
        buyerEmail: auth.email,
        projectName: unitForCtx.project.name,
        unitLabel: unitForCtx.unitLabel,
        reservedPrice: unitType.price,
      }).catch(console.error);
    }

    return NextResponse.json({ offer: acceptedOffer, instantAccepted: true }, { status: 201 });
  }

  // ── Seller-owned unit: normal pending offer ─────────────────────────────────
  const offer = await prisma.offer.create({
    data: {
      buyerId: auth.userId,
      unitTypeId,
      developerId: unitType.sellerId,
      offeredPrice: Number(offeredPrice),
      matchScore: matchResult?.pfij ?? null,
      terms,
      status: "pending",
    },
  });

  return NextResponse.json({ offer }, { status: 201 });
}
