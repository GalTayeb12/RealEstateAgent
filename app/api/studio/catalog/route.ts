/**
 * GET /api/studio/catalog -> the latest published catalog release (models, materials, retired keys).
 * Studio flag only: shared view links (no login) load the catalog too, and it holds nothing private.
 */
import { NextResponse } from "next/server";
import { studioEnabled } from "@/lib/studio/flags";
import { currentCatalog } from "@/lib/studio/catalog/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!studioEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const c = await currentCatalog();
  return NextResponse.json({ schema: 2, ...c }, { headers: { "Cache-Control": "no-store" } });
}
