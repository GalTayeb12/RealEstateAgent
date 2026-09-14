import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken } from "@/lib/auth";
import { createVerificationToken } from "@/lib/tokens";
import { emailVerificationLink } from "@/lib/email";
import { registerBuyerSchema } from "@/lib/validation/auth";
import { zodError } from "@/lib/validation";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = registerBuyerSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);
    const { email, password, role = "buyer" } = parsed.data;

    if (role !== "buyer") {
      return NextResponse.json(
        { error: "Role must be 'buyer' (developers register via /api/dev/register)" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, passwordHash, role },
    });

    // Send verification email — fire-and-forget, never blocks the response.
    createVerificationToken(user.id, "email_verify")
      .then((verifyToken) => emailVerificationLink({ to: user.email, token: verifyToken }))
      .catch((err) => console.error("[register] verification email failed:", err));

    const token = signToken({ userId: user.id, email: user.email, role: user.role });

    return NextResponse.json(
      { token, user: { id: user.id, email: user.email, role: user.role } },
      { status: 201 }
    );
  } catch (err) {
    console.error("[register]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
