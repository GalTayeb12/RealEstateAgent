/**
 * GET /api/seller/me
 * Returns the authenticated seller's profile data.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "seller") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sellerProfile = await prisma.sellerProfile.findUnique({
    where: { userId: auth.userId },
    include: { user: { select: { name: true, email: true } } },
  });

  if (!sellerProfile) {
    return NextResponse.json({ error: "Seller profile not found" }, { status: 404 });
  }

  return NextResponse.json({
    userId: auth.userId,
    email: sellerProfile.user.email,
    name: sellerProfile.user.name,
    phone: sellerProfile.phone,
  });
}
