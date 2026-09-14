import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createVerificationToken } from "@/lib/tokens";
import { emailVerificationLink } from "@/lib/email";
import { resendVerificationSchema } from "@/lib/validation/auth";
import { zodError } from "@/lib/validation";

// Generic success message — never reveal whether an email exists in the system.
const GENERIC_OK = { ok: true, message: "If that account exists and is unverified, a new link has been sent." };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = resendVerificationSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);
    const { email } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });

    // If user not found or already verified — return the same generic response.
    if (!user || user.emailVerified) {
      return NextResponse.json(GENERIC_OK);
    }

    const token = await createVerificationToken(user.id, "email_verify");
    // Fire-and-forget — don't block the response on email delivery.
    emailVerificationLink({ to: user.email, token }).catch((err) =>
      console.error("[resend-verification] email failed:", err)
    );

    return NextResponse.json(GENERIC_OK);
  } catch (err) {
    console.error("[resend-verification]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
