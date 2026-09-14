/**
 * POST /api/deal/[offerId]/sign
 *
 * Records one party's contract signature on an accepted deal.
 *
 * Rules:
 *   - Caller must be authenticated and a party to the offer.
 *   - Offer must be accepted.
 *   - Deposit must be paid before either party can sign.
 *   - A party can only sign once (idempotent — re-POSTing by the same party
 *     after already signing returns 200 without overwriting).
 *   - Once BOTH parties have signed, a confirmation email is sent to both
 *     (guarded by contractEmailSentAt so it fires at most once).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { signContractSchema } from "@/lib/validation/deals";
import { zodError } from "@/lib/validation";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ offerId: string }> }
) {
  try {
    const { offerId } = await params;
    const auth = extractToken(req.headers.get("Authorization"));
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rawBody = await req.json();
    const parsed = signContractSchema.safeParse(rawBody);
    if (!parsed.success) return zodError(parsed.error);
    const body = parsed.data;

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        buyer: { select: { email: true } },
        developer: {
          select: {
            email: true,
            developerProfile: { select: { companyName: true } },
          },
        },
        unitType: {
          select: {
            unitLabel: true,
            project: { select: { name: true, location: true } },
          },
        },
      },
    });

    if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });

    if (auth.userId !== offer.buyerId && auth.userId !== offer.developerId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    if (offer.status !== "accepted") {
      return NextResponse.json({ error: "Deal is not in accepted state" }, { status: 403 });
    }
    if (!offer.depositPaid) {
      return NextResponse.json(
        { error: "Reservation deposit must be paid before signing" },
        { status: 400 }
      );
    }

    const isCallerBuyer = auth.userId === offer.buyerId;
    const sigField = isCallerBuyer ? "buyerSignature" : "developerSignature";
    const alreadySigned = isCallerBuyer ? offer.buyerSignature : offer.developerSignature;

    // Idempotent — already signed, nothing to do.
    if (alreadySigned) {
      return NextResponse.json({ ok: true, alreadySigned: true });
    }

    const sigRecord = JSON.stringify({
      signatureDataUrl: body.signatureDataUrl,
      typedName: body.typedName.trim(),
      signedAt: new Date().toISOString(),
    });

    const updated = await prisma.offer.update({
      where: { id: offerId },
      data: { [sigField]: sigRecord },
    });

    // Check if both parties have now signed.
    const bothSigned = !!(updated.buyerSignature && updated.developerSignature);

    if (bothSigned && !updated.contractEmailSentAt) {
      // Mark as sent first to prevent races.
      await prisma.offer.update({
        where: { id: offerId },
        data: { contractEmailSentAt: new Date() },
      });

      const finalPrice = offer.counterPrice ?? offer.offeredPrice;
      const companyName = offer.developer.developerProfile?.companyName ?? offer.developer.email;
      const propertyLine = `${offer.unitType.project.name}, ${offer.unitType.project.location} — ${offer.unitType.unitLabel}`;

      const emailBody = `Hi,

Both parties have signed the deal summary for:

  Property : ${propertyLine}
  Price     : £${finalPrice.toLocaleString("en-GB")}
  Buyer     : ${offer.buyer.email}
  Developer : ${companyName}

You can view your Deal Room at any time for the full record.

Please note: this confirmation is for simulation purposes only and does not constitute a legally binding contract.

— Haveniq`;

      const subject = `Contract signed — ${offer.unitType.project.name} · ${offer.unitType.unitLabel}`;

      // Fire-and-forget — email failure must not block the response.
      Promise.all([
        sendEmail({ to: offer.buyer.email,     subject, text: emailBody }),
        sendEmail({ to: offer.developer.email, subject, text: emailBody }),
      ]).catch((err) => console.error("[sign] confirmation email failed:", err));
    }

    return NextResponse.json({ ok: true, bothSigned });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/deal/sign] error:", msg);
    return NextResponse.json({ error: `Server error: ${msg}` }, { status: 500 });
  }
}
