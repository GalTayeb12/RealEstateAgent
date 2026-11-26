/**
 * Where a catalog asset is served from. Repository assets are relative paths under the static catalog
 * (`public/studio/catalog`); assets imported through the admin catalog are stored with the Storage
 * driver and referenced by absolute paths under STORED_PREFIX, served by /api/studio/catalog/assets.
 * Material maps are file names relative to `<id>/<version>/`; model assets are relative to the root.
 */
export const STATIC_BASE = "/studio/catalog";
export const STORED_PREFIX = "/api/studio/catalog/assets/";
/** Storage key prefix for stored catalog assets. */
export const STORAGE_ROOT = "studio-catalog/assets/";

const isAbsolute = (p: string) => p.startsWith("/");

export function modelAssetUrl(p: string): string {
  return isAbsolute(p) ? p : `${STATIC_BASE}/${p}`;
}

export function materialMapUrl(m: { id: string; version: number }, f: string): string {
  return isAbsolute(f) ? f : `${STATIC_BASE}/${m.id}/${m.version}/${f}`;
}

/** URL path of a stored asset, and its storage key, for an uploaded file of catalog entry id@version. */
export function storedAsset(id: string, version: number, file: string): { url: string; key: string } {
  const rel = `${id}/${version}/${file}`;
  return { url: `${STORED_PREFIX}${rel}`, key: `${STORAGE_ROOT}${rel}` };
}

/** Storage key for a stored-asset URL path, or null when the path is not a stored asset. */
export function storageKeyOf(url: string): string | null {
  if (!url.startsWith(STORED_PREFIX)) return null;
  const rel = url.slice(STORED_PREFIX.length);
  if (!/^[a-z0-9][a-z0-9-]*\/\d+\/[A-Za-z0-9._-]+$/.test(rel) || rel.includes("..")) return null;
  return `${STORAGE_ROOT}${rel}`;
}
