/**
 * Admin catalog API (M11). Studio flag + role "admin" only; anything else answers 404 like the rest of
 * the studio.
 *
 *   GET  -> { head, entries, releases }
 *   POST multipart/form-data { manifest: <JSON text>, files: File[] }  -> import a draft (files are stored
 *        with the Storage driver; manifest paths whose file name matches an upload are rewritten to it)
 *   POST application/json { action: "check" | "publish" | "retire" | "discard" | "sync", keys?, note? }
 *
 * Publishing and retiring create a new numbered release; the gates (lib/studio/catalog/gates.ts) block
 * anything that fails them.
 */
import { NextResponse } from "next/server";
import { extractToken } from "@/lib/auth";
import { safeFileName, getStorage } from "@/lib/storage";
import { studioEnabled } from "@/lib/studio/flags";
import { storedAsset } from "@/lib/studio/catalog/assets";
import { parseManifest } from "@/lib/studio/catalog/gates";
import { CatalogError, keyOf } from "@/lib/studio/catalog/registry";
import { getRegistry, syncRepository } from "@/lib/studio/catalog/server";

export const dynamic = "force-dynamic";

const ALLOWED = /\.(glb|webp|png|jpe?g|ktx2)$/i;
const MAX_FILE = 15 * 1024 * 1024, MAX_TOTAL = 40 * 1024 * 1024, MAX_FILES = 12;
const TYPES: Record<string, string> = { glb: "model/gltf-binary", webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", ktx2: "image/ktx2" };

const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });
const fail = (status: number, error: string, issues: string[] = []) => NextResponse.json({ error, issues }, { status });

function admin(req: Request) {
  const auth = extractToken(req.headers.get("Authorization"));
  return studioEnabled() && auth?.role === "admin" ? auth : null;
}

function toHttp(e: unknown) {
  if (e instanceof CatalogError) {
    const status = e.code === "not-found" ? 404 : e.code === "invalid" || e.code === "empty" ? 400 : 409;
    return fail(status, e.message, e.issues);
  }
  console.error("[studio/admin/catalog]", e);
  return fail(500, "catalog_failed");
}

export async function GET(req: Request) {
  if (!admin(req)) return notFound();
  try {
    const reg = await getRegistry();
    return NextResponse.json({ head: await reg.head(), entries: await reg.entries(), releases: await reg.releases() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return toHttp(e); }
}

/** Rewrites asset paths whose file name was uploaded to the stored URL. */
function rewrite(raw: Record<string, unknown>, uploaded: Map<string, string>) {
  const swap = (p: unknown) => (typeof p === "string" && uploaded.has(safeFileName(p)) ? uploaded.get(safeFileName(p)) : p);
  if (raw.type === "model" && raw.assets && typeof raw.assets === "object") {
    const a = raw.assets as Record<string, unknown>;
    for (const k of ["glb", "preview", "decal"]) if (k in a) a[k] = swap(a[k]);
    if (Array.isArray(a.lods)) a.lods = a.lods.map(swap);
  }
  if (raw.type === "material" && raw.pbr && typeof raw.pbr === "object") {
    const maps = (raw.pbr as Record<string, unknown>).maps as Record<string, unknown> | undefined;
    if (maps) for (const k of Object.keys(maps)) maps[k] = swap(maps[k]);
  }
}

export async function POST(req: Request) {
  const auth = admin(req);
  if (!auth) return notFound();
  const by = auth.email ?? auth.userId;
  try {
    const reg = await getRegistry();
    if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
      const form = await req.formData();
      let raw: Record<string, unknown>;
      try { raw = JSON.parse(String(form.get("manifest") ?? "")); } catch { return fail(400, "The manifest is not valid JSON."); }
      const files = form.getAll("files").filter((f): f is File => typeof f !== "string" && f.size > 0);
      if (files.length > MAX_FILES) return fail(400, `At most ${MAX_FILES} files.`);
      if (files.reduce((s, f) => s + f.size, 0) > MAX_TOTAL) return fail(413, "Upload too large.");
      for (const f of files) {
        if (!ALLOWED.test(f.name)) return fail(400, `File type not allowed: ${f.name}`);
        if (f.size > MAX_FILE) return fail(413, `File too large: ${f.name}`);
      }
      // validate first and refuse to touch the assets of a published (id, version)
      const p = parseManifest(raw);
      if ("issues" in p) return fail(400, "The manifest is not valid.", p.issues);
      const existing = await reg.entry(keyOf(p.manifest));
      if (existing && existing.status !== "draft") return fail(409, `${existing.key} is already ${existing.status}; publish changes as a new version.`);
      const uploaded = new Map<string, string>();
      for (const f of files) {
        const name = safeFileName(f.name);
        const { url, key } = storedAsset(p.manifest.id, p.manifest.version, name);
        const ext = name.split(".").pop()!.toLowerCase();
        await getStorage().put(key, new Uint8Array(await f.arrayBuffer()), { contentType: TYPES[ext] });
        uploaded.set(name, url);
      }
      rewrite(raw, uploaded);
      const entry = await reg.importDraft(raw, by);
      return NextResponse.json({ entry, stored: [...uploaded.values()] }, { status: 201 });
    }

    let body: { action?: string; keys?: unknown; note?: unknown };
    try { body = await req.json(); } catch { return fail(400, "invalid_json"); }
    const keys = Array.isArray(body.keys) ? body.keys.filter((k): k is string => typeof k === "string").slice(0, 200) : [];
    const note = typeof body.note === "string" ? body.note.slice(0, 280) : undefined;
    switch (body.action) {
      case "check": {
        if (!keys.length) return fail(400, "Nothing to check.");
        const out = [];
        for (const k of keys) out.push(await reg.check(k));
        return NextResponse.json({ entries: out });
      }
      case "publish": return NextResponse.json({ release: await reg.publish(keys, by, note) });
      case "retire": return NextResponse.json({ release: await reg.retire(keys, by, note) });
      case "discard": { for (const k of keys) await reg.discard(k); return NextResponse.json({ ok: true }); }
      case "sync": return NextResponse.json({ release: await syncRepository(by) });
      default: return fail(400, "Unknown action.");
    }
  } catch (e) { return toHttp(e); }
}
