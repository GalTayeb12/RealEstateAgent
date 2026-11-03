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
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/i18n/currency";
import { parseLocale, type Locale } from "@/lib/i18n/locale";

// ─── Transporter ─────────────────────────────────────────────────────────────
// Created once and reused. Nodemailer manages the connection pool internally.
// Port 465 (SMTPS / implicit TLS) is more reliable than 587 + STARTTLS for Gmail.

function createTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;


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
  html?: string;
}

// ─── HTML template helpers ────────────────────────────────────────────────────

const BRAND_BG      = "#F5F2EC";
const BRAND_SURFACE = "#FBFAF7";
const BRAND_INK     = "#123F40";
const BRAND_MUTED   = "#4E6566";
const BRAND_BORDER  = "#E4DED3";
const BRAND_ACCENT  = "#B38B4D";
const BRAND_BTN_FG  = "#FFFFFF";

function emailHtml(opts: {
  preheader?: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
  locale?: "he" | "en";
}): string {
  const dir = opts.locale === "en" ? "ltr" : "rtl";
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BRAND_BG};">${opts.preheader}&nbsp;</div>`
    : "";
  const cta = opts.ctaLabel && opts.ctaHref
    ? `<tr><td align="center" style="padding:24px 40px 8px;">
        <a href="${opts.ctaHref}" style="display:inline-block;background:${BRAND_INK};color:${BRAND_BTN_FG};font-family:Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;padding:13px 32px;border-radius:8px;">${opts.ctaLabel}</a>
       </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="${opts.locale ?? "he"}" dir="${dir}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Haveniq</title>
</head>
<body style="margin:0;padding:0;background:${BRAND_BG};font-family:Arial,Helvetica,sans-serif;">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_BG};padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" style="max-width:560px;background:${BRAND_SURFACE};border-radius:12px;border:1px solid ${BRAND_BORDER};overflow:hidden;">
      <!-- Header -->
      <tr>
        <td style="background:${BRAND_INK};padding:24px 40px;text-align:${dir === "rtl" ? "right" : "left"};">
          <span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:400;color:${BRAND_BTN_FG};letter-spacing:0.03em;">Haveniq</span>
          <span style="display:inline-block;width:4px;height:4px;border-radius:50%;background:${BRAND_ACCENT};margin:0 6px;vertical-align:middle;"></span>
        </td>
      </tr>
      <!-- Body -->
      <tr>
        <td style="padding:32px 40px 8px;color:${BRAND_INK};font-size:15px;line-height:1.7;text-align:${dir === "rtl" ? "right" : "left"};">
          ${opts.body}
        </td>
      </tr>
      ${cta}
      <!-- Footer -->
      <tr>
        <td style="padding:24px 40px 32px;border-top:1px solid ${BRAND_BORDER};color:${BRAND_MUTED};font-size:12px;line-height:1.6;text-align:${dir === "rtl" ? "right" : "left"};">
          © ${new Date().getFullYear()} Haveniq &nbsp;·&nbsp; <a href="${appUrl()}" style="color:${BRAND_MUTED};text-decoration:underline;">haveniq.co.il</a>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function p(text: string): string {
  return `<p style="margin:0 0 1rem;">${text}</p>`;
}

function strong(text: string): string {
  return `<strong style="color:${BRAND_INK};">${text}</strong>`;
}

function metaRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;color:${BRAND_MUTED};font-size:13px;white-space:nowrap;padding-inline-end:16px;">${label}</td>
    <td style="padding:6px 0;font-size:13px;font-weight:600;color:${BRAND_INK};">${value}</td>
  </tr>`;
}

function metaTable(rows: string): string {
  return `<table role="presentation" style="width:100%;background:${BRAND_BG};border-radius:8px;padding:16px 20px;margin:16px 0;border:1px solid ${BRAND_BORDER};">${rows}</table>`;
}

/**
 * Sends an email (HTML + plain-text) via Gmail SMTP.
 * Never throws — failures are logged and swallowed.
 */
export async function sendEmail(payload: EmailPayload): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) return;

  const fromName = process.env.EMAIL_FROM_NAME ?? "Haveniq";
  const fromAddr = process.env.GMAIL_USER!;

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${fromAddr}>`,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      ...(payload.html ? { html: payload.html } : {}),
    });
  } catch (err) {
    console.error("[EMAIL] Send failed:", (err as Error).message, {
      to: payload.to,
      subject: payload.subject,
    });
  }
}

async function recipientLocale(email: string): Promise<Locale> {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { locale: true },
    });
    return parseLocale(user?.locale);
  } catch {
    return "he";
  }
}

function money(amountIls: number, locale: Locale): string {
  const formatted = formatMoney(amountIls, locale);
  if (locale === "en") {
    return `${formatted} (estimated; converted from ILS at a fixed rate)`;
  }
  return formatted;
}

// ─── Event helpers ────────────────────────────────────────────────────────────

/** Developer accepted a buyer's offer → email the buyer */
export async function emailOfferAccepted(opts: {
  buyerEmail: string;
  projectName: string;
  unitLabel: string;
  offeredPrice: number;
}) {
  const locale = await recipientLocale(opts.buyerEmail);
  const price = money(opts.offeredPrice, locale);
  const isHe = locale === "he";
  const dashboardHref = `${appUrl()}/buyer/offers`;
  await sendEmail({
    to: opts.buyerEmail,
    subject: isHe
      ? `ההצעה שלך על ${opts.projectName} — ${opts.unitLabel} התקבלה`
      : `Your offer on ${opts.projectName} — ${opts.unitLabel} has been accepted`,
    text: isHe
      ? `שלום,\n\nההצעה שלך על ${opts.projectName} (${opts.unitLabel}) בסך ${price} התקבלה.\n\nהיכנסו ל-Haveniq כדי להמשיך.\n\n— Haveniq`
      : `Hi,\n\nGreat news — your offer of ${price} on ${opts.projectName} (${opts.unitLabel}) has been accepted.\n\nLog in to Haveniq to review next steps.\n\n— Haveniq`,
    html: emailHtml({
      locale,
      preheader: isHe ? "ההצעה שלך התקבלה" : "Your offer has been accepted",
      body: isHe
        ? `${p("שלום,")}${p(`ההצעה שלך על ${strong(opts.projectName)} (${opts.unitLabel}) התקבלה.`)}${metaTable(metaRow("פרויקט", opts.projectName) + metaRow("יחידה", opts.unitLabel) + metaRow("מחיר", price))}${p("היכנסו לאיזור האישי כדי להמשיך לחדר העסקה.")}`
        : `${p("Hi,")}${p(`Great news — your offer on ${strong(opts.projectName)} (${opts.unitLabel}) has been accepted.`)}${metaTable(metaRow("Project", opts.projectName) + metaRow("Unit", opts.unitLabel) + metaRow("Price", price))}${p("Log in to your account to proceed to the Deal Room.")}`,
      ctaLabel: isHe ? "המשך לחדר העסקה" : "Go to Deal Room",
      ctaHref: dashboardHref,
    }),
  });
}

/** Developer rejected a buyer's offer → email the buyer */
export async function emailOfferRejected(opts: {
  buyerEmail: string;
  projectName: string;
  unitLabel: string;
}) {
  const locale = await recipientLocale(opts.buyerEmail);
  const isHe = locale === "he";
  await sendEmail({
    to: opts.buyerEmail,
    subject: isHe
      ? `עדכון להצעה — ${opts.projectName} — ${opts.unitLabel}`
      : `Update on your offer — ${opts.projectName} — ${opts.unitLabel}`,
    text: isHe
      ? `שלום,\n\nבעל המודעה החליט לא להמשיך עם ההצעה על ${opts.projectName} (${opts.unitLabel}).\n\nאפשר לעיין ביחידות אחרות ב-Haveniq.\n\n— Haveniq`
      : `Hi,\n\nThe listing owner decided not to proceed with your offer on ${opts.projectName} (${opts.unitLabel}).\n\nYou can browse other units on Haveniq.\n\n— Haveniq`,
    html: emailHtml({
      locale,
      preheader: isHe ? "עדכון על ההצעה שלך" : "Update on your offer",
      body: isHe
        ? `${p("שלום,")}${p(`בעל המודעה החליט לא להמשיך עם ההצעה על ${strong(opts.projectName)} (${opts.unitLabel}).`)}${p("אפשר להמשיך לחפש יחידות אחרות שמתאימות לצרכיכם.")}`
        : `${p("Hi,")}${p(`Unfortunately, the listing owner has decided not to proceed with your offer on ${strong(opts.projectName)} (${opts.unitLabel}).`)}${p("You can browse other available units or adjust your search criteria on Haveniq.")}`,
      ctaLabel: isHe ? "חיפוש יחידות" : "Browse units",
      ctaHref: `${appUrl()}/results`,
    }),
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
  const locale = await recipientLocale(opts.buyerEmail);
  const price = money(opts.counterPrice, locale);
  const isHe = locale === "he";
  await sendEmail({
    to: opts.buyerEmail,
    subject: isHe
      ? `התקבלה הצעת נגד — ${opts.projectName} — ${opts.unitLabel}`
      : `Counter-offer received — ${opts.projectName} — ${opts.unitLabel}`,
    text: isHe
      ? `שלום,\n\nהתקבלה הצעת נגד על ${opts.projectName} (${opts.unitLabel}):\n  מחיר: ${price}\n  תנאים: ${opts.counterTerms}\n\nהיכנסו ל-Haveniq לתגובה.\n\n— Haveniq`
      : `Hi,\n\nYou received a counter-offer on ${opts.projectName} (${opts.unitLabel}):\n  Price: ${price}\n  Terms: ${opts.counterTerms}\n\nLog in to Haveniq to respond.\n\n— Haveniq`,
    html: emailHtml({
      locale,
      preheader: isHe ? "התקבלה הצעת נגד" : "You have a new counter-offer",
      body: isHe
        ? `${p("שלום,")}${p(`התקבלה הצעת נגד על ${strong(opts.projectName)} (${opts.unitLabel}).`)}${metaTable(metaRow("פרויקט", opts.projectName) + metaRow("יחידה", opts.unitLabel) + metaRow("מחיר מוצע", price) + metaRow("תנאים", opts.counterTerms))}${p("היכנסו לאישור, דחייה, או שליחת הצעת נגד.")}`
        : `${p("Hi,")}${p(`You have received a counter-offer on ${strong(opts.projectName)} (${opts.unitLabel}).`)}${metaTable(metaRow("Project", opts.projectName) + metaRow("Unit", opts.unitLabel) + metaRow("Counter price", price) + metaRow("Terms", opts.counterTerms))}${p("Log in to accept, reject, or send your own counter.")}`,
      ctaLabel: isHe ? "תגובה להצעה" : "Respond to offer",
      ctaHref: `${appUrl()}/buyer/offers`,
    }),
  });
}

/** Admin approved a developer's account → email the developer */
export async function emailDeveloperApproved(opts: {
  developerEmail: string;
  companyName: string;
}) {
  const locale = await recipientLocale(opts.developerEmail);
  const isHe = locale === "he";
  await sendEmail({
    to: opts.developerEmail,
    subject: isHe ? "חשבון היזם אושר — Haveniq" : "Your developer account has been approved — Haveniq",
    text: isHe
      ? `שלום ${opts.companyName},\n\nחשבון היזם אושר. אפשר לפרסם פרויקטים ולהשיב להצעות.\n\n— Haveniq`
      : `Hi ${opts.companyName},\n\nYour developer account has been approved. You can now list projects and respond to buyer offers.\n\n— Haveniq`,
    html: emailHtml({
      locale,
      preheader: isHe ? "חשבון היזם שלכם אושר" : "Your developer account is approved",
      body: isHe
        ? `${p(`שלום ${strong(opts.companyName)},`)}${p("חשבון היזם שלכם ב-Haveniq אושר. עכשיו אפשר לפרסם פרויקטים, להעלות יחידות, ולהשיב להצעות מקונים.")}`
        : `${p(`Hi ${strong(opts.companyName)},`)}${p("Your developer account on Haveniq has been approved. You can now list projects, upload units, and respond to buyer offers.")}`,
      ctaLabel: isHe ? "כניסה לפאנל" : "Go to dashboard",
      ctaHref: `${appUrl()}/dev/dashboard`,
    }),
  });
}

/** Admin rejected a developer's account → email the developer */
export async function emailDeveloperRejected(opts: {
  developerEmail: string;
  companyName: string;
}) {
  const locale = await recipientLocale(opts.developerEmail);
  const isHe = locale === "he";
  await sendEmail({
    to: opts.developerEmail,
    subject: isHe ? "עדכון לבקשת חשבון היזם — Haveniq" : "Update on your developer account application — Haveniq",
    text: isHe
      ? `שלום ${opts.companyName},\n\nלא ניתן לאשר את חשבון היזם בשלב זה. אם זו טעות, פנו לתמיכה.\n\n— Haveniq`
      : `Hi ${opts.companyName},\n\nWe are unable to approve your developer account at this time. Contact support if you believe this is an error.\n\n— Haveniq`,
    html: emailHtml({
      locale,
      preheader: isHe ? "עדכון על בקשת חשבון היזם" : "Update on your developer account application",
      body: isHe
        ? `${p(`שלום ${strong(opts.companyName)},`)}${p("לאחר בדיקת פרטי הרישום לא ניתן לאשר את חשבון היזם בשלב זה.")}${p(`אם זו טעות או שיש פרטים נוספים לסייע בבדיקה, אנא פנו אלינו.`)}`
        : `${p(`Hi ${strong(opts.companyName)},`)}${p("After reviewing your company registration details, we are unable to approve your developer account at this time.")}${p("Please contact support if you believe this is an error or if you have additional information.")}`,
    }),
  });
}

/** Buyer accepted the developer's counter-offer → notify developer */
export async function emailDevOfferAcceptedByBuyer(opts: {
  developerEmail: string;
  projectName: string;
  unitLabel: string;
  finalPrice: number;
}) {
  const locale = await recipientLocale(opts.developerEmail);
  const price = money(opts.finalPrice, locale);
  const isHe = locale === "he";
  await sendEmail({
    to: opts.developerEmail,
    subject: isHe
      ? `ההצעה אושרה — ${opts.projectName} — ${opts.unitLabel}`
      : `Offer accepted — ${opts.projectName} — ${opts.unitLabel}`,
    text: isHe
      ? `שלום,\n\nקונה אישר הצעת נגד על ${opts.projectName} (${opts.unitLabel}) בסך ${price}.\n\n— Haveniq`
      : `Hi,\n\nA buyer accepted your counter-offer on ${opts.projectName} (${opts.unitLabel}) at ${price}.\n\n— Haveniq`,
    html: emailHtml({
      locale,
      preheader: isHe ? "הצעת הנגד שלך אושרה" : "Your counter-offer was accepted",
      body: isHe
        ? `${p("שלום,")}${p(`קונה אישר את הצעת הנגד על ${strong(opts.projectName)} (${opts.unitLabel}).`)}${metaTable(metaRow("פרויקט", opts.projectName) + metaRow("יחידה", opts.unitLabel) + metaRow("מחיר סופי", price))}${p("היכנסו לפאנל לפרטים נוספים.")}`
        : `${p("Hi,")}${p(`A buyer has accepted your counter-offer on ${strong(opts.projectName)} (${opts.unitLabel}).`)}${metaTable(metaRow("Project", opts.projectName) + metaRow("Unit", opts.unitLabel) + metaRow("Final price", price))}${p("Log in to your dashboard to view the details.")}`,
      ctaLabel: isHe ? "פאנל יזם" : "Developer dashboard",
      ctaHref: `${appUrl()}/dev/dashboard`,
    }),
  });
}

/** Buyer rejected the developer's counter-offer → notify developer */
export async function emailDevOfferRejectedByBuyer(opts: {
  developerEmail: string;
  projectName: string;
  unitLabel: string;
}) {
  const locale = await recipientLocale(opts.developerEmail);
  const isHe = locale === "he";
  await sendEmail({
    to: opts.developerEmail,
    subject: isHe
      ? `הקונה דחה את הצעת הנגד — ${opts.projectName} — ${opts.unitLabel}`
      : `Buyer declined your counter-offer — ${opts.projectName} — ${opts.unitLabel}`,
    text: isHe
      ? `שלום,\n\nהקונה דחה הצעת נגד על ${opts.projectName} (${opts.unitLabel}).\n\n— Haveniq`
      : `Hi,\n\nThe buyer declined your counter-offer on ${opts.projectName} (${opts.unitLabel}).\n\n— Haveniq`,
    html: emailHtml({
      locale,
      preheader: isHe ? "הקונה דחה את ההצעה" : "Buyer declined the offer",
      body: isHe
        ? `${p("שלום,")}${p(`הקונה דחה את הצעת הנגד על ${strong(opts.projectName)} (${opts.unitLabel}).`)}${p("היכנסו לפאנל לסקירת הצעות אחרות.")}`
        : `${p("Hi,")}${p(`The buyer has declined your counter-offer on ${strong(opts.projectName)} (${opts.unitLabel}).`)}${p("Log in to your dashboard to review other incoming offers.")}`,
      ctaLabel: isHe ? "פאנל יזם" : "Developer dashboard",
      ctaHref: `${appUrl()}/dev/dashboard`,
    }),
  });
}

/** Buyer sent their own counter-offer → notify developer */
export async function emailDevBuyerCountered(opts: {
  developerEmail: string;
  projectName: string;
  unitLabel: string;
  buyerPrice: number;
}) {
  const locale = await recipientLocale(opts.developerEmail);
  const price = money(opts.buyerPrice, locale);
  const isHe = locale === "he";
  await sendEmail({
    to: opts.developerEmail,
    subject: isHe
      ? `התקבלה הצעת נגד מהקונה — ${opts.projectName} — ${opts.unitLabel}`
      : `Buyer counter-offer received — ${opts.projectName} — ${opts.unitLabel}`,
    text: isHe
      ? `שלום,\n\nהקונה השיב בהצעת נגד של ${price} על ${opts.projectName} (${opts.unitLabel}).\n\nזהו סבב אחרון — יש לאשר או לדחות.\n\n— Haveniq`
      : `Hi,\n\nThe buyer responded with a counter-offer of ${price} on ${opts.projectName} (${opts.unitLabel}).\n\nFinal round — you must accept or reject.\n\n— Haveniq`,
    html: emailHtml({
      locale,
      preheader: isHe ? "התקבלה הצעת נגד מהקונה" : "Buyer sent a counter-offer",
      body: isHe
        ? `${p("שלום,")}${p(`הקונה השיב בהצעת נגד על ${strong(opts.projectName)} (${opts.unitLabel}).`)}${metaTable(metaRow("פרויקט", opts.projectName) + metaRow("יחידה", opts.unitLabel) + metaRow("הצעת הקונה", price))}${p(`<strong style="color:${BRAND_ACCENT};">זהו סבב המשא ומתן האחרון.</strong> יש לאשר או לדחות.`)}`
        : `${p("Hi,")}${p(`The buyer has responded with a counter-offer on ${strong(opts.projectName)} (${opts.unitLabel}).`)}${metaTable(metaRow("Project", opts.projectName) + metaRow("Unit", opts.unitLabel) + metaRow("Buyer's offer", price))}${p(`<strong style="color:${BRAND_ACCENT};">This is the final negotiation round.</strong> You must now accept or reject.`)}`,
      ctaLabel: isHe ? "תגובה להצעה" : "Respond to offer",
      ctaHref: `${appUrl()}/dev/dashboard`,
    }),
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
  const locale = await recipientLocale(opts.to);
  const isHe = locale === "he";
  await sendEmail({
    to: opts.to,
    subject: isHe ? "אימות הדוא״ל — Haveniq" : "Verify your email — Haveniq",
    text: isHe
      ? `שלום,\n\nתודה על ההרשמה ל-Haveniq. לאימות הדוא״ל לחצו על הקישור:\n\n${link}\n\nהקישור תקף ל־24 שעות.\n\n— Haveniq`
      : `Hi,\n\nThanks for registering on Haveniq. Please verify your email:\n\n${link}\n\nThis link expires in 24 hours.\n\n— Haveniq`,
    html: emailHtml({
      locale,
      preheader: isHe ? "לחצו לאימות כתובת הדוא״ל שלכם" : "Click to verify your email address",
      body: isHe
        ? `${p("שלום,")}${p("תודה על ההרשמה ל-Haveniq. לאימות כתובת הדוא״ל לחצו על הכפתור:")}${p(`<span style="font-size:12px;color:${BRAND_MUTED};">הקישור תקף ל־24 שעות. אם לא יצרתם חשבון, אפשר להתעלם.</span>`)}`
        : `${p("Hi,")}${p("Thanks for registering on Haveniq. Click the button below to verify your email address.")}${p(`<span style="font-size:12px;color:${BRAND_MUTED};">This link expires in 24 hours. If you did not create an account, you can safely ignore this email.</span>`)}`,
      ctaLabel: isHe ? "אמתו את הדוא״ל" : "Verify my email",
      ctaHref: link,
    }),
  });
}

/** Password reset request → send reset link */
export async function emailPasswordResetLink(opts: {
  to: string;
  token: string;
}) {
  const link = `${appUrl()}/reset-password?token=${opts.token}`;
  const locale = await recipientLocale(opts.to);
  const isHe = locale === "he";
  await sendEmail({
    to: opts.to,
    subject: isHe ? "איפוס סיסמה — Haveniq" : "Reset your password — Haveniq",
    text: isHe
      ? `שלום,\n\nקיבלנו בקשה לאיפוס הסיסמה. לחצו:\n\n${link}\n\nהקישור תקף לשעה. אם לא ביקשתם, התעלמו.\n\n— Haveniq`
      : `Hi,\n\nWe received a password reset request for your Haveniq account.\n\n${link}\n\nThis link expires in 1 hour. If you did not request this, ignore the email.\n\n— Haveniq`,
    html: emailHtml({
      locale,
      preheader: isHe ? "בקשת איפוס סיסמה התקבלה" : "Password reset request received",
      body: isHe
        ? `${p("שלום,")}${p("קיבלנו בקשה לאיפוס הסיסמה עבור חשבון Haveniq שלכם. לחצו על הכפתור לבחירת סיסמה חדשה.")}${p(`<span style="font-size:12px;color:${BRAND_MUTED};">הקישור תקף לשעה אחת. אם לא ביקשתם איפוס, אפשר להתעלם — הסיסמה לא תשתנה.</span>`)}`
        : `${p("Hi,")}${p("We received a request to reset the password for your Haveniq account. Click the button below to choose a new password.")}${p(`<span style="font-size:12px;color:${BRAND_MUTED};">This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.</span>`)}`,
      ctaLabel: isHe ? "איפוס סיסמה" : "Reset my password",
      ctaHref: link,
    }),
  });
}

/** Developer unit — buyer reserved at listed price → confirm to buyer */
export async function emailReservationConfirmed(opts: {
  buyerEmail: string;
  projectName: string;
  unitLabel: string;
  reservedPrice: number;
}) {
  const locale = await recipientLocale(opts.buyerEmail);
  const price = money(opts.reservedPrice, locale);
  const isHe = locale === "he";
  await sendEmail({
    to: opts.buyerEmail,
    subject: isHe
      ? `ההזמנה אושרה — ${opts.projectName} — ${opts.unitLabel}`
      : `Reservation confirmed — ${opts.projectName} — ${opts.unitLabel}`,
    text: isHe
      ? `שלום,\n\nההזמנה ל-${opts.projectName} (${opts.unitLabel}) בסך ${price} אושרה.\n\nאפשר להמשיך לחדר העסקה.\n\n— Haveniq`
      : `Hi,\n\nYour reservation for ${opts.projectName} (${opts.unitLabel}) at ${price} is confirmed.\n\nProceed to the Deal Room to pay your deposit and sign.\n\n— Haveniq`,
    html: emailHtml({
      locale,
      preheader: isHe ? "ההזמנה שלך אושרה" : "Your reservation is confirmed",
      body: isHe
        ? `${p("שלום,")}${p(`ההזמנה על ${strong(opts.projectName)} (${opts.unitLabel}) אושרה.`)}${metaTable(metaRow("פרויקט", opts.projectName) + metaRow("יחידה", opts.unitLabel) + metaRow("מחיר", price))}${p("עכשיו אפשר להמשיך לחדר העסקה לתשלום פקדון מדומה ולחתימה על החוזה.")}`
        : `${p("Hi,")}${p(`Your reservation for ${strong(opts.projectName)} (${opts.unitLabel}) has been confirmed.`)}${metaTable(metaRow("Project", opts.projectName) + metaRow("Unit", opts.unitLabel) + metaRow("Price", price))}${p("You can now proceed to the Deal Room to pay your reservation deposit and sign the contract.")}`,
      ctaLabel: isHe ? "חדר העסקה" : "Go to Deal Room",
      ctaHref: `${appUrl()}/buyer/offers`,
    }),
  });
}
