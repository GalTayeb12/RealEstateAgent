/**
 * Auth for the developer plan-review API: same pattern as
 * app/api/dev/projects/[id]/import (developer token + approved CRN), plus
 * ownership of the unit type.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken, type JwtPayload } from "@/lib/auth";
import { planAccess, PlanInputError } from "@/lib/planReview";

export async function authorizePlanOwner(
  req: NextRequest,
  unitTypeId: string,
): Promise<{ auth: JwtPayload } | { response: NextResponse }> {
  const auth = extractToken(req.headers.get("Authorization"));
  const [profile, unitType] = auth && auth.role === "developer"
    ? await Promise.all([
        prisma.developerProfile.findUnique({ where: { userId: auth.userId }, select: { crnStatus: true } }),
        prisma.unitType.findUnique({ where: { id: unitTypeId }, select: { sellerId: true } }),
      ])
    : [null, null];
  const access = planAccess(auth, profile, unitType);
  if (!access.ok) return { response: NextResponse.json({ error: access.error }, { status: access.status }) };
  return { auth: auth! };
}

export function planErrorResponse(err: unknown, context: string): NextResponse {
  if (err instanceof PlanInputError) {
    return NextResponse.json({ error: err.en, errorHe: err.he }, { status: err.status });
  }
  console.error(`[plan ${context}]`, err);
  return NextResponse.json({ error: "Server error", errorHe: "שגיאת שרת" }, { status: 500 });
}
