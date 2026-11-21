/**
 * PATCH /api/dev/buildings/[id]
 * Body: { name?, floorCount?, unitsPerFloor? }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { z } from "zod";
import { zodError } from "@/lib/validation";
import { syncStageToBuildings } from "@/lib/stageServer";

const schema = z.object({
  name: z.string().min(1).optional(),
  floorCount: z.number().int().positive().optional(),
  unitsPerFloor: z.number().int().positive().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "developer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const building = await prisma.building.findFirst({
    where: { id, project: { developerId: auth.userId } },
  });
  if (!building) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return zodError(parsed.error);
  const { name, floorCount, unitsPerFloor } = parsed.data;

  // shrinking below existing apartments would leave them outside the building (and on the buyer's screen)
  if (floorCount != null || unitsPerFloor != null) {
    const outside = await prisma.unit.count({
      where: { buildingId: id, OR: [
        ...(floorCount != null ? [{ floor: { gt: floorCount } }] : []),
        ...(unitsPerFloor != null ? [{ positionIndex: { gte: unitsPerFloor } }] : []),
      ] },
    });
    if (outside > 0) {
      return NextResponse.json({
        error: `${outside} apartments are outside the new size. Remove them in the apartment placement table first.`,
        errorHe: `יש ${outside} דירות מחוץ לגודל החדש. הסירו אותן קודם בטבלת שיבוץ הדירות (דף תמונת הבניין והכיול).`,
      }, { status: 409 });
    }
  }

  try {
    const updated = await prisma.building.update({
      where: { id },
      data: {
        ...(name != null && { name: name.trim() }),
        ...(floorCount != null && { floorCount }),
        ...(unitsPerFloor != null && { unitsPerFloor }),
      },
    });
    const siblings = await prisma.building.findMany({ where: { projectId: updated.projectId }, orderBy: { sortIndex: "asc" }, select: { id: true, name: true, floorCount: true, unitsPerFloor: true } });
    await syncStageToBuildings(updated.projectId, siblings);
    return NextResponse.json({ building: updated });
  } catch (err) {
    if (isUniqueConflict(err)) {
      return NextResponse.json({ error: "A building with this name already exists" }, { status: 409 });
    }
    throw err;
  }
}

function isUniqueConflict(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2002";
}
