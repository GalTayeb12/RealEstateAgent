/**
 * GET /api/aom/[id] — single active unit type with images, public
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const [unit, projectVideoRow] = await Promise.all([
      prisma.unitType.findFirst({
        where: { id, active: true },
        include: {
          seller: { select: { id: true, email: true } },
          project: {
            select: {
              id: true,
              name: true,
              location: true,
              unitTypes: {
                where: { active: true },
                select: { id: true, unitLabel: true, ownerType: true },
                orderBy: { createdAt: "asc" },
              },
            },
          },
          images: { orderBy: [{ type: "asc" }, { order: "asc" }] },
        },
      }),
      prisma.project.findFirst({
        where: { unitTypes: { some: { id } } },
        select: { teaserVideoData: true },
      }),
    ]);

    if (!unit) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      unit: {
        ...unit,
        ownerType: unit.ownerType,
        hasTeaserVideo: !!projectVideoRow?.teaserVideoData,
      },
    });
  } catch (err) {
    console.error("[aom/[id] GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
