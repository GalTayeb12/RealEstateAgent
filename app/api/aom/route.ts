/**
 * GET /api/aom — list all active unit types (public, for the matching engine)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const listings = await prisma.unitType.findMany({
      where: { active: true },
      include: {
        seller: { select: { id: true, email: true } },
        project: { select: { name: true, location: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ listings });
  } catch (err) {
    console.error("[aom GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
