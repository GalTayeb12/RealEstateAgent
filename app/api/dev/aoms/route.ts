/**
 * Deprecated — kept for any external callers.
 * GET  /api/dev/aoms  — returns all developer's unit types (flattened)
 * POST /api/dev/aoms  — creates a unit type inside an auto-created project
 *
 * Prefer /api/dev/projects for new code.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { legacyCreateAomSchema } from "@/lib/validation/properties";
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

  const unitTypes = await prisma.unitType.findMany({
    where: { sellerId: auth.userId },
    include: { project: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ aoms: unitTypes });
}

export async function POST(req: NextRequest) {
  const auth = requireApprovedDev(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.developerProfile.findUnique({ where: { userId: auth.userId } });
  if (!profile || profile.crnStatus !== "approved") {
    return NextResponse.json({ error: "Account not approved" }, { status: 403 });
  }

  const rawBody = await req.json();
  const parsedBody = legacyCreateAomSchema.safeParse(rawBody);
  if (!parsedBody.success) return zodError(parsedBody.error);
  const { title, unitLabel, description, eil, ail, attributes = {}, projectId } = parsedBody.data;
  const label = unitLabel ?? title ?? "";

  // Use specified project or create a default one
  let resolvedProjectId = projectId;
  if (!resolvedProjectId) {
    const defaultProject = await prisma.project.findFirst({
      where: { developerId: auth.userId, name: `${profile.companyName} Default` },
    });
    if (defaultProject) {
      resolvedProjectId = defaultProject.id;
    } else {
      const created = await prisma.project.create({
        data: {
          developerId: auth.userId,
          name: `${profile.companyName} Default`,
          location: "",
          description: "Default project",
        },
      });
      resolvedProjectId = created.id;
    }
  }

  const unitType = await prisma.unitType.create({
    data: {
      projectId: resolvedProjectId,
      sellerId: auth.userId,
      unitLabel: label,
      description: description ?? "",
      eil: Number(eil),
      ail: Number(ail),
      attributes: JSON.stringify(attributes),
    },
  });

  return NextResponse.json({ aom: unitType }, { status: 201 });
}
