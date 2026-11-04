/**
 * POST /api/dev/admin/users/[id]/reset-interview-quota
 *
 * Stamps quotaResetAt = now() on the buyer so that the rolling window for
 * rate-limiting is measured from this moment onward.  Interview history is
 * preserved — no records are deleted.  Admin only. Buyers only.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

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

  const resetAt = new Date();
  await prisma.user.update({
    where: { id },
    data: { quotaResetAt: resetAt },
  });

  return NextResponse.json({ resetAt: resetAt.toISOString() });
}
