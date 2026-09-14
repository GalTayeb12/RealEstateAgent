import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createVerificationToken } from "@/lib/tokens";
import { emailPasswordResetLink } from "@/lib/email";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { zodError } from "@/lib/validation";

// Always return this — never reveal whether an email is registered.
const GENERIC_OK = {
  ok: true,
  message: "If that email exists in our system, we've sent a reset link.",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);
    const { email } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });

    // Silently skip unknown emails — same response either way.
    if (user) {
      const token = await createVerificationToken(user.id, "password_reset");
      emailPasswordResetLink({ to: user.email, token }).catch((err) =>
        console.error("[forgot-password] email failed:", err)
      );
    }

    return NextResponse.json(GENERIC_OK);
  } catch (err) {
    console.error("[forgot-password]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
