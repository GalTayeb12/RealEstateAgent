/**
 * PUT /api/dev/buildings/[id]/units
 * Body: { cells: [{ floor, positionIndex, unitTypeId | null }] }
 *
 * Paints apartments onto the building grid (lib/placement.ts): creates a Unit in
 * an empty cell, changes the type of an available one, removes it when the cell
 * is cleared. Reserved and sold apartments are never touched (returned as blocked).
 * Unit type counts are re-synced from the Units afterwards.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { zodError } from "@/lib/validation";
import { syncUnitTypeInventory } from "@/lib/inventory";
import { planPlacement } from "@/lib/placement";

const schema = z.object({
  cells: z.array(z.object({
    floor: z.number().int().min(1).max(120),
    positionIndex: z.number().int().min(0).max(11),
    unitTypeId: z.string().min(1).nullable(),
  })).min(1).max(1500),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "developer") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const building = await prisma.building.findFirst({
    where: { id, project: { developerId: auth.userId } },
    select: { id: true, projectId: true, floorCount: true, unitsPerFloor: true },
  });
  if (!building) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return zodError(parsed.error);
  const { cells } = parsed.data;
  if (cells.some((c) => c.floor > building.floorCount || c.positionIndex >= building.unitsPerFloor)) {
    return NextResponse.json({ error: "A cell is outside the building", errorHe: "תא מחוץ לגבולות הבניין" }, { status: 422 });
  }
  const typeIds = [...new Set(cells.flatMap((c) => (c.unitTypeId ? [c.unitTypeId] : [])))];
  if (typeIds.length) {
    const ok = await prisma.unitType.count({ where: { id: { in: typeIds }, projectId: building.projectId } });
    if (ok !== typeIds.length) return NextResponse.json({ error: "Unknown apartment type", errorHe: "סוג דירה לא מוכר" }, { status: 422 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.unit.findMany({ where: { buildingId: id }, select: { id: true, floor: true, positionIndex: true, unitTypeId: true, status: true } });
      const plan = planPlacement(existing, cells);
      const touched = new Set<string>(typeIds);
      for (const r of plan.retype) { const prev = existing.find((e) => e.id === r.id); if (prev) touched.add(prev.unitTypeId); }
      for (const rid of plan.remove) { const prev = existing.find((e) => e.id === rid); if (prev) touched.add(prev.unitTypeId); }

      if (plan.create.length) {
        await tx.unit.createMany({ data: plan.create.map((c) => ({ projectId: building.projectId, buildingId: id, ...c })) });
      }
      for (const r of plan.retype) await tx.unit.update({ where: { id: r.id }, data: { unitTypeId: r.unitTypeId } });
      if (plan.remove.length) await tx.unit.deleteMany({ where: { id: { in: plan.remove }, status: "available" } });
      for (const t of touched) await syncUnitTypeInventory(tx, t);
      const units = await tx.unit.findMany({ where: { buildingId: id }, select: { id: true, floor: true, positionIndex: true, unitTypeId: true, status: true }, orderBy: [{ floor: "desc" }, { positionIndex: "asc" }] });
      return { units, plan };
    });
    return NextResponse.json({ units: result.units, created: result.plan.create.length, changed: result.plan.retype.length, removed: result.plan.remove.length, blocked: result.plan.blocked });
  } catch (err) {
    // unique (building, floor, unitNumber): a hand-numbered apartment already uses that number
    if ((err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "An apartment already uses that number on this floor", errorHe: "כבר יש דירה עם המספר הזה בקומה" }, { status: 409 });
    }
    throw err;
  }
}
