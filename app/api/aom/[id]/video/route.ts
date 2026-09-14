/**
 * GET /api/aom/[id]/video — public endpoint to fetch the project teaser video
 * for a given unit type id.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const project = await prisma.project.findFirst({
      where: { unitTypes: { some: { id, active: true } } },
      select: { teaserVideoData: true },
    });
    return NextResponse.json({ videoData: project?.teaserVideoData ?? null });
  } catch (err) {
    console.error("[aom/[id]/video GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
