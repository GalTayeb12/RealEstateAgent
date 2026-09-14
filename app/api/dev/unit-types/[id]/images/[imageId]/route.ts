/**
 * PATCH  /api/dev/unit-types/[id]/images/[imageId]  — update label or order
 * DELETE /api/dev/unit-types/[id]/images/[imageId]  — delete an image
 *
 * Ownership is verified by checking that the image's unitType.sellerId matches
 * the authenticated developer's userId.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { updateImageSchema } from "@/lib/validation/properties";
import { zodError } from "@/lib/validation";

async function requireImageOwner(req: NextRequest, unitTypeId: string, imageId: string) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "developer") return null;

  const image = await prisma.listingImage.findFirst({
    where: {
      id: imageId,
      unitTypeId,
      unitType: { sellerId: auth.userId },
    },
  });
  return image ? { auth, image } : null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  const { id, imageId } = await params;
  const owned = await requireImageOwner(req, id, imageId);
  if (!owned) return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });

  const rawBody = await req.json();
  const parsedBody = updateImageSchema.safeParse(rawBody);
  if (!parsedBody.success) return zodError(parsedBody.error);
  const { label, order } = parsedBody.data;

  const data: { label?: string; order?: number } = {};
  if (label !== undefined) data.label = label.trim();
  if (order !== undefined) data.order = order;

  try {
    const updated = await prisma.listingImage.update({ where: { id: imageId }, data });
    return NextResponse.json({ image: updated });
  } catch (err) {
    console.error("[images PATCH] Prisma error:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  const { id, imageId } = await params;
  const owned = await requireImageOwner(req, id, imageId);
  if (!owned) return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });

  try {
    await prisma.listingImage.delete({ where: { id: imageId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[images DELETE] Prisma error:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
