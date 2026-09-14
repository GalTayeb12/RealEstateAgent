import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redeemVerificationToken } from "@/lib/tokens";
import { verifyEmailSchema } from "@/lib/validation/auth";
import { zodError } from "@/lib/validation";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = verifyEmailSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);
    const { token } = parsed.data;

    const result = await redeemVerificationToken(token, "email_verify");

    if (!result.ok) {
      const messages: Record<string, string> = {
        not_found:    "This verification link is invalid.",
        expired:      "This verification link has expired. Please request a new one.",
        already_used: "This verification link has already been used.",
      };
      return NextResponse.json(
        { error: messages[result.reason], reason: result.reason },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { id: result.userId },
      data: { emailVerified: true },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[verify-email]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
