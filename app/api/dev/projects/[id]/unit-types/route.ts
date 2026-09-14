/**
 * POST /api/dev/projects/[id]/unit-types — add a unit type to a project
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { createUnitTypeSchema } from "@/lib/validation/properties";
import { zodError } from "@/lib/validation";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "developer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const project = await prisma.project.findFirst({ where: { id: projectId, developerId: auth.userId } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const body = await req.json();
  const parsedBody = createUnitTypeSchema.safeParse(body);
  if (!parsedBody.success) return zodError(parsedBody.error);
  const { unitLabel, price, quantityTotal, quantityAvailable, description, eil, ail, attributes = {} } = parsedBody.data;

  const unitType = await prisma.unitType.create({
    data: {
      projectId,
      sellerId: auth.userId,
      unitLabel: unitLabel.trim(),
      price: price ?? 0,
      quantityTotal: quantityTotal ?? 1,
      quantityAvailable: quantityAvailable ?? quantityTotal ?? 1,
      description: description ?? "",
      eil,
      ail,
      attributes: JSON.stringify(attributes),
    },
  });

  return NextResponse.json({ unitType }, { status: 201 });
}
