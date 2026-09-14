/**
 * lib/email.ts — Gmail SMTP email notification layer
 *
 * Uses nodemailer with Gmail SMTP (port 465, SSL).
 * Credentials are read exclusively from environment variables — never hardcoded.
 *
 * Required env vars (add to .env.local — see .env.example):
 *   GMAIL_USER          e.g. you@gmail.com
 *   GMAIL_APP_PASSWORD  16-character App Password from Google Account → Security
 *   EMAIL_FROM_NAME     Display name, e.g. "Haveniq"
 *
 * Error handling: send failures are logged but never thrown — a broken email
 * config must never crash an in-flight user request.
 *
 * Gmail limits: ~500 emails/day on personal accounts. Sufficient for demo/small
 * user base; switch to a transactional provider (Resend, SendGrid, SES) for scale.
 */

import nodemailer from "nodemailer";

// ─── Transporter ─────────────────────────────────────────────────────────────
// Created once and reused. Nodemailer manages the connection pool internally.
// Port 465 (SMTPS / implicit TLS) is more reliable than 587 + STARTTLS for Gmail.

function createTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  console.log("[EMAIL] GMAIL_USER loaded:", !!user, "| GMAIL_APP_PASSWORD loaded:", !!pass);

  if (!user || !pass) {
    // Return null so callers can skip gracefully without crashing at import time.
    return null;
  }

  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true, // implicit TLS (SMTPS)
    auth: { user, pass },
  });
}

// Lazy-initialized so the missing-env warning only appears at send time,
// not during module load (which would spam server startup logs).
let _transporter: ReturnType<typeof nodemailer.createTransport> | null | undefined;

function getTransporter() {
  if (_transporter === undefined) {
    _transporter = createTransporter();
    if (!_transporter) {
      console.warn(
        "[EMAIL] GMAIL_USER or GMAIL_APP_PASSWORD not set — emails will be skipped. " +
        "See .env.example for required variables."
      );
    }
  }
  return _transporter;
}

// ─── Core send ────────────────────────────────────────────────────────────────

export interface EmailPayload {
  to: string;
  subject: string;
  text: string;
}

/**
 * Sends a plain-text email via Gmail SMTP.
 * Never throws — failures are logged and swallowed so the caller's request
 * continues normally.
 */
export async function sendEmail(payload: EmailPayload): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) return; // env not configured — skip silently (warning already logged)

  const fromName = process.env.EMAIL_FROM_NAME ?? "Haveniq";
  const fromAddr = process.env.GMAIL_USER!;

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${fromAddr}>`,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
    });
    console.log(`[EMAIL] Sent "${payload.subject}" → ${payload.to}`);
  } catch (err) {
    // Log and continue — email failure must never break the user-facing request.
    console.error("[EMAIL] Send failed:", (err as Error).message, {
      to: payload.to,
      subject: payload.subject,
    });
  }
}

// ─── Event helpers ────────────────────────────────────────────────────────────

/** Developer accepted a buyer's offer → email the buyer */
export async function emailOfferAccepted(opts: {
  buyerEmail: string;
  projectName: string;
  unitLabel: string;
  offeredPrice: number;
}) {
  await sendEmail({
    to: opts.buyerEmail,
    subject: `Your offer on ${opts.projectName} — ${opts.unitLabel} has been accepted`,
    text: `Hi,

Great news — your offer of £${opts.offeredPrice.toLocaleString()} on ${opts.projectName} (${opts.unitLabel}) has been accepted.

Log in to Haveniq to review next steps and finalise the transaction.

— Haveniq`,
  });
}

/** Developer rejected a buyer's offer → email the buyer */
export async function emailOfferRejected(opts: {
  buyerEmail: string;
  projectName: string;
  unitLabel: string;
}) {
  await sendEmail({
    to: opts.buyerEmail,
    subject: `Update on your offer — ${opts.projectName} — ${opts.unitLabel}`,
    text: `Hi,

Unfortunately the listing owner has decided not to proceed with your offer on ${opts.projectName} (${opts.unitLabel}).

You can browse other available units or adjust your criteria on Haveniq.

— Haveniq`,
  });
}

/** Developer countered a buyer's offer → email the buyer */
export async function emailOfferCountered(opts: {
  buyerEmail: string;
  projectName: string;
  unitLabel: string;
  counterPrice: number;
  counterTerms: string;
}) {
  await sendEmail({
    to: opts.buyerEmail,
    subject: `Counter-offer received — ${opts.projectName} — ${opts.unitLabel}`,
    text: `Hi,

You've received a counter-offer on ${opts.projectName} (${opts.unitLabel}):

  Counter price : £${opts.counterPrice.toLocaleString()}
  Terms         : ${opts.counterTerms}

Log in to Haveniq to accept, reject, or send your own counter.

— Haveniq`,
  });
}

/** Admin approved a developer's account → email the developer */
export async function emailDeveloperApproved(opts: {
  developerEmail: string;
  companyName: string;
}) {
  await sendEmail({
    to: opts.developerEmail,
    subject: "Your developer account has been approved — Haveniq",
    text: `Hi ${opts.companyName},

Your developer account on Haveniq has been approved. You can now list projects and respond to buyer offers.

Log in to get started.

— Haveniq`,
  });
}

/** Admin rejected a developer's account → email the developer */
export async function emailDeveloperRejected(opts: {
  developerEmail: string;
  companyName: string;
}) {
  await sendEmail({
    to: opts.developerEmail,
    subject: "Update on your developer account application — Haveniq",
    text: `Hi ${opts.companyName},

After reviewing your company registration details we are unable to approve your developer account at this time.

Please contact support if you believe this is an error.

— Haveniq`,
  });
}

/** Buyer accepted the developer's counter-offer → notify developer */
export async function emailDevOfferAcceptedByBuyer(opts: {
  developerEmail: string;
  projectName: string;
  unitLabel: string;
  finalPrice: number;
}) {
  await sendEmail({
    to: opts.developerEmail,
    subject: `Offer accepted — ${opts.projectName} — ${opts.unitLabel}`,
    text: `Hi,

A buyer has accepted your counter-offer on ${opts.projectName} (${opts.unitLabel}) at £${opts.finalPrice.toLocaleString()}.

Log in to Haveniq to review the details.

— Haveniq`,
  });
}

/** Buyer rejected the developer's counter-offer → notify developer */
export async function emailDevOfferRejectedByBuyer(opts: {
  developerEmail: string;
  projectName: string;
  unitLabel: string;
}) {
  await sendEmail({
    to: opts.developerEmail,
    subject: `Buyer declined your counter-offer — ${opts.projectName} — ${opts.unitLabel}`,
    text: `Hi,

The buyer has declined your counter-offer on ${opts.projectName} (${opts.unitLabel}).

Log in to Haveniq to review other offers.

— Haveniq`,
  });
}

/** Buyer sent their own counter-offer → notify developer */
export async function emailDevBuyerCountered(opts: {
  developerEmail: string;
  projectName: string;
  unitLabel: string;
  buyerPrice: number;
}) {
  await sendEmail({
    to: opts.developerEmail,
    subject: `Buyer counter-offer received — ${opts.projectName} — ${opts.unitLabel}`,
    text: `Hi,

The buyer has responded with a counter-offer of £${opts.buyerPrice.toLocaleString()} on ${opts.projectName} (${opts.unitLabel}).

This is the final negotiation round — you must now accept or reject. Log in to Haveniq to respond.

— Haveniq`,
  });
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** New user → send email verification link */
export async function emailVerificationLink(opts: {
  to: string;
  token: string;
}) {
  const link = `${appUrl()}/verify-email?token=${opts.token}`;
  await sendEmail({
    to: opts.to,
    subject: "Verify your email — Haveniq",
    text: `Hi,

Thanks for registering on Haveniq. Please verify your email address by clicking the link below:

${link}

This link expires in 24 hours. If you did not create an account, you can safely ignore this email.

— Haveniq`,
  });
}

/** Password reset request → send reset link */
export async function emailPasswordResetLink(opts: {
  to: string;
  token: string;
}) {
  const link = `${appUrl()}/reset-password?token=${opts.token}`;
  await sendEmail({
    to: opts.to,
    subject: "Reset your password — Haveniq",
    text: `Hi,

We received a request to reset the password for your Haveniq account.

Click the link below to choose a new password:

${link}

This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email — your password will not change.

— Haveniq`,
  });
}

/** Developer unit — buyer reserved at listed price → confirm to buyer */
export async function emailReservationConfirmed(opts: {
  buyerEmail: string;
  projectName: string;
  unitLabel: string;
  reservedPrice: number;
}) {
  await sendEmail({
    to: opts.buyerEmail,
    subject: `Reservation confirmed — ${opts.projectName} — ${opts.unitLabel}`,
    text: `Hi,

Your reservation for ${opts.projectName} (${opts.unitLabel}) at £${opts.reservedPrice.toLocaleString()} has been confirmed.

You can now proceed to the Deal Room to pay your reservation deposit and sign the contract.

— Haveniq`,
  });
}
