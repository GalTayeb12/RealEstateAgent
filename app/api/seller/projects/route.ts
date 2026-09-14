/**
 * GET  /api/seller/projects  — list seller's projects with nested unit types
 * POST /api/seller/projects  — create a new project
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { createProjectSchema } from "@/lib/validation/properties";
import { zodError } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "seller") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projects = await prisma.project.findMany({
    where: { developerId: auth.userId },
    include: {
      unitTypes: {
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "seller") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);
  const { name, location, description, video_url, building_3d_url, amenities } = parsed.data;

  const project = await prisma.project.create({
    data: {
      developerId: auth.userId,
      ownerType: "seller",
      name: name.trim(),
      location: location ?? "",
      description: description ?? "",
      video_url: video_url ?? null,
      building_3d_url: building_3d_url ?? null,
      amenities: amenities ?? [],
    },
    include: { unitTypes: true },
  });

  return NextResponse.json({ project }, { status: 201 });
}
