import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { rateLimit } from "@/lib/rateLimit";
import { STATUSES } from "@/lib/studio/catalog/admin";
import { applyAction, auditAll, catalogWritable } from "@/lib/studio/catalog/adminFs";

export const dynamic = "force-dynamic";
const ACTIONS = ["submit", "publish", "retire", "reopen", "return"] as const;

/** GET: audit of every catalog manifest (admin only). */
export async function GET(req: NextRequest) {
  const guard = requireAdmin(req);
  if (!guard.ok) return guard.response;
  return NextResponse.json({ ...auditAll(), writable: catalogWritable(), statuses: STATUSES });
}

/**
 * POST { type, id, version, action }: lifecycle change on a manifest file (admin only, dev machines only).
 * Publishing still requires `npm run studio:publish`, whose gates decide what enters the index.
 */
export async function POST(req: NextRequest) {
  const guard = requireAdmin(req);
  if (!guard.ok) return guard.response;
  const limited = rateLimit(req, "studio-catalog-admin", 30, 60_000);
  if (limited) return limited;
  const b = (await req.json().catch(() => null)) as { type?: string; id?: string; version?: number; action?: string } | null;
  if (!b || (b.type !== "model" && b.type !== "material") || typeof b.id !== "string" || !Number.isInteger(b.version) || !ACTIONS.includes(b.action as never)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const r = applyAction(b.type, b.id, b.version!, b.action as (typeof ACTIONS)[number]);
  return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: 409 });
}
