/**
 * POST /api/buyer/leverage-groups/[id]/join
 *
 * Adds the authenticated buyer to an existing leverage group as a member.
 *
 * Guards:
 *  - Group must be in pending or countered status (cannot join a closed group).
 *  - Buyer must not already be a member (@@unique constraint; returns 409 on duplicate).
 *
 * Returns the updated live member count on success.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const group = await prisma.leverageGroup.findUnique({
    where: { id },
    select: { id: true, status: true, unitTypeId: true },
  });

  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (group.status === "accepted" || group.status === "rejected") {
    return NextResponse.json(
      { error: `Cannot join a group that has already been ${group.status}` },
      { status: 409 }
    );
  }

  // Check for an existing open group the buyer already belongs to on this unit
  const existingOnUnit = await prisma.leverageGroupMember.findFirst({
    where: {
      buyerId: auth.userId,
      leverageGroup: {
        unitTypeId: group.unitTypeId,
        status: { in: ["pending", "countered"] },
        id: { not: id }, // a different group on the same unit
      },
    },
  });
  if (existingOnUnit) {
    return NextResponse.json(
      { error: "You are already in another active leverage group for this listing" },
      { status: 409 }
    );
  }

  try {
    await prisma.leverageGroupMember.create({
      data: { leverageGroupId: id, buyerId: auth.userId },
    });
  } catch (err: unknown) {
    // Unique constraint violation — buyer already in this group
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "You are already a member of this group" }, { status: 409 });
    }
    throw err;
  }

  const memberCount = await prisma.leverageGroupMember.count({
    where: { leverageGroupId: id },
  });

  return NextResponse.json({ memberCount }, { status: 201 });
}
