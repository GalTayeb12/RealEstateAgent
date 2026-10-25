/**
 * PATCH /api/dev/buildings/[id]
 * Body: { name?, floorCount?, unitsPerFloor? }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { z } from "zod";
import { zodError } from "@/lib/validation";

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

  try {
    const updated = await prisma.building.update({
      where: { id },
      data: {
        ...(name != null && { name: name.trim() }),
        ...(floorCount != null && { floorCount }),
        ...(unitsPerFloor != null && { unitsPerFloor }),
      },
    });
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
