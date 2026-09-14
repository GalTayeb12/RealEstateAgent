/**
 * GET /api/auth/google/callback
 *
 * Google redirects here after the user grants (or denies) consent.
 * Query params: code, state (= userId), scope, error (if denied)
 *
 * On success:  exchanges code for tokens, persists them, redirects to /dev/pending.
 * On failure:  redirects back to /dev/register?google_error=<reason> so the
 *              developer sees a clear message and can continue without Google.
 */

import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeAndSaveTokens } from "@/lib/google";

const BASE_URL =
  process.env.GOOGLE_REDIRECT_URI?.replace("/api/auth/google/callback", "") ??
  "http://localhost:3000";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const userId = searchParams.get("state");
  const error = searchParams.get("error");

  // User denied consent or something went wrong on Google's side
  if (error || !code || !userId) {
    const reason = error === "access_denied"
      ? "Google consent was declined. You can connect later from your dashboard."
      : "Google sign-in failed. You can connect later from your dashboard.";
    return NextResponse.redirect(
      `${BASE_URL}/dev/pending?google_error=${encodeURIComponent(reason)}`
    );
  }

  try {
    await exchangeCodeAndSaveTokens(code, userId);
    // Redirect to /dev/pending with a success hint (optional — pending page can show it)
    return NextResponse.redirect(
      `${BASE_URL}/dev/pending?google_connected=1`
    );
  } catch (err) {
    console.error("[google/callback] Token exchange failed:", (err as Error).message);
    return NextResponse.redirect(
      `${BASE_URL}/dev/pending?google_error=${encodeURIComponent("Google connection failed. You can try again from your dashboard.")}`
    );
  }
}
