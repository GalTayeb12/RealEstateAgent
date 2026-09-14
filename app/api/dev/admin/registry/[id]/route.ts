/**
 * POST /api/dev/admin/registry/[id]
 * Manually triggers (or re-triggers) the companies registry lookup for a developer profile.
 * Requires a valid JWT with role === "admin".
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { lookupCompanyByCRN } from "@/lib/registry";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = requireAdmin(req);
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;

    const profile = await prisma.developerProfile.findUnique({
      where: { id },
      select: { userId: true, companyName: true, crn: true },
    });

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const result = await lookupCompanyByCRN(profile.crn, profile.companyName);

    await prisma.developerProfile.update({
      where: { id },
      data: { registryLookupResult: JSON.stringify(result) },
    });

    return NextResponse.json({ registryLookupResult: JSON.stringify(result) });
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[registry route] Unhandled error:", detail);
    return NextResponse.json({ error: "Internal server error", detail }, { status: 500 });
  }
}
