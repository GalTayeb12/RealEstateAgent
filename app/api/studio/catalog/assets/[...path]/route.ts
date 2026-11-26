/**
 * GET /api/studio/catalog/assets/<id>/<version>/<file> -> a catalog asset uploaded through the admin
 * catalog (Storage driver). Assets are immutable per (id, version), so they cache for a year.
 */
import { NextResponse } from "next/server";
import { studioEnabled } from "@/lib/studio/flags";
import { STORED_PREFIX, storageKeyOf } from "@/lib/studio/catalog/assets";
import { getStorage } from "@/lib/storage";

const TYPES: Record<string, string> = { glb: "model/gltf-binary", webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", ktx2: "image/ktx2" };

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  if (!studioEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { path } = await ctx.params;
  const key = storageKeyOf(STORED_PREFIX + path.join("/"));
  if (!key) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const bytes = await getStorage().get(key);
  if (!bytes) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const ext = key.split(".").pop()!.toLowerCase();
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
