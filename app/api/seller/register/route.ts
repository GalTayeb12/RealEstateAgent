/**
 * POST /api/seller/register
 * Creates a User (role=seller) + SellerProfile with phone.
 * Returns a message asking user to verify email — no JWT issued until verified.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { createVerificationToken } from "@/lib/tokens";
import { emailVerificationLink } from "@/lib/email";
import { sellerRegisterSchema } from "@/lib/validation/seller";
import { zodError } from "@/lib/validation";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = sellerRegisterSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);
    const { name, phone, email, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: "seller",
        name,
        sellerProfile: {
          create: { phone },
        },
      },
    });

    // Send verification email — fire-and-forget, never blocks the response.
    createVerificationToken(user.id, "email_verify")
      .then((verifyToken) => emailVerificationLink({ to: user.email, token: verifyToken }))
      .catch((err) => console.error("[seller/register] verification email failed:", err));

    return NextResponse.json(
      { message: "Registration submitted. Please verify your email." },
      { status: 201 }
    );
  } catch (err) {
    console.error("[seller/register POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
