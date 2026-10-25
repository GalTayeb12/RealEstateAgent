/**
 * GET /api/aom/[id] — single active unit type with images, public
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listingAsk } from "@/lib/listingPrice";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const [unit, projectVideoRow] = await Promise.all([
      prisma.unitType.findFirst({
        where: { id, active: true },
        include: {
          seller: { select: { id: true, email: true } },
          project: {
            select: {
              id: true,
              name: true,
              location: true,
              unitTypes: {
                where: { active: true },
                select: { id: true, unitLabel: true, ownerType: true },
                orderBy: { createdAt: "asc" },
              },
              buildings: {
                orderBy: { sortIndex: "asc" },
                select: {
                  id: true,
                  name: true,
                  floorCount: true,
                  unitsPerFloor: true,
                  sortIndex: true,
                  modelUrl: true,
                  units: {
                    orderBy: [{ floor: "asc" }, { positionIndex: "asc" }],
                    select: {
                      id: true,
                      floor: true,
                      unitNumber: true,
                      positionIndex: true,
                      status: true,
                      price: true,
                      unitTypeId: true,
                      unitType: { select: { unitLabel: true, price: true } },
                    },
                  },
                },
              },
            },
          },
          images: { orderBy: [{ type: "asc" }, { order: "asc" }] },
          units: { select: { status: true, price: true } },
        },
      }),
      prisma.project.findFirst({
        where: { unitTypes: { some: { id } } },
        select: { teaserVideoData: true },
      }),
    ]);

    if (!unit) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const ask = listingAsk(unit.price, unit.units);
    const { units: _apartments, project, ...rest } = unit;
    const { buildings: rawBuildings, ...projectRest } = project;
    const buildings = unit.ownerType === "developer"
      ? rawBuildings.map((building) => ({
          id: building.id,
          name: building.name,
          floorCount: building.floorCount,
          unitsPerFloor: building.unitsPerFloor,
          sortIndex: building.sortIndex,
          // Reserved for a future GLB. The explorer draws a procedural tower.
          modelUrl: building.modelUrl,
          units: building.units.map((apartment) => ({
            id: apartment.id,
            floor: apartment.floor,
            unitNumber: apartment.unitNumber,
            positionIndex: apartment.positionIndex,
            status: apartment.status,
            price: apartment.price,
            unitTypeId: apartment.unitTypeId,
            unitLabel: apartment.unitType.unitLabel,
            listPrice: apartment.unitType.price,
          })),
        }))
      : [];
    return NextResponse.json({
      unit: {
        ...rest,
        project: projectRest,
        buildings,
        price: ask.price,
        priceFrom: ask.from,
        listPrice: unit.price,
        ownerType: unit.ownerType,
        hasTeaserVideo: !!projectVideoRow?.teaserVideoData,
      },
    });
  } catch (err) {
    console.error("[aom/[id] GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
