/**
 * Centralised admin auth guard for all routes under /api/dev/admin/*.
 *
 * Usage in a route handler:
 *
 *   const guard = requireAdmin(req);
 *   if (!guard.ok) return guard.response;
 *   // guard.auth is now the verified JwtPayload with role === "admin"
 *
 * Distinguishes:
 *   401 — no Authorization header, or header present but token invalid/expired
 *   403 — valid token, but role is not "admin"
 *
 * Both responses include a descriptive JSON error body so callers can display
 * a meaningful message (avoids the "Failed" with no explanation bug pattern).
 */
import { NextRequest, NextResponse } from "next/server";
import { extractToken, JwtPayload } from "@/lib/auth";

type AdminGuardOk = { ok: true; auth: JwtPayload };
type AdminGuardDenied = { ok: false; response: NextResponse };
export type AdminGuard = AdminGuardOk | AdminGuardDenied;

export function requireAdmin(req: NextRequest): AdminGuard {
  const auth = extractToken(req.headers.get("Authorization"));

  if (!auth) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unauthorized — a valid auth token is required to access this resource" },
        { status: 401 }
      ),
    };
  }

  if (auth.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden — this endpoint requires the admin role" },
        { status: 403 }
      ),
    };
  }

  return { ok: true, auth };
}
