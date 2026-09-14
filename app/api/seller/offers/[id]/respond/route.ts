/**
 * POST /api/seller/offers/[id]/respond
 * Body: { action: "accept" | "reject" | "counter", counterPrice?: number,
 *         counterTerms?: string, counterExplanation?: string }
 *
 * Identical to /api/dev/offers/[id]/respond but for sellers.
 * No call to refreshDeveloperQualityScore — sellers have no quality score.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { atomicAcceptOffer, OutOfStockError } from "@/lib/inventory";
import { appendBlock } from "@/lib/ledger";
import {
  emailOfferAccepted,
  emailOfferRejected,
  emailOfferCountered,
} from "@/lib/email";
import { devRespondOfferSchema } from "@/lib/validation/offers";
import { zodError } from "@/lib/validation";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await handlePost(req, params);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[seller/offers/respond] Unhandled error:", msg, err);
    return NextResponse.json({ error: `Server error: ${msg}` }, { status: 500 });
  }
}

async function handlePost(req: NextRequest, params: Promise<{ id: string }>) {
  const { id } = await params;
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "seller") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const offer = await prisma.offer.findFirst({ where: { id, developerId: auth.userId } });
  if (!offer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (offer.status === "accepted" || offer.status === "rejected") {
    return NextResponse.json(
      { error: `Offer has already been ${offer.status}` },
      { status: 409 }
    );
  }

  if (offer.status === "countered") {
    return NextResponse.json(
      { error: "Awaiting buyer's response — you cannot act until the buyer responds to your counter" },
      { status: 409 }
    );
  }

  const rawBody = await req.json();
  const parsedBody = devRespondOfferSchema.safeParse(rawBody);
  if (!parsedBody.success) return zodError(parsedBody.error);
  const { action, counterPrice, counterTerms, counterExplanation } = parsedBody.data;

  // Round limit: after buyer's counter (roundNumber === 2) seller can no longer counter
  if (action === "counter" && (offer.roundNumber ?? 0) >= 2) {
    return NextResponse.json(
      { error: "Maximum negotiation rounds reached — you must accept or reject" },
      { status: 409 }
    );
  }

  // ── Fetch context for history + email (before mutation) ─────────────────────
  const unitForCtx = await prisma.unitType.findUnique({
    where: { id: offer.unitTypeId },
    select: { unitLabel: true, project: { select: { name: true } } },
  });

  let updated: Awaited<ReturnType<typeof prisma.offer.update>>;

  // ── Accept ───────────────────────────────────────────────────────────────────
  if (action === "accept") {
    try {
      updated = await atomicAcceptOffer(offer.id, offer.unitTypeId);
    } catch (err) {
      if (err instanceof OutOfStockError) {
        return NextResponse.json(
          { error: "No units available — inventory already depleted" },
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

    const buyer = await prisma.user.findUnique({ where: { id: offer.buyerId }, select: { email: true } });
    if (buyer && unitForCtx) {
      emailOfferAccepted({
        buyerEmail: buyer.email,
        projectName: unitForCtx.project.name,
        unitLabel: unitForCtx.unitLabel,
        offeredPrice: finalPrice,
      }).catch(console.error);
    }

    return NextResponse.json({ offer: updated });
  }

  // ── Reject ───────────────────────────────────────────────────────────────────
  if (action === "reject") {
    updated = await prisma.offer.update({
      where: { id },
      data: { status: "rejected" },
    });

    const buyer = await prisma.user.findUnique({ where: { id: offer.buyerId }, select: { email: true } });
    if (buyer && unitForCtx) {
      emailOfferRejected({
        buyerEmail: buyer.email,
        projectName: unitForCtx.project.name,
        unitLabel: unitForCtx.unitLabel,
      }).catch(console.error);
    }

    return NextResponse.json({ offer: updated });
  }

  // ── Counter ──────────────────────────────────────────────────────────────────
  const prevHistory: unknown[] = JSON.parse(offer.negotiationHistory || "[]");
  const newHistoryEntry = {
    actor: "seller",
    price: Number(counterPrice),
    terms: counterTerms,
    explanation: counterExplanation,
    ts: new Date().toISOString(),
  };

  updated = await prisma.offer.update({
    where: { id },
    data: {
      status: "countered",
      counterPrice: Number(counterPrice),
      counterTerms: counterTerms as string,
      counterExplanation: counterExplanation as string,
      roundNumber: (offer.roundNumber ?? 0) + 1,
      negotiationHistory: JSON.stringify([...prevHistory, newHistoryEntry]),
    },
  });

  const buyer = await prisma.user.findUnique({ where: { id: offer.buyerId }, select: { email: true } });
  if (buyer && unitForCtx) {
    emailOfferCountered({
      buyerEmail: buyer.email,
      projectName: unitForCtx.project.name,
      unitLabel: unitForCtx.unitLabel,
      counterPrice: Number(counterPrice),
      counterTerms: counterTerms as string,
    }).catch(console.error);
  }

  return NextResponse.json({ offer: updated });
}
