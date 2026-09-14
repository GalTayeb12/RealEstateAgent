/**
 * lib/google.ts — Google OAuth2 + Calendar helpers
 *
 * Uses the official `googleapis` package with an OAuth2 client.
 * Tokens are never logged — the `on("tokens", ...)` handler persists refreshed
 * tokens back to the DB without printing them.
 *
 * Required env vars (see .env.example):
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REDIRECT_URI  (defaults to http://localhost:3000/api/auth/google/callback)
 */

import { google } from "googleapis";
import { prisma } from "@/lib/prisma";

const REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ??
  "http://localhost:3000/api/auth/google/callback";

export function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  );
}

/**
 * Generates the Google OAuth consent-screen URL.
 * `access_type=offline` + `prompt=consent` ensures we always receive a
 * refresh_token (not just an access_token).
 *
 * @param userId — stored as OAuth state so the callback knows which dev to update
 */
export function getGoogleAuthUrl(userId: string): string {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar.events"],
    state: userId,
  });
}

/**
 * Exchanges an authorization code for tokens and persists them on the
 * developer's profile. Marks googleConnected = true.
 *
 * Never logs token values — only their presence.
 */
export async function exchangeCodeAndSaveTokens(
  code: string,
  userId: string
): Promise<void> {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);

  await prisma.developerProfile.update({
    where: { userId },
    data: {
      googleAccessToken: tokens.access_token ?? undefined,
      googleRefreshToken: tokens.refresh_token ?? undefined,
      googleTokenExpiry: tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : null,
      googleConnected: true,
    },
  });
}

export interface ScheduleMeetingOptions {
  developerUserId: string;
  offerId: string;
  projectName: string;
  unitLabel: string;
  developerEmail: string;
  buyerEmail: string;
  /** Optional last two offer prices for description (buyer price, dev counter) */
  priceSummary?: string;
  /** The chosen start time (UTC Date). Defaults to tomorrow 10:00 UTC if omitted. */
  startDateTime?: Date;
  /** IANA timezone string from the developer's browser, e.g. "Asia/Jerusalem" */
  timezone?: string;
}

/**
 * Creates a Google Calendar event with a Meet conference link and returns the
 * Meet URL. Also handles automatic access-token refresh and persists any new
 * tokens back to the DB.
 *
 * Default meeting time: tomorrow at 10:00 UTC, 30 minutes.
 *
 * Throws on failure — callers should catch and surface a user-friendly error.
 */
export async function scheduleMeeting(
  opts: ScheduleMeetingOptions
): Promise<string> {
  const profile = await prisma.developerProfile.findUnique({
    where: { userId: opts.developerUserId },
    select: {
      googleAccessToken: true,
      googleRefreshToken: true,
      googleTokenExpiry: true,
      googleConnected: true,
    },
  });

  if (!profile?.googleConnected || !profile.googleRefreshToken) {
    throw new Error("Google account not connected");
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: profile.googleAccessToken ?? undefined,
    refresh_token: profile.googleRefreshToken,
    expiry_date: profile.googleTokenExpiry
      ? profile.googleTokenExpiry.getTime()
      : undefined,
  });

  // Persist refreshed tokens back to DB without logging their values
  oauth2Client.on("tokens", async (newTokens) => {
    try {
      await prisma.developerProfile.update({
        where: { userId: opts.developerUserId },
        data: {
          ...(newTokens.access_token
            ? { googleAccessToken: newTokens.access_token }
            : {}),
          ...(newTokens.refresh_token
            ? { googleRefreshToken: newTokens.refresh_token }
            : {}),
          googleTokenExpiry: newTokens.expiry_date
            ? new Date(newTokens.expiry_date)
            : null,
        },
      });
    } catch (err) {
      console.error("[GOOGLE] Failed to persist refreshed tokens:", (err as Error).message);
    }
  });

  // Use provided start time or fall back to tomorrow at 10:00 UTC
  const start = opts.startDateTime ?? (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setUTCHours(10, 0, 0, 0);
    return d;
  })();
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const eventTimezone = opts.timezone ?? "UTC";

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const res = await calendar.events.insert({
    calendarId: "primary",
    conferenceDataVersion: 1,
    requestBody: {
      summary: `Negotiation — ${opts.projectName} ${opts.unitLabel}`,
      description:
        `Scheduled via Haveniq to discuss the deal for ` +
        `${opts.projectName} (${opts.unitLabel}).` +
        (opts.priceSummary ? `\n\nOffer summary: ${opts.priceSummary}` : ""),
      attendees: [
        { email: opts.developerEmail },
        { email: opts.buyerEmail },
      ],
      start: { dateTime: start.toISOString(), timeZone: eventTimezone },
      end: { dateTime: end.toISOString(), timeZone: eventTimezone },
      conferenceData: {
        createRequest: {
          requestId: `aom-${opts.offerId}-${Date.now()}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    },
  });

  const meetLink = res.data.conferenceData?.entryPoints?.find(
    (e) => e.entryPointType === "video"
  )?.uri;

  if (!meetLink) {
    throw new Error(
      "Google Calendar returned an event but no Meet link was generated. " +
        "Make sure Google Meet is enabled for this Google Workspace or personal account."
    );
  }

  return meetLink;
}
