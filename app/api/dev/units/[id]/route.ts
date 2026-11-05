/**
 * PATCH /api/dev/units/[id]
 * Body: { floor?, unitNumber?, positionIndex?, status?, price? }
 * price: number override, or null to inherit the unit type price.
 * Setting status back to available releases an unsigned reservation.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { z } from "zod";
import { zodError } from "@/lib/validation";
import { syncUnitTypeInventory } from "@/lib/inventory";
import { triggerAlerts } from "@/lib/alerts";

const schema = z.object({
  floor: z.number().int().optional(),
  unitNumber: z.string().min(1).optional(),
  positionIndex: z.number().int().nonnegative().optional(),
  status: z.enum(["available", "reserved", "sold"]).optional(),
  price: z.number().nonnegative().nullable().optional(),
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

  const existing = await prisma.unit.findFirst({
    where: { id, project: { developerId: auth.userId } },
    include: {
      unitType: {
        select: { id: true, unitLabel: true, price: true, eil: true, ail: true, attributes: true, active: true, project: { select: { name: true, location: true } } },
      },
    },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return zodError(parsed.error);
  const { floor, unitNumber, positionIndex, status, price } = parsed.data;

  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (status === "available" && existing.status === "reserved") {
        const hold = await tx.offer.findFirst({
          where: { unitId: id, status: "accepted" },
        });
        if (hold?.buyerSignature && hold.developerSignature) {
          throw new Error("DEAL_ALREADY_SIGNED");
        }
        if (hold) {
          await tx.offer.update({ where: { id: hold.id }, data: { status: "cancelled" } });
        }
      }

      const unit = await tx.unit.update({
        where: { id },
        data: {
          ...(floor != null && { floor }),
          ...(unitNumber != null && { unitNumber: unitNumber.trim() }),
          ...(positionIndex != null && { positionIndex }),
          ...(status != null && { status }),
          ...(price !== undefined && { price }),
        },
      });
      await syncUnitTypeInventory(tx, unit.unitTypeId);
      return unit;
    });
    // Fire price-drop alert when unit-level price is explicitly set lower than the previous effective price
    if (price != null && existing.unitType?.active) {
      const prevEffectivePrice = existing.price ?? existing.unitType.price;
      if (price < prevEffectivePrice) {
        const ut = existing.unitType;
        void triggerAlerts({
          type:            "price_drop",
          unitTypeId:      ut.id,
          unitLabel:       ut.unitLabel,
          projectName:     ut.project.name,
          projectLocation: ut.project.location,
          price,
          eil:             ut.eil,
          ail:             ut.ail,
          attributes:      ut.attributes ? (JSON.parse(ut.attributes as string) as Record<string, unknown>) : {},
          previousPrice:   prevEffectivePrice,
        });
      }
    }

    return NextResponse.json({ unit: updated });
  } catch (err) {
    if (err instanceof Error && err.message === "DEAL_ALREADY_SIGNED") {
      return NextResponse.json({ error: "A signed deal cannot be released" }, { status: 409 });
    }
    if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json(
        { error: "Another apartment on this floor already uses that number" },
        { status: 409 }
      );
    }
    throw err;
  }
}
