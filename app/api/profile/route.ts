/**
 * GET  /api/profile — returns current user's name, phone, email, role
 * PATCH /api/profile — updates name and/or phone
 *
 * Both buyer and developer roles are supported.
 * Email and role are read-only (cannot be changed via this route).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { updateProfileSchema } from "@/lib/validation/profile";
import { zodError } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { email: true, role: true, name: true, phone: true, locale: true },
  });

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json(user);
}

export async function PATCH(req: NextRequest) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rawBody = await req.json();
  const parsedBody = updateProfileSchema.safeParse(rawBody);
  if (!parsedBody.success) return zodError(parsedBody.error);
  const body = parsedBody.data;

  // Email and role are immutable here. Locale is the saved UI/email language.
  const data: { name?: string | null; phone?: string | null; locale?: "he" | "en" } = {};
  if ("name" in body)  data.name  = typeof body.name  === "string" ? body.name.trim()  || null : null;
  if ("phone" in body) data.phone = typeof body.phone === "string" ? body.phone.trim() || null : null;
  if (body.locale === "he" || body.locale === "en") data.locale = body.locale;

  const user = await prisma.user.update({
    where: { id: auth.userId },
    data,
    select: { email: true, role: true, name: true, phone: true, locale: true },
  });

  return NextResponse.json(user);
}
