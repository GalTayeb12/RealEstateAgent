/**
 * POST   /api/dev/projects/[id]/video  — upload a teaser video (base64 data URL)
 * DELETE /api/dev/projects/[id]/video  — remove the teaser video
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";

function requireApprovedDev(req: NextRequest) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "developer") return null;
  return auth;
}

export async function POST(
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
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true, developerId: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (project.developerId !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { videoData } = body as { videoData?: string };
  if (!videoData || !videoData.startsWith("data:video/")) {
    return NextResponse.json({ error: "videoData must be a base64 data URL starting with data:video/" }, { status: 400 });
  }

  await prisma.project.update({
    where: { id },
    data: { teaserVideoData: videoData },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
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
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true, developerId: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (project.developerId !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.project.update({
    where: { id },
    data: { teaserVideoData: null },
  });

  return NextResponse.json({ ok: true });
}
