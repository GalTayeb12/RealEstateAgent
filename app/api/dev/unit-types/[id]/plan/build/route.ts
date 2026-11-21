/**
 * POST /api/dev/unit-types/[id]/plan/build  { preview?: boolean }
 * Re-queues the walkthrough build of the approved plan (after a failure, or to
 * rebuild at full quality after a preview). Refused while the plan is not
 * approved or a build of it is already queued or running.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PlanInputError } from "@/lib/planReview";
import { authorizePlanOwner, planErrorResponse } from "@/lib/planReviewServer";
import { getStorage } from "@/lib/storage";
import { isRedundantPreview, queueBuild, readBuildJob, toBuildView } from "@/lib/twin/buildJobs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await authorizePlanOwner(req, id);
  if ("response" in a) return a.response;
  try {
    const rec = await prisma.planTwinRecord.findUnique({ where: { unitTypeId: id } });
    if (!rec || rec.status !== "approved" || !rec.approvedAt) {
      throw new PlanInputError(409, "צריך לאשר את התוכנית לפני הבנייה", "Approve the plan before building it");
    }
    const storage = getStorage();
    const current = await readBuildJob(storage, id);
    if (current && (current.status === "queued" || current.status === "running") && current.approvedAt === rec.approvedAt.toISOString()) {
      throw new PlanInputError(409, "הבנייה כבר בתור", "A build of this plan is already queued or running");
    }
    const body = (await req.json().catch(() => ({}))) as { preview?: unknown };
    if (isRedundantPreview(current, rec.approvedAt.toISOString(), body.preview === true)) {
      throw new PlanInputError(409, "הסיור כבר נבנה במהירות מהתוכנית הזו. לאיכות מלאה בחרו בנייה באיכות מלאה", "This plan was already built in quick mode. Use the full-quality rebuild instead");
    }
    const job = await queueBuild(storage, id, rec.approvedAt, { preview: body.preview === true });
    return NextResponse.json({ build: toBuildView(job, rec.approvedAt) });
  } catch (err) {
    return planErrorResponse(err, "build");
  }
}
