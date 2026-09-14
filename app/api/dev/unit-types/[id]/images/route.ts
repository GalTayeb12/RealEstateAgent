/**
 * GET  /api/dev/unit-types/[id]/images  — list images for a listing (owner only)
 * POST /api/dev/unit-types/[id]/images  — create a new listing image
 *
 * POST body: { type: "gallery"|"panorama", label?: string, imageData: string, order?: number }
 *
 * imageData must be a base64 data URL ("data:image/...;base64,...").
 * Clients should warn users before uploading files larger than ~5 MB; large
 * base64 blobs stored in Postgres slow down reads for all queries on this record.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { createImageSchema } from "@/lib/validation/properties";
import { zodError } from "@/lib/validation";

async function requireOwner(req: NextRequest, unitTypeId: string) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "developer") return null;
  const unitType = await prisma.unitType.findFirst({
    where: { id: unitTypeId, sellerId: auth.userId },
    select: { id: true },
  });
  return unitType ? auth : null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireOwner(req, id);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const images = await prisma.listingImage.findMany({
    where: { unitTypeId: id },
    orderBy: [{ type: "asc" }, { order: "asc" }],
  });

  return NextResponse.json({ images });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireOwner(req, id);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rawBody = await req.json();
  const parsedBody = createImageSchema.safeParse(rawBody);
  if (!parsedBody.success) return zodError(parsedBody.error);
  const { type, label = "", imageData, order = 0 } = parsedBody.data;

  let image;
  try {
    image = await prisma.listingImage.create({
      data: {
        unitTypeId: id,
        type,
        label: label.trim(),
        imageData,
        order,
      },
    });
  } catch (err) {
    console.error("[images POST] Prisma error:", err);
    return NextResponse.json({ error: "Database error — could not save image" }, { status: 500 });
  }

  return NextResponse.json({ image }, { status: 201 });
}
