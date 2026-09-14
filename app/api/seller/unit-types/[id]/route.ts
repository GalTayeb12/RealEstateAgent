/**
 * GET    /api/seller/unit-types/[id]  — fetch a unit type (owner only)
 * PUT    /api/seller/unit-types/[id]  — update a unit type
 * DELETE /api/seller/unit-types/[id]  — deactivate a unit type
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { updateUnitTypeSchema } from "@/lib/validation/properties";
import { zodError } from "@/lib/validation";

async function getOwnedUnitType(unitTypeId: string, userId: string) {
  return prisma.unitType.findFirst({ where: { id: unitTypeId, sellerId: userId } });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "seller") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const unitType = await prisma.unitType.findFirst({
    where: { id, sellerId: auth.userId },
    include: {
      project: { select: { id: true, name: true, location: true, description: true } },
      images: { orderBy: [{ type: "asc" }, { order: "asc" }] },
    },
  });
  if (!unitType) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ unitType });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "seller") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await getOwnedUnitType(id, auth.userId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsedBody = updateUnitTypeSchema.safeParse(body);
  if (!parsedBody.success) return zodError(parsedBody.error);
  const { unitLabel, price, quantityTotal, quantityAvailable, description, eil, ail, attributes, aomStatus } = parsedBody.data;

  const updated = await prisma.unitType.update({
    where: { id },
    data: {
      ...(unitLabel != null && { unitLabel }),
      ...(price != null && { price: Number(price) }),
      ...(quantityTotal != null && { quantityTotal: Number(quantityTotal) }),
      ...(quantityAvailable != null && { quantityAvailable: Number(quantityAvailable) }),
      ...(description != null && { description }),
      ...(eil != null && { eil: Number(eil) }),
      ...(ail != null && { ail: Number(ail) }),
      ...(attributes != null && { attributes: JSON.stringify(attributes) }),
      ...(aomStatus != null && {
        aomStatus,
        active: aomStatus !== "sold",
      }),
    },
  });

  return NextResponse.json({ unitType: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "seller") {
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
