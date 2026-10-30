/**
 * GET /api/buildings/unit/[unitId]
 * Returns full unit details for the 3D explorer unit card panel.
 * Public — no auth required (statuses are already public on the AOM page).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ unitId: string }> },
) {
  const { unitId } = await params;

  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: {
      id: true,
      unitNumber: true,
      floor: true,
      positionIndex: true,
      status: true,
      price: true,
      unitTypeId: true,
      buildingId: true,
      building: {
        select: { id: true, name: true, floorCount: true },
      },
      unitType: {
        select: {
          unitLabel: true,
          price: true,
          attributes: true,
          floor_plan_url: true,
          images: {
            select: { type: true },
          },
        },
      },
    },
  });

  if (!unit) return NextResponse.json({ error: "Unit not found" }, { status: 404 });

  const imageCounts = unit.unitType.images.reduce(
    (acc, img) => {
      if (img.type === "gallery") acc.gallery++;
      else if (img.type === "panorama") acc.panorama++;
      return acc;
    },
    { gallery: 0, panorama: 0 },
  );

  let attributes: Record<string, unknown> = {};
  try { attributes = JSON.parse(unit.unitType.attributes); } catch { /* ignore */ }

  return NextResponse.json({
    unit: {
      id: unit.id,
      unitNumber: unit.unitNumber,
      floor: unit.floor,
      positionIndex: unit.positionIndex,
      status: unit.status,
      price: unit.price,              // per-unit override (nullable)
      listPrice: unit.unitType.price, // unitType base price
      unitTypeId: unit.unitTypeId,
      buildingId: unit.buildingId,
      building: unit.building,
      unitType: {
        unitLabel: unit.unitType.unitLabel,
        attributes,
        floorPlanUrl: unit.unitType.floor_plan_url ?? null,
        galleryCount: imageCounts.gallery,
        panoramaCount: imageCounts.panorama,
      },
    },
  });
}
