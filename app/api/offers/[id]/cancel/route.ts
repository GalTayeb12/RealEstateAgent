/**
 * POST /api/offers/[id]/cancel
 *
 * Buyer or listing owner withdraws an accepted deal that is not fully signed.
 * The reserved apartment returns to available.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { releaseReservedUnit } from "@/lib/inventory";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const offer = await prisma.offer.findUnique({ where: { id } });
  if (!offer) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (auth.userId !== offer.buyerId && auth.userId !== offer.developerId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (offer.status !== "accepted") {
    return NextResponse.json({ error: "Only an accepted reservation can be released" }, { status: 409 });
  }
  if (offer.buyerSignature && offer.developerSignature) {
    return NextResponse.json({ error: "A signed deal cannot be released" }, { status: 409 });
  }

  try {
    await releaseReservedUnit(id);
  } catch (err) {
    if (err instanceof Error && err.message === "DEAL_ALREADY_SIGNED") {
      return NextResponse.json({ error: "A signed deal cannot be released" }, { status: 409 });
    }
    throw err;
  }

  const updated = await prisma.offer.findUnique({ where: { id } });
  return NextResponse.json({ offer: updated });
}
