/**
 * lib/alerts.ts — Property alert trigger logic and email templates.
 *
 * Trigger points:
 *   - New listing published (UnitType created/activated)
 *   - Price drop on an existing listing
 *
 * Flow:
 *   1. For each active AlertPreference buyer, run match vs. the new/updated listing
 *   2. If Zij >= buyer.minScore AND passes hard filters → create Notification + send email
 *   3. Daily-digest buyers: create Notification only; a cron job sends the email digest
 */

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { computeZij } from "@/lib/matching";
import type { AomCandidate } from "@/lib/matching";
import { checkHardFilters } from "@/lib/matching";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AlertContext {
  type: "new_listing" | "price_drop";
  unitTypeId: string;
  unitLabel: string;
  projectName: string;
  projectLocation: string;
  price: number;
  eil: number;
  ail: number;
  attributes: Record<string, unknown>;
  /** Previous price (only for price_drop events) */
  previousPrice?: number;
}

// ── Main trigger ──────────────────────────────────────────────────────────────

/**
 * Find all active-alert buyers whose profile matches this listing above their
 * minScore threshold, then create in-app notifications and send emails.
 *
 * Call this after inserting/updating a UnitType. Fire-and-forget — never throws.
 */
export async function triggerAlerts(ctx: AlertContext): Promise<void> {
  try {
    await _triggerAlerts(ctx);
  } catch (err) {
    console.error("[ALERTS] triggerAlerts failed:", (err as Error).message);
  }
}

async function _triggerAlerts(ctx: AlertContext): Promise<void> {
  // Fetch all buyers with active alert preferences who have a buyer profile
  const prefs = await prisma.alertPreference.findMany({
    where: { active: true },
    include: {
      buyer: {
        select: {
          id: true,
          email: true,
          locale: true,
          buyerProfile: {
            select: {
              expectedScore: true,
              minAcceptanceScore: true,
              preferences: true,
            },
          },
        },
      },
    },
  });

  const candidate: AomCandidate = {
    id: ctx.unitTypeId,
    title: `${ctx.projectName} — ${ctx.unitLabel}`,
    eil: ctx.eil,
    ail: ctx.ail,
    price: ctx.price,
    location: ctx.projectLocation,
    attributes: ctx.attributes,
  };

  for (const pref of prefs) {
    const bp = pref.buyer.buyerProfile;
    if (!bp) continue;

    // Run Zij match
    const outcome = computeZij(
      { expectedScore: bp.expectedScore, minAcceptanceScore: bp.minAcceptanceScore },
      candidate
    );
    if (!outcome.valid) continue;
    if (outcome.zij < pref.minScore) continue;

    // Hard filters
    let prefs_obj: Record<string, unknown> = {};
    try { prefs_obj = JSON.parse(bp.preferences); } catch { /* skip */ }
    const criteria = {
      minRooms:  typeof prefs_obj.bedrooms === "number" ? prefs_obj.bedrooms : null,
      maxBudget: typeof prefs_obj.budget_max === "number" ? prefs_obj.budget_max : null,
      location:  typeof prefs_obj.location === "string" ? prefs_obj.location : null,
    };
    const { passes } = checkHardFilters(candidate, criteria);
    if (!passes) continue;

    // Build notification title/body
    const locale = (pref.buyer.locale as "he" | "en") ?? "he";
    const { title, body } = buildNotificationText(ctx, outcome.zij, locale);

    // Create in-app notification (skip if an unread one already exists for same buyer+listing+type)
    if (pref.siteAlerts) {
      const existing = await prisma.notification.findFirst({
        where: { buyerId: pref.buyerId, unitTypeId: ctx.unitTypeId, type: ctx.type, readAt: null },
        select: { id: true },
      });
      if (!existing) {
        await prisma.notification.create({
          data: {
            buyerId:    pref.buyerId,
            type:       ctx.type,
            title,
            body,
            unitTypeId: ctx.unitTypeId,
          },
        });
      }
    }

    // Send email immediately only for "immediate" frequency buyers
    if (pref.emailAlerts && pref.frequency === "immediate") {
      await sendAlertEmail({
        to:    pref.buyer.email,
        ctx,
        zij:   outcome.zij,
        locale,
      });
    }
  }
}

// ── Notification text ─────────────────────────────────────────────────────────

function buildNotificationText(
  ctx: AlertContext,
  zij: number,
  locale: "he" | "en"
): { title: string; body: string } {
  const scoreStr = Math.round(zij).toString();
  const price = ctx.price > 0
    ? new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-US", { maximumFractionDigits: 0 }).format(ctx.price) + " ₪"
    : "";

  if (locale === "he") {
    if (ctx.type === "new_listing") {
      return {
        title: `מודעה חדשה: ${ctx.projectName} — ${ctx.unitLabel}`,
        body:  `${ctx.projectLocation}${price ? ` · ${price}` : ""} · ציון התאמה ${scoreStr}`,
      };
    }
    return {
      title: `ירידת מחיר: ${ctx.projectName} — ${ctx.unitLabel}`,
      body:  `המחיר ירד ל-${price} · ציון התאמה ${scoreStr}`,
    };
  } else {
    if (ctx.type === "new_listing") {
      return {
        title: `New listing: ${ctx.projectName} — ${ctx.unitLabel}`,
        body:  `${ctx.projectLocation}${price ? ` · ${price}` : ""} · Match score ${scoreStr}`,
      };
    }
    return {
      title: `Price drop: ${ctx.projectName} — ${ctx.unitLabel}`,
      body:  `Price reduced to ${price} · Match score ${scoreStr}`,
    };
  }
}

// ── Email ─────────────────────────────────────────────────────────────────────

async function sendAlertEmail(opts: {
  to: string;
  ctx: AlertContext;
  zij: number;
  locale: "he" | "en";
}): Promise<void> {
  const { to, ctx, zij, locale } = opts;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://haveniq.co.il";
  const listingUrl = `${appUrl}/aom/${ctx.unitTypeId}`;
  const unsubUrl = `${appUrl}/api/alerts/unsubscribe?buyerId=__TOKEN__`; // placeholder — no token here; handled by profile page

  const scoreStr = Math.round(zij).toString();
  const priceStr = ctx.price > 0
    ? new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-US", { maximumFractionDigits: 0 }).format(ctx.price) + " ₪"
    : "";

  if (locale === "he") {
    const isNew = ctx.type === "new_listing";
    const subject = isNew
      ? `מודעה חדשה שמתאימה לך: ${ctx.projectName} — ${ctx.unitLabel}`
      : `ירידת מחיר: ${ctx.projectName} — ${ctx.unitLabel}`;

    const html = alertEmailHtml({
      locale: "he",
      title:  isNew ? "מודעה חדשה" : "ירידת מחיר",
      body: `
        <p style="margin:0 0 1rem;">נמצאה ${isNew ? "מודעה חדשה" : "ירידת מחיר"} שמתאימה לפרופיל שלכם.</p>
        <table role="presentation" style="width:100%;background:#F5F2EC;border-radius:8px;padding:16px 20px;margin:16px 0;border:1px solid #E4DED3;">
          <tr><td style="padding:6px 0;color:#4E6566;font-size:13px;padding-inline-end:16px;">נכס</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#123F40;">${ctx.projectName} — ${ctx.unitLabel}</td></tr>
          <tr><td style="padding:6px 0;color:#4E6566;font-size:13px;padding-inline-end:16px;">מיקום</td><td style="padding:6px 0;font-size:13px;color:#123F40;">${ctx.projectLocation}</td></tr>
          ${priceStr ? `<tr><td style="padding:6px 0;color:#4E6566;font-size:13px;padding-inline-end:16px;">מחיר</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#123F40;">${priceStr}</td></tr>` : ""}
          ${ctx.previousPrice ? `<tr><td style="padding:6px 0;color:#4E6566;font-size:13px;padding-inline-end:16px;">מחיר קודם</td><td style="padding:6px 0;font-size:13px;color:#9E3434;text-decoration:line-through;">${new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 }).format(ctx.previousPrice)} ₪</td></tr>` : ""}
          <tr><td style="padding:6px 0;color:#4E6566;font-size:13px;padding-inline-end:16px;">ציון התאמה</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#756039;">${scoreStr}</td></tr>
        </table>
        <p style="margin:1rem 0 0;font-size:12px;color:#4E6566;">לביטול ההתראות: <a href="${unsubUrl}" style="color:#4E6566;">לחצו כאן</a></p>
      `,
      ctaLabel: "לצפייה בנכס",
      ctaHref:  listingUrl,
    });

    await sendEmail({ to, subject, text: subject, html });
  } else {
    const isNew = ctx.type === "new_listing";
    const subject = isNew
      ? `New listing matching your profile: ${ctx.projectName} — ${ctx.unitLabel}`
      : `Price drop: ${ctx.projectName} — ${ctx.unitLabel}`;

    const html = alertEmailHtml({
      locale: "en",
      title:  isNew ? "New listing" : "Price drop",
      body: `
        <p style="margin:0 0 1rem;">A ${isNew ? "new listing" : "price drop"} matches your profile.</p>
        <table role="presentation" style="width:100%;background:#F5F2EC;border-radius:8px;padding:16px 20px;margin:16px 0;border:1px solid #E4DED3;">
          <tr><td style="padding:6px 0;color:#4E6566;font-size:13px;padding-inline-end:16px;">Property</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#123F40;">${ctx.projectName} — ${ctx.unitLabel}</td></tr>
          <tr><td style="padding:6px 0;color:#4E6566;font-size:13px;padding-inline-end:16px;">Location</td><td style="padding:6px 0;font-size:13px;color:#123F40;">${ctx.projectLocation}</td></tr>
          ${priceStr ? `<tr><td style="padding:6px 0;color:#4E6566;font-size:13px;padding-inline-end:16px;">Price</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#123F40;">${priceStr}</td></tr>` : ""}
          ${ctx.previousPrice ? `<tr><td style="padding:6px 0;color:#4E6566;font-size:13px;padding-inline-end:16px;">Previous price</td><td style="padding:6px 0;font-size:13px;color:#9E3434;text-decoration:line-through;">${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(ctx.previousPrice)} ₪</td></tr>` : ""}
          <tr><td style="padding:6px 0;color:#4E6566;font-size:13px;padding-inline-end:16px;">Match score</td><td style="padding:6px 0;font-size:13px;font-weight:600;color:#756039;">${scoreStr}</td></tr>
        </table>
        <p style="margin:1rem 0 0;font-size:12px;color:#4E6566;">To unsubscribe: <a href="${unsubUrl}" style="color:#4E6566;">click here</a></p>
      `,
      ctaLabel: "View property",
      ctaHref:  listingUrl,
    });

    await sendEmail({ to, subject, text: subject, html });
  }
}

function alertEmailHtml(opts: {
  locale: "he" | "en";
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
}): string {
  const dir = opts.locale === "he" ? "rtl" : "ltr";
  const align = opts.locale === "he" ? "right" : "left";
  const BG = "#F5F2EC"; const SURFACE = "#FBFAF7"; const INK = "#123F40"; const BORDER = "#E4DED3"; const ACCENT = "#B38B4D";
  return `<!DOCTYPE html>
<html lang="${opts.locale}" dir="${dir}">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Haveniq</title></head>
<body style="margin:0;padding:0;background:${BG};font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" style="max-width:560px;background:${SURFACE};border-radius:12px;border:1px solid ${BORDER};overflow:hidden;">
      <tr><td style="background:${INK};padding:24px 40px;text-align:${align};">
        <span style="font-family:Georgia,serif;font-size:22px;font-weight:400;color:#fff;letter-spacing:0.03em;">Haveniq</span>
        <span style="display:inline-block;width:4px;height:4px;border-radius:50%;background:${ACCENT};margin:0 6px;vertical-align:middle;"></span>
      </td></tr>
      <tr><td style="padding:28px 40px 8px;">
        <h2 style="margin:0 0 1rem;font-size:18px;font-weight:600;color:${INK};text-align:${align};">${opts.title}</h2>
        <div style="color:${INK};font-size:15px;line-height:1.7;text-align:${align};">${opts.body}</div>
      </td></tr>
      <tr><td align="center" style="padding:16px 40px 24px;">
        <a href="${opts.ctaHref}" style="display:inline-block;background:${INK};color:#fff;font-family:Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;padding:13px 32px;border-radius:8px;">${opts.ctaLabel}</a>
      </td></tr>
      <tr><td style="padding:16px 40px 28px;border-top:1px solid ${BORDER};color:#4E6566;font-size:12px;line-height:1.6;text-align:${align};">
        © ${new Date().getFullYear()} Haveniq
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// ── Daily digest ──────────────────────────────────────────────────────────────

/**
 * Send a daily digest email to all "daily" frequency buyers with unread
 * notifications from the past 24 hours.
 * Called by the cron endpoint.
 */
export async function sendDailyDigest(): Promise<{ sent: number }> {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Find daily-frequency buyers with unread notifications since yesterday
  const prefs = await prisma.alertPreference.findMany({
    where: { active: true, frequency: "daily", emailAlerts: true },
    include: {
      buyer: { select: { id: true, email: true, locale: true } },
    },
  });

  let sent = 0;
  for (const pref of prefs) {
    const notifications = await prisma.notification.findMany({
      where: {
        buyerId:  pref.buyerId,
        readAt:   null,
        createdAt: { gte: yesterday },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    if (notifications.length === 0) continue;

    const locale = (pref.buyer.locale as "he" | "en") ?? "he";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://haveniq.co.il";

    const listItems = notifications.map(n =>
      `<li style="margin-bottom:8px;">${n.title}<br/><span style="color:#4E6566;font-size:13px;">${n.body}</span></li>`
    ).join("");

    const isHe = locale === "he";
    const subject = isHe
      ? `${notifications.length} התראות חדשות מ-Haveniq`
      : `${notifications.length} new property alerts from Haveniq`;
    const bodyTitle = isHe ? "ההתראות של היום" : "Today's alerts";
    const ctaLabel = isHe ? "לתוצאות שלי" : "My results";

    const html = alertEmailHtml({
      locale,
      title: bodyTitle,
      body: `<ul style="margin:0;padding-inline-start:1.25rem;line-height:1.7;">${listItems}</ul>`,
      ctaLabel,
      ctaHref: `${appUrl}/results`,
    });

    await sendEmail({ to: pref.buyer.email, subject, text: subject, html });
    sent++;
  }

  return { sent };
}
