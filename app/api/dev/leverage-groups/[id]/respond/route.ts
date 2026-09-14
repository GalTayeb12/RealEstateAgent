/**
 * POST /api/dev/leverage-groups/[id]/respond
 * Body: { action: "accept"|"reject"|"counter", counterDiscountPercent?: number, counterTerms?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { devRespondLeverageGroupSchema } from "@/lib/validation/leverage-groups";
import { zodError } from "@/lib/validation";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "developer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const group = await prisma.leverageGroup.findFirst({ where: { id, developerId: auth.userId } });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = devRespondLeverageGroupSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);
  const { action, counterDiscountPercent, counterTerms } = parsed.data;

  const updated = await prisma.leverageGroup.update({
    where: { id },
    data: {
      status: action === "accept" ? "accepted" : action === "reject" ? "rejected" : "countered",
      ...(action === "counter" && {
        counterDiscountPercent: Number(counterDiscountPercent),
        counterTerms,
      }),
    },
  });

  return NextResponse.json({ group: updated });
}
