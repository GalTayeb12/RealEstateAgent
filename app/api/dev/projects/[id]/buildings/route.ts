/**
 * POST /api/dev/projects/[id]/buildings
 * Body: { name, floorCount, unitsPerFloor }
 *
 * Adds a building to the developer's own project (until now buildings only came
 * from the Excel import). When the project already has a building image, the new
 * building gets a first-guess frame on it and points at the image too.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { zodError } from "@/lib/validation";
import { getStorage } from "@/lib/storage";
import { PhotoMeta } from "@/lib/experience/types";
import { cleanMeta, defaultMeta, stageKey } from "@/lib/stage";

const schema = z.object({
  name: z.string().trim().min(1).max(60),
  floorCount: z.number().int().min(1).max(120),
  unitsPerFloor: z.number().int().min(1).max(12),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "developer") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const project = await prisma.project.findFirst({
    where: { id, developerId: auth.userId },
    select: { id: true, buildings: { orderBy: { sortIndex: "asc" }, select: { id: true, name: true, floorCount: true, unitsPerFloor: true, modelUrl: true, sortIndex: true } } },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return zodError(parsed.error);
  const { name, floorCount, unitsPerFloor } = parsed.data;
  if (project.buildings.some((b) => b.name === name)) {
    return NextResponse.json({ error: "A building with this name already exists", errorHe: "כבר יש בניין בשם הזה" }, { status: 409 });
  }

  // a project already showing a building photo: the new building uses it too
  const modelUrl = project.buildings.find((b) => b.modelUrl)?.modelUrl ?? null;
  const building = await prisma.building.create({
    data: { projectId: id, name, floorCount, unitsPerFloor, sortIndex: project.buildings.length, ...(modelUrl ? { modelUrl } : {}) },
    select: { id: true, name: true, floorCount: true, unitsPerFloor: true },
  });

  if (modelUrl) {
    const storage = getStorage();
    const raw = await storage.get(stageKey(id, "on.json"));
    const prev = raw ? PhotoMeta.safeParse(JSON.parse(raw.toString("utf8"))) : null;
    if (prev?.success) {
      const all = [...project.buildings, building];
      const guess = defaultMeta(prev.data.aspect, all).buildings;
      // keep the frames already marked, add a default one for the new building
      const meta = cleanMeta({ ...prev.data, buildings: [...prev.data.buildings, guess[guess.length - 1]] });
      await storage.put(stageKey(id, "on.json"), new TextEncoder().encode(JSON.stringify(meta)), { contentType: "application/json" });
    }
  }
  return NextResponse.json({ building }, { status: 201 });
}
