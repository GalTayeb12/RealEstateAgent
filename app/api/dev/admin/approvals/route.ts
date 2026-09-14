/**
 * GET /api/dev/admin/approvals
 * Returns all developer accounts with their approval status.
 * Requires a valid JWT with role === "admin".
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  const guard = requireAdmin(req);
  if (!guard.ok) return guard.response;

  const profiles = await prisma.developerProfile.findMany({
    include: { user: { select: { id: true, email: true, createdAt: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ profiles });
}
