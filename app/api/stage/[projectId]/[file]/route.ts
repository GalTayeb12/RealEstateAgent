/**
 * GET /api/stage/<projectId>/on.<webp|jpg|png> | on.json
 * Public: the building photo of a project and its calibration (lib/stage.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";
import { stageKey } from "@/lib/stage";

const TYPES: Record<string, string> = {
  "on.webp": "image/webp", "on.jpg": "image/jpeg", "on.png": "image/png", "on.json": "application/json",
  "off.webp": "image/webp", "off.jpg": "image/jpeg", "off.png": "image/png",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string; file: string }> }) {
  const { projectId, file } = await params;
  const type = TYPES[file];
  if (!type || !/^[A-Za-z0-9_-]{1,64}$/.test(projectId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const bytes = await getStorage().get(stageKey(projectId, file));
  if (!bytes) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": type, "Cache-Control": "public, max-age=30, must-revalidate" },
  });
}
