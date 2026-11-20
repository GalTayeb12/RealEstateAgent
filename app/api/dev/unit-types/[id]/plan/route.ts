/**
 * Plan twin of a unit type (developer review flow).
 *
 * GET  → { plan: PlanRecordView | null }
 * POST → multipart upload, field "file" (.dxf, ≤ MAX_PLAN_BYTES): parse + validate + save
 * PUT  → { twin }: a corrected twin, re-validated and saved (clears an earlier approval)
 *
 * Only the owning, approved developer may call these.
 */
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";
import { MAX_PLAN_BYTES, PlanInputError, checkPlanFile, parsePlanUpload, planSourceKey, reviewCorrectedTwin, toPlanView } from "@/lib/planReview";
import { authorizePlanOwner, planErrorResponse } from "@/lib/planReviewServer";
import type { PlanTwin } from "@/lib/twin/schema";

const json = (v: unknown) => v as Prisma.InputJsonValue;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const a = await authorizePlanOwner(req, id);
  if ("response" in a) return a.response;
  const rec = await prisma.planTwinRecord.findUnique({ where: { unitTypeId: id } });
  return NextResponse.json({ plan: rec ? toPlanView(rec) : null });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const a = await authorizePlanOwner(req, id);
  if ("response" in a) return a.response;
  try {
    // Reject oversized bodies before buffering them (multipart overhead allowance: 64 KB).
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_PLAN_BYTES + 64 * 1024) checkPlanFile({ name: ".dxf", size: declared });

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new PlanInputError(400, "בקשת העלאה לא תקינה", "Expected a multipart form upload");
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new PlanInputError(400, "לא צורף קובץ", "No file in field \"file\"");
    checkPlanFile(file);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const parsed = parsePlanUpload(bytes, file.name);
    const key = planSourceKey(id, file.name);
    await getStorage().put(key, bytes, { contentType: "application/dxf" });

    const data = {
      sourceKey: key, sourceName: file.name, sourceKind: "dxf",
      twin: json(parsed.twin), report: json(parsed.report), notes: parsed.notes,
      status: parsed.status, approvedAt: null,
    };
    const rec = await prisma.planTwinRecord.upsert({
      where: { unitTypeId: id },
      create: { unitTypeId: id, ...data },
      update: data,
    });
    return NextResponse.json({ plan: toPlanView(rec) }, { status: 201 });
  } catch (err) {
    return planErrorResponse(err, "upload");
  }
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const a = await authorizePlanOwner(req, id);
  if ("response" in a) return a.response;
  try {
    const rec = await prisma.planTwinRecord.findUnique({ where: { unitTypeId: id } });
    if (!rec) throw new PlanInputError(404, "עדיין לא הועלתה תוכנית", "No plan uploaded yet");
    let body: { twin?: unknown };
    try {
      body = await req.json();
    } catch {
      throw new PlanInputError(400, "גוף הבקשה אינו JSON", "Body must be JSON");
    }
    const { twin, report, status } = reviewCorrectedTwin(body.twin, rec.twin as unknown as PlanTwin);
    const saved = await prisma.planTwinRecord.update({
      where: { unitTypeId: id },
      data: { twin: json(twin), report: json(report), status, approvedAt: null },
    });
    return NextResponse.json({ plan: toPlanView(saved) });
  } catch (err) {
    return planErrorResponse(err, "update");
  }
}
