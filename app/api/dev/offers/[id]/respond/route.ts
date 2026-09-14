/**
 * POST /api/dev/offers/[id]/respond
 * Body: { action: "accept" | "reject" | "counter", counterPrice?: number,
 *         counterTerms?: string, counterExplanation?: string }
 *
 * Round enforcement (roundNumber on the Offer row):
 *   0 — initial offer from buyer        → dev may Accept / Reject / Counter (→ roundNumber 1)
 *   1 — dev already countered           → buyer's turn; dev should not see this as pending
 *   2 — buyer countered back            → dev may ONLY Accept or Reject (no more Counter)
 *
 * Counter action requires `counterExplanation` (mandatory — explains the counter to the buyer).
 *
 * Accept uses the shared atomicAcceptOffer utility (race-condition-safe inventory decrement).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { refreshDeveloperQualityScore } from "@/lib/scoring";
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
    console.error("[dev/offers/respond] Unhandled error:", msg, err);
    return NextResponse.json({ error: `Server error: ${msg}` }, { status: 500 });
  }
}

async function handlePost(req: NextRequest, params: Promise<{ id: string }>) {
  const { id } = await params;
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "developer") {
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

  // When offer is "countered" it's the buyer's turn — developer cannot act
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

  // Developer units are instant-accepted — no negotiation
  const unit = await prisma.unitType.findUnique({ where: { id: offer.unitTypeId }, select: { ownerType: true } });
  if (unit?.ownerType === "developer" && action === "counter") {
    return NextResponse.json({ error: "Developer-owned units use fixed-price reservations — no countering" }, { status: 409 });
  }

  // Round limit: after buyer's counter (roundNumber === 2) dev can no longer counter
  if (action === "counter" && (offer.roundNumber ?? 0) >= 2) {
    return NextResponse.json(
      { error: "Maximum negotiation rounds reached — you must accept or reject" },
      { status: 409 }
    );
  }

  // ── Fetch context for history + email (before mutation) ─────────────────────
  const [developer, unitForCtx] = await Promise.all([
    prisma.user.findUnique({ where: { id: auth.userId }, select: { email: true } }),
    prisma.unitType.findUnique({
      where: { id: offer.unitTypeId },
      select: { unitLabel: true, project: { select: { name: true } } },
    }),
  ]);

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

    await refreshDeveloperQualityScore(auth.userId);

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

    await refreshDeveloperQualityScore(auth.userId);

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
  // Append to immutable history log before overwriting the live counter fields.
  const prevHistory: unknown[] = JSON.parse(offer.negotiationHistory || "[]");
  const newHistoryEntry = {
    actor: "developer",
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

  await refreshDeveloperQualityScore(auth.userId);

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
