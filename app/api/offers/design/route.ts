/** GET /api/offers/design?unitTypeId= — does the signed-in buyer have a saved design to attach to an offer? (metadata only) */
import { NextRequest, NextResponse } from "next/server";
import { extractToken } from "@/lib/auth";
import { latestDesignFor } from "@/lib/studio/offerDesign";
import { studioEnabled } from "@/lib/studio/flags";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const unitTypeId = new URL(req.url).searchParams.get("unitTypeId");
  if (!unitTypeId || !studioEnabled()) return NextResponse.json({ available: false });
  try {
    const d = await latestDesignFor(auth.userId, unitTypeId);
    return NextResponse.json(d ? { available: true, name: d.name, pieces: d.pieces } : { available: false });
  } catch (e) {
    console.error("[offers/design GET]", e);
    return NextResponse.json({ available: false });
  }
}
