/**
 * Browser session cookie.
 *
 * The signed JWT lives only in an httpOnly cookie, so page scripts (and therefore any XSS) cannot read it.
 * `proxy.ts` copies the cookie into the Authorization header for /api requests, so route handlers keep using
 * `extractToken(req.headers.get("Authorization"))` unchanged. Non-browser clients can still send a Bearer token.
 *
 * Client code keeps a non-secret marker in localStorage (`SESSION_MARKER`) only to know "someone is signed in".
 */
import type { NextResponse } from "next/server";

export const SESSION_COOKIE = "hq_session";
/** Stored in localStorage["token"] instead of the JWT. Not a credential. */
export const SESSION_MARKER = "session";
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // matches the 7d JWT expiry in lib/auth.ts

export function setSessionCookie(res: NextResponse, jwt: string): void {
  res.cookies.set(SESSION_COOKIE, jwt, {
    httpOnly: true,
    sameSite: "lax", // not sent on cross-site POSTs: first line of CSRF defence (proxy.ts adds an Origin check)
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
}
