/**
 * Buyer leverage-group endpoints.
 *
 * GET  /api/buyer/leverage-groups
 *   Returns leverage groups the authenticated buyer belongs to (as a member),
 *   with a live member count sourced from LeverageGroupMember rows.
 *   Pass ?available=true to return open groups the buyer has NOT yet joined.
 *
 * POST /api/buyer/leverage-groups
 *   Body: { unitTypeId, requestedDiscountPercent, requestedTerms? }
 *   Creates a new leverage-group request and atomically registers the creator
 *   as the first LeverageGroupMember. memberCount is no longer a user input —
 *   the live count is derived from LeverageGroupMember rows.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { createLeverageGroupSchema } from "@/lib/validation/leverage-groups";
import { zodError } from "@/lib/validation";

// Fields included on every group response so the frontend can render it.
const GROUP_INCLUDE = {
  _count: { select: { members: true } },
  unitType: {
    select: {
      unitLabel: true,
      price: true,
      project: { select: { name: true, location: true } },
    },
  },
} as const;

/** Replace the stale memberCount field with the live count from members. */
function enrich<T extends { memberCount: number; _count: { members: number } }>(g: T) {
  return { ...g, memberCount: g._count.members };
}

export async function GET(req: NextRequest) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const available = new URL(req.url).searchParams.get("available") === "true";

  if (available) {
    // Open groups the buyer has NOT joined yet
    const groups = await prisma.leverageGroup.findMany({
      where: {
        status: { in: ["pending", "countered"] },
        unitType: { active: true },
        members: { none: { buyerId: auth.userId } },
      },
      include: GROUP_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ groups: groups.map(enrich) });
  }

  // Groups the buyer is a member of
  const groups = await prisma.leverageGroup.findMany({
    where: { members: { some: { buyerId: auth.userId } } },
    include: GROUP_INCLUDE,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ groups: groups.map(enrich) });
}

export async function POST(req: NextRequest) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsedBody = createLeverageGroupSchema.safeParse(rawBody);
  if (!parsedBody.success) return zodError(parsedBody.error);
  const { unitTypeId, requestedDiscountPercent, requestedTerms = "" } = parsedBody.data;

  // Verify the unit type exists and is active
  const unitType = await prisma.unitType.findUnique({
    where: { id: unitTypeId },
    select: { id: true, sellerId: true, active: true },
  });

  if (!unitType || !unitType.active) {
    return NextResponse.json({ error: "Unit type not found or inactive" }, { status: 404 });
  }
  if (unitType.sellerId === auth.userId) {
    return NextResponse.json(
      { error: "Cannot create a leverage group on your own listing" },
      { status: 400 }
    );
  }

  // Prevent creating a second open request from the same buyer on the same unit
  const alreadyMember = await prisma.leverageGroupMember.findFirst({
    where: {
      buyerId: auth.userId,
      leverageGroup: {
        unitTypeId,
        status: { in: ["pending", "countered"] },
      },
    },
  });
  if (alreadyMember) {
    return NextResponse.json(
      { error: "You are already in an active leverage group for this listing" },
      { status: 409 }
    );
  }

  // Atomically create the group and add the creator as the first member.
  // memberCount is left at its default (0) — all reads use _count.members.
  const [group] = await prisma.$transaction([
    prisma.leverageGroup.create({
      data: {
        unitTypeId,
        developerId: unitType.sellerId,
        buyerId: auth.userId,
        requestedDiscountPercent,
        requestedTerms,
        status: "pending",
      },
    }),
  ]);

  await prisma.leverageGroupMember.create({
    data: { leverageGroupId: group.id, buyerId: auth.userId },
  });

  return NextResponse.json({ group }, { status: 201 });
}
