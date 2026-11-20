/**
 * GET /api/dev/unit-types/[id]/plan/source — download the uploaded plan file (owner only).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";
import { authorizePlanOwner } from "@/lib/planReviewServer";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await authorizePlanOwner(req, id);
  if ("response" in a) return a.response;
  const rec = await prisma.planTwinRecord.findUnique({ where: { unitTypeId: id }, select: { sourceKey: true, sourceName: true } });
  const bytes = rec ? await getStorage().get(rec.sourceKey) : null;
  if (!rec || !bytes) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/dxf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(rec.sourceName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
