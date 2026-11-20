/**
 * THE lookup for a project's experience config. Server-only (reads files);
 * client components go through GET /api/experience?key=… (lib/experience/client.ts).
 *
 * Today: static files, public/projects/{slug}/experience.json.
 * TODO(db): once developers publish experiences from the upload flow, look the
 * project up in the database here first (by slug or project id) and fall back
 * to the static files. Callers never need to change.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { ProjectExperience } from "./types";

const ROOT = path.join(process.cwd(), "public", "projects");
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

async function readSlug(slug: string): Promise<ProjectExperience | null> {
  if (!SLUG.test(slug)) return null;
  let raw: string;
  try {
    raw = await readFile(path.join(ROOT, slug, "experience.json"), "utf8");
  } catch {
    return null;
  }
  const parsed = ProjectExperience.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    console.error(`[experience] public/projects/${slug}/experience.json is invalid:`, parsed.error.issues.slice(0, 5));
    return null;
  }
  if (parsed.data.slug !== slug) console.warn(`[experience] ${slug}: slug field says "${parsed.data.slug}"`);
  return parsed.data;
}

/**
 * Experience for a slug ("yarkon"), a project id ("seed-yarkon-towers") or any
 * other alias the config lists (e.g. the building photo URL). null when none.
 */
export async function getExperience(slugOrProjectId: string): Promise<ProjectExperience | null> {
  const key = slugOrProjectId.trim();
  if (!key) return null;
  const direct = await readSlug(key);
  if (direct) return direct;
  let slugs: string[] = [];
  try {
    slugs = (await readdir(ROOT, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return null;
  }
  for (const slug of slugs) {
    const exp = await readSlug(slug);
    if (exp?.aliases.includes(key)) return exp;
  }
  return null;
}
