import { NextRequest, NextResponse } from "next/server";
import { extractToken } from "@/lib/auth";
import { requireAdmin } from "@/lib/adminAuth";

/** Server-side gate for the design-system preview. Does not trust a client-decoded role. */
export async function GET(req: NextRequest) {
  const guard = requireAdmin(req);
  if (guard.ok) return NextResponse.json({ ok: true });

  const auth = extractToken(req.headers.get("Authorization"));
  if (auth && auth.role !== "admin") {
    return NextResponse.json({ error: "Forbidden", role: auth.role }, { status: 403 });
  }
  return guard.response;
}
