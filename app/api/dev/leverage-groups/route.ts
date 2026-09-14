/**
 * GET /api/dev/leverage-groups
 * Returns all leverage groups on the developer's unit types.
 * memberCount is replaced with the live count from LeverageGroupMember rows.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "developer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const groups = await prisma.leverageGroup.findMany({
    where: { developerId: auth.userId },
    include: {
      _count: { select: { members: true } },
      unitType: {
        select: {
          unitLabel: true,
          project: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Override the stale memberCount field with the live count.
  const enriched = groups.map(g => ({ ...g, memberCount: g._count.members }));

  return NextResponse.json({ groups: enriched });
}
