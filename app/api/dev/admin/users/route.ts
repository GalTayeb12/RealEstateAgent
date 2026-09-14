/**
 * GET /api/dev/admin/users — paginated user list for admin dashboard
 *
 * Query params:
 *   ?role=buyer|developer|admin   (optional filter)
 *   ?q=searchText                 (optional email/name search)
 *   ?page=1                       (1-indexed, default 1)
 *   ?limit=25                     (default 25, max 100)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { adminUsersQuerySchema } from "@/lib/validation/admin";
import { zodError } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const guard = requireAdmin(req);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const queryParsed = adminUsersQuerySchema.safeParse({
    role: url.searchParams.get("role") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!queryParsed.success) return zodError(queryParsed.error);
  const { role, q = "", page, limit } = queryParsed.data;
  const skip = (page - 1) * limit;

  const where = {
    ...(role ? { role } : {}),
    ...(q ? { email: { contains: q } } : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        developerProfile: {
          select: { companyName: true, crnStatus: true, qualityScore: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({ users, total, page, limit });
}
