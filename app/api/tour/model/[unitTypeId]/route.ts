/**
 * GET /api/tour/model/[unitTypeId]
 * Returns the ApartmentModel data for a unit type, or { model: null } if none exists.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ unitTypeId: string }> },
) {
  try {
    const { unitTypeId } = await params;
    const record = await prisma.apartmentModel.findUnique({
      where: { unitTypeId },
      select: { data: true },
    });

    return NextResponse.json({ model: record?.data ?? null });
  } catch {
    // DB errors — graceful fallback to sample data
    return NextResponse.json({ model: null });
  }
}
