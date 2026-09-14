/**
 * GET  /api/dev/projects  — list developer's projects with nested unit types
 * POST /api/dev/projects  — create a new project
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { createProjectSchema } from "@/lib/validation/properties";
import { zodError } from "@/lib/validation";

function requireApprovedDev(req: NextRequest) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "developer") return null;
  return auth;
}

export async function GET(req: NextRequest) {
  const auth = requireApprovedDev(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.developerProfile.findUnique({ where: { userId: auth.userId } });
  if (!profile || profile.crnStatus !== "approved") {
    return NextResponse.json({ error: "Account not approved" }, { status: 403 });
  }

  const [projects, videoProjects] = await Promise.all([
    prisma.project.findMany({
      where: { developerId: auth.userId },
      select: {
        id: true, developerId: true, name: true, location: true,
        description: true, video_url: true, building_3d_url: true,
        amenities: true, ownerType: true, status: true,
        createdAt: true, updatedAt: true,
        // teaserVideoData deliberately omitted
        unitTypes: { orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.project.findMany({
      where: { developerId: auth.userId, NOT: { teaserVideoData: null } },
      select: { id: true },
    }),
  ]);

  const videoIds = new Set(videoProjects.map(p => p.id));
  const projectsWithVideo = projects.map(p => ({ ...p, hasTeaserVideo: videoIds.has(p.id) }));

  return NextResponse.json({ projects: projectsWithVideo });
}

export async function POST(req: NextRequest) {
  const auth = requireApprovedDev(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.developerProfile.findUnique({ where: { userId: auth.userId } });
  if (!profile || profile.crnStatus !== "approved") {
    return NextResponse.json({ error: "Account not approved" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);
  const { name, location, description, video_url, building_3d_url, amenities } = parsed.data;

  const project = await prisma.project.create({
    data: {
      developerId: auth.userId,
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
