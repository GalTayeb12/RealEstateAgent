/**
 * POST /api/dev/admin/users/[id]/reset-interview-quota
 *
 * Deletes the buyer's interview attempts from the rolling 24-hour window
 * so they can start again. Admin only. Buyers only.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

const WINDOW_MS = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAdmin(req);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.role !== "buyer") {
    return NextResponse.json(
      { error: "Interview quota applies to buyer accounts only" },
      { status: 400 }
    );
  }

  const since = new Date(Date.now() - WINDOW_MS);
  const deleted = await prisma.interviewAttempt.deleteMany({
    where: { userId: id, startedAt: { gte: since } },
  });

  return NextResponse.json({ deleted: deleted.count });
}
