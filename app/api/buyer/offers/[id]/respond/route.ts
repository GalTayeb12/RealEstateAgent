/**
 * POST /api/buyer/offers/[id]/respond
 * Body: { action: "accept" | "reject" | "counter", counterPrice?: number }
 *
 * Buyer responds to a developer's counter-offer (roundNumber === 1, status "countered").
 *
 * Round enforcement:
 *   accept  → accepted (uses shared atomicAcceptOffer — race-safe inventory decrement)
 *   reject  → rejected
 *   counter → allowed ONLY when roundNumber < 2; bumps roundNumber to 2 and returns
 *             offer to developer (status "pending"). No counterTerms required — price only.
 *             After this the developer can only Accept or Reject.
 *
 * All actions email the developer.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { atomicAcceptOffer, OutOfStockError } from "@/lib/inventory";
import { appendBlock } from "@/lib/ledger";
import {
  emailDevOfferAcceptedByBuyer,
  emailDevOfferRejectedByBuyer,
  emailDevBuyerCountered,
} from "@/lib/email";
import { buyerRespondOfferSchema } from "@/lib/validation/offers";
import { zodError } from "@/lib/validation";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const offer = await prisma.offer.findFirst({ where: { id, buyerId: auth.userId } });
  if (!offer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (offer.status !== "countered") {
    return NextResponse.json(
      { error: "Can only respond to offers in countered state" },
      { status: 409 }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsedBody = buyerRespondOfferSchema.safeParse(rawBody);
  if (!parsedBody.success) return zodError(parsedBody.error);
  const { action, counterPrice } = parsedBody.data;

  // Server-side round limit: buyer may counter only once (roundNumber must be 1)
  if (action === "counter" && (offer.roundNumber ?? 0) >= 2) {
    return NextResponse.json(
      { error: "Maximum negotiation rounds reached — the developer must accept or reject" },
      { status: 409 }
    );
  }

  // Fetch developer + unit context for email (before mutation)
  const [developer, unitForCtx] = await Promise.all([
    prisma.user.findUnique({ where: { id: offer.developerId }, select: { email: true } }),
    prisma.unitType.findUnique({
      where: { id: offer.unitTypeId },
      select: { unitLabel: true, project: { select: { name: true } } },
    }),
  ]);

  // ── Accept ───────────────────────────────────────────────────────────────────
  if (action === "accept") {
    let updated: Awaited<ReturnType<typeof prisma.offer.update>>;
    try {
      updated = await atomicAcceptOffer(offer.id, offer.unitTypeId);
    } catch (err) {
      if (err instanceof OutOfStockError) {
        return NextResponse.json(
          { error: "No units available — this offer can no longer be accepted" },
          { status: 409 }
        );
      }
      throw err;
    }

    // Write deal acceptance to the seller ledger chain
    const finalPrice = offer.counterPrice ?? offer.offeredPrice;
    appendBlock("seller", {
      event: "deal_accepted",
      offerId: offer.id,
      buyerId: offer.buyerId,
      developerId: offer.developerId,
      unitTypeId: offer.unitTypeId,
      finalPrice,
      timestamp: new Date().toISOString(),
    }).then(block =>
      prisma.offer.update({
        where: { id: offer.id },
        data: { ledgerBlockHash: block.hash },
      })
    ).catch(console.error);

    if (developer && unitForCtx) {
      emailDevOfferAcceptedByBuyer({
        developerEmail: developer.email,
        projectName: unitForCtx.project.name,
        unitLabel: unitForCtx.unitLabel,
        finalPrice,
      }).catch(console.error);
    }

    return NextResponse.json({ offer: updated });
  }

  // ── Reject ───────────────────────────────────────────────────────────────────
  if (action === "reject") {
    const updated = await prisma.offer.update({
      where: { id },
      data: { status: "rejected" },
    });

    if (developer && unitForCtx) {
      emailDevOfferRejectedByBuyer({
        developerEmail: developer.email,
        projectName: unitForCtx.project.name,
        unitLabel: unitForCtx.unitLabel,
      }).catch(console.error);
    }

    return NextResponse.json({ offer: updated });
  }

  // ── Counter — buyer's price-only counter (roundNumber 1 → 2) ─────────────────
  // Save dev's current counter to history before clearing it from the live fields.
  const prevHistory: unknown[] = JSON.parse(offer.negotiationHistory || "[]");
  const buyerHistoryEntry = {
    actor: "buyer",
    price: Number(counterPrice),
    ts: new Date().toISOString(),
  };

  const updated = await prisma.offer.update({
    where: { id },
    data: {
      offeredPrice: Number(counterPrice),
      // terms stay unchanged — buyer only changes price in round 3
      status: "pending",
      // Clear the developer's counter so the dev dashboard shows a fresh offer
      counterPrice: null,
      counterTerms: null,
      counterExplanation: null,
      roundNumber: 2,
      negotiationHistory: JSON.stringify([...prevHistory, buyerHistoryEntry]),
    },
  });

  if (developer && unitForCtx) {
    emailDevBuyerCountered({
      developerEmail: developer.email,
      projectName: unitForCtx.project.name,
      unitLabel: unitForCtx.unitLabel,
      buyerPrice: Number(counterPrice),
    }).catch(console.error);
  }

  return NextResponse.json({ offer: updated });
}
