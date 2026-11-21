/**
 * The building photo stage of a developer's project (lib/stage.ts).
 *
 * GET  → { imageUrl, meta, buildings }       current image + calibration
 * POST multipart { file, aspect }            upload the building image; resets the calibration
 *                                            to a first guess and points every building of the
 *                                            project at it (Building.modelUrl)
 * PUT  { buildings: PhotoBox[] }             save the calibration (validated)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { getStorage } from "@/lib/storage";
import { PhotoMeta } from "@/lib/experience/types";
import { MAX_STAGE_IMAGE_BYTES, STAGE_EXTS, cleanMeta, defaultMeta, sameProportions, sniffImage, stageImageUrl, stageKey, validateStage, type StageKind } from "@/lib/stage";

async function owned(req: NextRequest, id: string) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "developer") return { res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const profile = await prisma.developerProfile.findUnique({ where: { userId: auth.userId }, select: { crnStatus: true } });
  if (!profile || profile.crnStatus !== "approved") return { res: NextResponse.json({ error: "Account not approved" }, { status: 403 }) };
  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, developerId: true, buildings: { orderBy: { sortIndex: "asc" }, select: { id: true, name: true, floorCount: true, unitsPerFloor: true } } },
  });
  if (!project || project.developerId !== auth.userId) return { res: NextResponse.json({ error: "Project not found" }, { status: 404 }) };
  return { project };
}

async function readMeta(id: string) {
  const raw = await getStorage().get(stageKey(id, "on.json"));
  if (!raw) return null;
  const parsed = PhotoMeta.safeParse(JSON.parse(raw.toString("utf8")));
  return parsed.success ? parsed.data : null;
}

async function currentExt(id: string, kind: StageKind = "on") {
  const storage = getStorage();
  for (const ext of STAGE_EXTS) if (await storage.get(stageKey(id, `${kind}.${ext}`))) return ext;
  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = await owned(req, id);
  if ("res" in o) return o.res;
  const [meta, ext, units, unitTypes] = await Promise.all([
    readMeta(id), currentExt(id),
    prisma.unit.findMany({ where: { projectId: id }, select: { id: true, buildingId: true, floor: true, positionIndex: true, unitTypeId: true, status: true } }),
    prisma.unitType.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" }, select: { id: true, unitLabel: true } }),
  ]);
  return NextResponse.json({ imageUrl: ext ? stageImageUrl(id, ext) : null, offImageUrl: meta?.offImage ?? null, meta, buildings: o.project.buildings, units, unitTypes });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = await owned(req, id);
  if ("res" in o) return o.res;
  if (!o.project.buildings.length) {
    return NextResponse.json({ error: "Add a building to the project first", errorHe: "יש להוסיף בניין לפרויקט קודם" }, { status: 409 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const aspect = Number(form?.get("aspect"));
  const which: StageKind = form?.get("kind") === "off" ? "off" : "on";
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing image file", errorHe: "חסר קובץ תמונה" }, { status: 400 });
  if (file.size > MAX_STAGE_IMAGE_BYTES) return NextResponse.json({ error: "Image is larger than 12 MB", errorHe: "התמונה גדולה מ-12 MB" }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) return NextResponse.json({ error: "Use a WebP, JPEG or PNG image", errorHe: "יש להעלות תמונת WebP, JPEG או PNG" }, { status: 415 });
  if (!(aspect > 0.3 && aspect < 5)) return NextResponse.json({ error: "Invalid image proportions", errorHe: "יחס תמונה לא תקין" }, { status: 400 });

  const storage = getStorage();
  const prev = await readMeta(id);

  if (which === "off") {
    // the lights-off view: same proportions as the lit one, shares its calibration
    if (!prev) return NextResponse.json({ error: "Upload the lit image first", errorHe: "יש להעלות קודם את התמונה עם האורות" }, { status: 409 });
    if (!sameProportions(prev.aspect, aspect)) {
      return NextResponse.json({ error: "The two images must have the same proportions", errorHe: "שתי התמונות חייבות להיות באותם יחסים (אותו גודל)" }, { status: 422 });
    }
    await storage.put(stageKey(id, `off.${kind.ext}`), bytes, { contentType: kind.contentType });
    const meta = cleanMeta({ ...prev, offImage: stageImageUrl(id, kind.ext, "off") });
    await storage.put(stageKey(id, "on.json"), new TextEncoder().encode(JSON.stringify(meta)), { contentType: "application/json" });
    return NextResponse.json({ imageUrl: (await currentExt(id)) ? stageImageUrl(id, (await currentExt(id))!) : null, offImageUrl: meta.offImage, meta, buildings: o.project.buildings });
  }

  await storage.put(stageKey(id, `on.${kind.ext}`), bytes, { contentType: kind.contentType });
  // replacing the lit image with one of the same proportions keeps the marking; otherwise start over
  const keep = prev && sameProportions(prev.aspect, aspect) && prev.buildings.length === o.project.buildings.length;
  const meta = keep ? cleanMeta({ ...prev, aspect: prev.aspect }) : defaultMeta(aspect, o.project.buildings);
  await storage.put(stageKey(id, "on.json"), new TextEncoder().encode(JSON.stringify(meta)), { contentType: "application/json" });
  const imageUrl = stageImageUrl(id, kind.ext);
  await prisma.building.updateMany({ where: { projectId: id }, data: { modelUrl: imageUrl } });
  return NextResponse.json({ imageUrl, offImageUrl: meta.offImage ?? null, meta, buildings: o.project.buildings, kept: !!keep });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = await owned(req, id);
  if ("res" in o) return o.res;
  const body = (await req.json().catch(() => null)) as { buildings?: unknown } | null;
  const prev = await readMeta(id);
  if (!prev) return NextResponse.json({ error: "Upload the building image first", errorHe: "יש להעלות קודם תמונת בניין" }, { status: 409 });
  const parsed = PhotoMeta.safeParse({ aspect: prev.aspect, offImage: prev.offImage, buildings: body?.buildings });
  if (!parsed.success) return NextResponse.json({ error: "Invalid calibration", errorHe: "כיול לא תקין" }, { status: 400 });
  const issues = validateStage(parsed.data, o.project.buildings);
  if (issues.length) return NextResponse.json({ error: issues[0].en, errorHe: issues[0].he, issues }, { status: 422 });
  const meta = cleanMeta(parsed.data);
  await getStorage().put(stageKey(id, "on.json"), new TextEncoder().encode(JSON.stringify(meta)), { contentType: "application/json" });
  return NextResponse.json({ meta });
}
