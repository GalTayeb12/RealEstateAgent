/**
 * GET /api/dev/admin/leverage-groups — all leverage groups with live member count
 *
 * Used by the admin dashboard to monitor buying interest and decide when to
 * approach a developer for group negotiations.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  const guard = requireAdmin(req);
  if (!guard.ok) return guard.response;

  const groups = await prisma.leverageGroup.findMany({
    include: {
      _count: { select: { members: true } },
      unitType: {
        select: {
          unitLabel: true,
          price: true,
          project: { select: { name: true, location: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const enriched = groups.map(g => ({
    ...g,
    memberCount: g._count.members,
  }));

  return NextResponse.json({ groups: enriched });
}
