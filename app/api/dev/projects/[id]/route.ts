/**
 * PUT  /api/dev/projects/[id]  — update an existing project
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { updateProjectSchema } from "@/lib/validation/properties";
import { zodError } from "@/lib/validation";

function requireApprovedDev(req: NextRequest) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "developer") return null;
  return auth;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireApprovedDev(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.developerProfile.findUnique({ where: { userId: auth.userId } });
  if (!profile || profile.crnStatus !== "approved") {
    return NextResponse.json({ error: "Account not approved" }, { status: 403 });
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
    select: {
      id: true, developerId: true, name: true, location: true,
      description: true, video_url: true, building_3d_url: true,
      amenities: true, ownerType: true, status: true,
      createdAt: true, updatedAt: true,
      // teaserVideoData deliberately omitted
      unitTypes: true,
    },
  });

  return NextResponse.json({ project: updated });
}
