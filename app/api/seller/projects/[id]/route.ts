/**
 * PUT /api/seller/projects/[id] — update an existing project
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { updateProjectSchema } from "@/lib/validation/properties";
import { zodError } from "@/lib/validation";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "seller") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (project.developerId !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updateProjectSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const { name, location, description, video_url, building_3d_url, amenities } = parsed.data;

  const updated = await prisma.project.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(location !== undefined && { location }),
      ...(description !== undefined && { description }),
      ...(video_url !== undefined && { video_url }),
      ...(building_3d_url !== undefined && { building_3d_url }),
      ...(amenities !== undefined && { amenities }),
    },
    include: { unitTypes: true },
  });

  return NextResponse.json({ project: updated });
}
