/**
 * POST /api/dev/admin/approve/[id]
 * Body: { action: "approve" | "reject" }
 * [id] is the DeveloperProfile.id
 * Requires a valid JWT with role === "admin".
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { emailDeveloperApproved, emailDeveloperRejected } from "@/lib/email";
import { adminApproveSchema } from "@/lib/validation/admin";
import { zodError } from "@/lib/validation";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAdmin(req);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = await req.json();
  const parsed = adminApproveSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);
  const { action } = parsed.data;

  const profile = await prisma.developerProfile.findUnique({ where: { id } });
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.developerProfile.update({
    where: { id },
    data: { crnStatus: action === "approve" ? "approved" : "rejected" },
    include: { user: { select: { email: true } } },
  });

  // Notify the developer by email (fire-and-forget)
  const emailFn = action === "approve" ? emailDeveloperApproved : emailDeveloperRejected;
  emailFn({
    developerEmail: updated.user.email,
    companyName: profile.companyName ?? updated.user.email,
  }).catch(console.error);

  return NextResponse.json({ crnStatus: updated.crnStatus });
}
