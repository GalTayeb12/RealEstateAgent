/**
 * Deprecated — forwards to /api/dev/unit-types/[id].
 * PUT    /api/dev/aoms/[id]  — update a unit type
 * DELETE /api/dev/aoms/[id]  — deactivate a unit type
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { legacyUpdateAomSchema } from "@/lib/validation/properties";
import { zodError } from "@/lib/validation";

async function getOwnedUnitType(id: string, userId: string) {
  return prisma.unitType.findFirst({ where: { id, sellerId: userId } });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "developer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await getOwnedUnitType(id, auth.userId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rawBody = await req.json();
  const parsedBody = legacyUpdateAomSchema.safeParse(rawBody);
  if (!parsedBody.success) return zodError(parsedBody.error);
  const { title, unitLabel, description, eil, ail, attributes, aomStatus } = parsedBody.data;
  const label = unitLabel ?? title;

  const updated = await prisma.unitType.update({
    where: { id },
    data: {
      ...(label != null && { unitLabel: label }),
      ...(description != null && { description }),
      ...(eil != null && { eil: Number(eil) }),
      ...(ail != null && { ail: Number(ail) }),
      ...(attributes != null && { attributes: JSON.stringify(attributes) }),
      ...(aomStatus != null && { aomStatus, active: aomStatus !== "sold" }),
    },
  });

  return NextResponse.json({ aom: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "developer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await getOwnedUnitType(id, auth.userId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.unitType.update({
    where: { id },
    data: { active: false, aomStatus: "sold" },
  });

  return NextResponse.json({ ok: true });
}
