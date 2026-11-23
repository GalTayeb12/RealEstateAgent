/**
 * Proxy (Next 16 name for middleware) for /api requests.
 *
 * 1. Session cookie → Authorization header. The JWT is stored in an httpOnly cookie (lib/session.ts); route handlers
 *    read `Authorization: Bearer <jwt>`, so we add it here. When the cookie is present it wins over any header the page
 *    sent (the page only holds a marker, not a token). Without a cookie the request is untouched, so API clients that
 *    send their own Bearer token keep working.
 * 2. CSRF. Cookie-authenticated requests that change state must come from this site: if an Origin header is present
 *    and does not match the Host, the request is rejected. (SameSite=Lax on the cookie already blocks most cases.)
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function proxy(req: NextRequest) {
  const jwt = req.cookies.get("hq_session")?.value;
  if (!jwt) return NextResponse.next();

  if (!SAFE_METHODS.has(req.method)) {
    const origin = req.headers.get("origin");
    if (origin) {
      let host = "";
      try { host = new URL(origin).host; } catch { /* malformed */ }
      if (host !== req.headers.get("host")) {
        return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
      }
    }
  }

  const headers = new Headers(req.headers);
  headers.set("authorization", `Bearer ${jwt}`);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/api/:path*"] };
