/**
 * GET /api/dev/admin/stats — platform-wide aggregate counts
 *
 * Returns: { users, buyers, developers, offers, activeGroups, activeUnits }
 * Used by the admin dashboard stats cards.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  const guard = requireAdmin(req);
  if (!guard.ok) return guard.response;

  const [
    totalUsers,
    buyers,
    developers,
    totalOffers,
    pendingOffers,
    activeGroups,
    activeUnits,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "buyer" } }),
    prisma.user.count({ where: { role: "developer" } }),
    prisma.offer.count(),
    prisma.offer.count({ where: { status: { in: ["pending", "countered"] } } }),
    prisma.leverageGroup.count({ where: { status: { in: ["pending", "countered"] } } }),
    prisma.unitType.count({ where: { active: true } }),
  ]);

  return NextResponse.json({
    totalUsers,
    buyers,
    developers,
    totalOffers,
    pendingOffers,
    activeGroups,
    activeUnits,
  });
}
