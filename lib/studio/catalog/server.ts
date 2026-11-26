/**
 * Server side of the admin catalog: the registry on the Storage driver, its gate runner (static gates
 * + the asset files themselves), and the catalog the studio loads.
 *
 * On first use the registry seeds release 1 from the repository snapshot (public/studio/catalog/
 * index.json, published by the CLI with the same gates). Node only.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { getStorage } from "../../storage";
import { StorageKv } from "../persist/kv";
import { MaterialManifest, ModelManifest } from "../schema/catalog";
import { STATIC_BASE, storageKeyOf } from "./assets";
import { glbGates, staticGates, type Manifest } from "./gates";
import { browsable, CatalogRegistry, type Release } from "./registry";

const PUBLIC = path.join(process.cwd(), "public");

/** Bytes of a catalog asset, wherever it lives (stored upload or static repository file). */
export async function readAsset(url: string): Promise<Buffer | null> {
  const key = storageKeyOf(url);
  if (key) return getStorage().get(key);
  if (!url.startsWith(`${STATIC_BASE}/`) || url.includes("..")) return null;
  try { return await fs.readFile(path.join(PUBLIC, ...url.split("/").filter(Boolean))); } catch { return null; }
}

const modelUrl = (p: string) => (p.startsWith("/") ? p : `${STATIC_BASE}/${p}`);
const mapUrl = (m: { id: string; version: number }, f: string) => (f.startsWith("/") ? f : `${STATIC_BASE}/${m.id}/${m.version}/${f}`);

/** All gates for one manifest: static gates, every referenced file present, GLB geometry gates. */
export async function runGates(m: Manifest): Promise<string[]> {
  const out = [...staticGates(m)];
  if (m.type === "material") {
    for (const f of Object.values(m.pbr.maps).filter((x): x is string => !!x)) {
      if (!(await readAsset(mapUrl(m, f)))) out.push(`missing texture ${f}`);
    }
    return out;
  }
  if (!(await readAsset(modelUrl(m.assets.preview)))) out.push(`missing preview ${m.assets.preview}`);
  if (m.assets.glb) {
    const bytes = await readAsset(modelUrl(m.assets.glb));
    if (!bytes) out.push(`missing GLB ${m.assets.glb}`);
    else out.push(...(await glbGates(m, bytes)));
  }
  return out;
}

async function repositorySnapshot() {
  const raw = JSON.parse(await fs.readFile(path.join(PUBLIC, "studio", "catalog", "index.json"), "utf8")) as { models: unknown[]; materials: unknown[] };
  return { models: raw.models.map((m) => ModelManifest.parse(m)), materials: raw.materials.map((m) => MaterialManifest.parse(m)) };
}

let registry: CatalogRegistry | null = null;
let seeding: Promise<unknown> | null = null;

/** The registry, seeded from the repository snapshot the first time it is empty. */
export async function getRegistry(): Promise<CatalogRegistry> {
  registry ??= new CatalogRegistry(new StorageKv(getStorage(), "studio/catalog-kv"), runGates);
  seeding ??= (async () => {
    if ((await registry!.head()) === 0) await registry!.sync(await repositorySnapshot(), "system", "seeded from the repository catalog");
  })();
  await seeding;
  return registry;
}

/** Imports repository manifests the registry does not have yet (after a CLI publish). */
export async function syncRepository(by: string) {
  return (await getRegistry()).sync(await repositorySnapshot(), by);
}

export type StudioCatalog = Pick<Release, "release" | "publishedAt" | "models" | "materials" | "retired">;

/** What the studio and the AI designer use: the latest release (repository snapshot if the store fails). */
export async function currentCatalog(): Promise<StudioCatalog> {
  try {
    const r = await (await getRegistry()).release();
    if (r) return { release: r.release, publishedAt: r.publishedAt, models: r.models, materials: r.materials, retired: r.retired };
  } catch (e) {
    console.error("[studio/catalog] registry unavailable, serving the repository snapshot", e);
  }
  const snap = await repositorySnapshot();
  return { release: 0, publishedAt: "", ...snap, retired: [] };
}

/** Only what may be browsed or proposed (retired entries stay resolvable but are hidden). */
export function browsableCatalog(c: StudioCatalog) {
  return { models: browsable(c.models, c.retired), materials: browsable(c.materials, c.retired) };
}
