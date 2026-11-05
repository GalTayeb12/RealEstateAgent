/**
 * GET  /api/buyer/mortgage-settings — return saved mortgage calculator data
 * POST /api/buyer/mortgage-settings — save equity, desiredPayment, buyerType, income, maxPrice
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { z } from "zod";
import { zodError } from "@/lib/validation";

const saveSchema = z.object({
  equity:         z.number().nonnegative(),
  desiredPayment: z.number().nonnegative().nullable().optional(),
  buyerType:      z.enum(["first", "moveUp", "investor"]),
  income:         z.number().nonnegative().nullable().optional(),
  maxPrice:       z.number().nonnegative().nullable().optional(),
});

export async function GET(req: NextRequest) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "buyer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bp = await prisma.buyerProfile.findUnique({
    where: { userId: auth.userId },
    select: {
      mortgageEquity:         true,
      mortgageDesiredPayment: true,
      mortgageBuyerType:      true,
      mortgageIncome:         true,
      mortgageMaxPrice:       true,
    },
  });

  if (!bp) return NextResponse.json(null);

  // Return null if buyer has never saved settings
  if (bp.mortgageEquity == null) return NextResponse.json(null);

  return NextResponse.json({
    equity:         bp.mortgageEquity,
    desiredPayment: bp.mortgageDesiredPayment,
    buyerType:      bp.mortgageBuyerType ?? "first",
    income:         bp.mortgageIncome,
    maxPrice:       bp.mortgageMaxPrice,
  });
}

export async function POST(req: NextRequest) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "buyer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await req.json();
  const parsed = saveSchema.safeParse(rawBody);
  if (!parsed.success) return zodError(parsed.error);
  const { equity, desiredPayment, buyerType, income, maxPrice } = parsed.data;

  const bp = await prisma.buyerProfile.update({
    where: { userId: auth.userId },
    data: {
      mortgageEquity:         equity,
      mortgageDesiredPayment: desiredPayment ?? null,
      mortgageBuyerType:      buyerType,
      mortgageIncome:         income ?? null,
      mortgageMaxPrice:       maxPrice ?? null,
    },
    select: {
      mortgageEquity:         true,
      mortgageDesiredPayment: true,
      mortgageBuyerType:      true,
      mortgageIncome:         true,
      mortgageMaxPrice:       true,
    },
  });

  return NextResponse.json({
    equity:         bp.mortgageEquity,
    desiredPayment: bp.mortgageDesiredPayment,
    buyerType:      bp.mortgageBuyerType ?? "first",
    income:         bp.mortgageIncome,
    maxPrice:       bp.mortgageMaxPrice,
  });
}
