/**
 * POST /api/dev/admin/research/[id]
 * Manually triggers (or re-triggers) the AI web research for a developer profile.
 * Requires a valid JWT with role === "admin".
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { performAndStoreResearch } from "@/lib/research";

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

    // Run synchronously so the admin can see the result immediately.
    await performAndStoreResearch(profile.userId, profile.companyName, profile.crn);

    const updated = await prisma.developerProfile.findUnique({
      where: { id },
      select: { webResearchSummary: true },
    });

    return NextResponse.json({ webResearchSummary: updated?.webResearchSummary ?? "" });
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[research route] Unhandled error:", detail);
    return NextResponse.json({ error: "Internal server error", detail }, { status: 500 });
  }
}
