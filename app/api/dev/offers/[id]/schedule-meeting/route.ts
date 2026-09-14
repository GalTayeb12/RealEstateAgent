/**
 * POST /api/dev/offers/[id]/schedule-meeting
 *
 * Creates a Google Meet event for a negotiation that has reached the round limit.
 * Only the developer who owns the offer may call this endpoint.
 *
 * Prerequisites:
 *   - Developer must have connected their Google account (googleConnected = true)
 *   - Offer must be in a state where a meeting makes sense (roundNumber >= 2 OR any active offer)
 *
 * On success:
 *   - Saves meetingLink on the Offer record
 *   - Emails the buyer with the Meet link
 *   - Returns { meetingLink }
 *
 * On failure:
 *   - Returns a clear error message — never crashes silently
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { scheduleMeeting } from "@/lib/google";
import { sendEmail } from "@/lib/email";
import { scheduleMeetingSchema } from "@/lib/validation/offers";
import { zodError } from "@/lib/validation";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "developer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: offerId } = await params;

  // Parse and validate the chosen meeting time from the request body
  let rawBody: unknown = {};
  try { rawBody = await req.json(); } catch { /* empty body is handled by Zod below */ }

  const parsedBody = scheduleMeetingSchema.safeParse(rawBody);
  if (!parsedBody.success) return zodError(parsedBody.error);
  const { isoString, timezone } = parsedBody.data;

  const startDateTime = new Date(isoString);
  if (isNaN(startDateTime.getTime())) {
    return NextResponse.json({ error: "Invalid date/time format" }, { status: 400 });
  }
  if (startDateTime <= new Date()) {
    return NextResponse.json({ error: "Meeting time must be in the future" }, { status: 400 });
  }
  const safeTimezone = timezone ?? "UTC";

  // Load offer with buyer email, unit type details, and developer email
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: {
      buyer: { select: { email: true } },
      developer: { select: { email: true } },
      unitType: {
        select: {
          unitLabel: true,
          project: { select: { name: true } },
        },
      },
    },
  });

  if (!offer) {
    return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  }

  if (offer.developerId !== auth.userId) {
    return NextResponse.json({ error: "Not your offer" }, { status: 403 });
  }

  if (offer.status === "accepted" || offer.status === "rejected") {
    return NextResponse.json(
      { error: "Cannot schedule a meeting on a closed offer" },
      { status: 400 }
    );
  }

  // Check Google connection
  const devProfile = await prisma.developerProfile.findUnique({
    where: { userId: auth.userId },
    select: { googleConnected: true },
  });

  if (!devProfile?.googleConnected) {
    return NextResponse.json(
      {
        error: "Google account not connected",
        connectUrl: `/api/auth/google?userId=${auth.userId}`,
      },
      { status: 422 }
    );
  }

  const projectName = offer.unitType.project.name;
  const unitLabel = offer.unitType.unitLabel;

  // Build a brief price summary for the calendar event description
  const history: Array<{ actor: string; price: number }> = (() => {
    try { return JSON.parse(offer.negotiationHistory || "[]"); } catch { return []; }
  })();
  const lastTwo = history.slice(-2);
  const priceSummary = lastTwo.length
    ? lastTwo.map((e) => `${e.actor === "developer" ? "Dev" : "Buyer"}: £${e.price.toLocaleString()}`).join(" → ")
    : `Buyer: £${offer.offeredPrice.toLocaleString()}`;

  let meetingLink: string;
  try {
    meetingLink = await scheduleMeeting({
      developerUserId: auth.userId,
      offerId,
      projectName,
      unitLabel,
      developerEmail: offer.developer.email,
      buyerEmail: offer.buyer.email,
      priceSummary,
      startDateTime,
      timezone: safeTimezone,
    });
  } catch (err) {
    const message = (err as Error).message ?? "Unknown error";
    console.error(`[schedule-meeting] Failed for offer ${offerId}:`, message);

    // Surface a clear, actionable error — never crash silently
    const isAuthError =
      message.includes("invalid_grant") ||
      message.includes("Token has been expired") ||
      message.includes("invalid_client");

    return NextResponse.json(
      {
        error: isAuthError
          ? "Failed to create meeting — your Google account connection has expired. Please reconnect your Google account from your profile settings."
          : `Failed to create meeting — ${message}. If the problem persists, try reconnecting your Google account.`,
      },
      { status: 502 }
    );
  }

  // Persist meeting link on the offer
  await prisma.offer.update({
    where: { id: offerId },
    data: { meetingLink },
  });

  // Email buyer — non-blocking, failure is logged but not thrown
  const meetingTimeStr = startDateTime.toLocaleString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit",
    timeZone: safeTimezone,
    timeZoneName: "short",
  });

  await sendEmail({
    to: offer.buyer.email,
    subject: `Video call invitation — ${projectName} ${unitLabel}`,
    text: `Hi,

The developer has invited you to a Google Meet video call to discuss the deal for ${projectName} (${unitLabel}).

Call time: ${meetingTimeStr} (30 minutes)
Join here: ${meetingLink}

If the time doesn't work, reply to this email to arrange an alternative.

— Haveniq`,
  });

  return NextResponse.json({ meetingLink });
}
