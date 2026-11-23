/**
 * /api/auth/session
 *   POST   — turn a valid Bearer JWT into the httpOnly session cookie. Used once to migrate browsers that still hold
 *            the token in localStorage from before cookies were introduced.
 *   DELETE — sign out: clear the cookie.
 */
import { NextRequest, NextResponse } from "next/server";
import { extractToken } from "@/lib/auth";
import { clearSessionCookie, setSessionCookie } from "@/lib/session";

export async function POST(req: NextRequest) {
  const header = req.headers.get("Authorization");
  const auth = extractToken(header);
  if (!auth || !header) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, header.slice(7));
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
