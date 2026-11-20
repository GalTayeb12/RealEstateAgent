/**
 * POST /api/dev/unit-types/[id]/plan/approve
 * Approves the stored plan twin. Re-validates on the server: refused while it has errors.
 * An approval queues the walkthrough build (lib/twin/buildJobs.ts, run by
 * scripts/twin/build-worker.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { PlanInputError, canApprove, toPlanView } from "@/lib/planReview";
import { authorizePlanOwner, planErrorResponse } from "@/lib/planReviewServer";
import { validateTwin } from "@/lib/twin/validate";
import { getStorage } from "@/lib/storage";
import { queueBuild, toBuildView } from "@/lib/twin/buildJobs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await authorizePlanOwner(req, id);
  if ("response" in a) return a.response;
  try {
    const rec = await prisma.planTwinRecord.findUnique({ where: { unitTypeId: id } });
    if (!rec) throw new PlanInputError(404, "עדיין לא הועלתה תוכנית", "No plan uploaded yet");
    const report = validateTwin(rec.twin);
    if (!canApprove(report)) {
      await prisma.planTwinRecord.update({
        where: { unitTypeId: id },
        data: { report: report as unknown as Prisma.InputJsonValue, status: "needs_review", approvedAt: null },
      });
      throw new PlanInputError(409, "אי אפשר לאשר תוכנית עם שגיאות", "A plan with errors cannot be approved");
    }
    const saved = await prisma.planTwinRecord.update({
      where: { unitTypeId: id },
      data: { report: report as unknown as Prisma.InputJsonValue, status: "approved", approvedAt: new Date() },
    });
    const job = await queueBuild(getStorage(), id, saved.approvedAt!);
    return NextResponse.json({ plan: toPlanView(saved), build: toBuildView(job, saved.approvedAt) });
  } catch (err) {
    return planErrorResponse(err, "approve");
  }
}
