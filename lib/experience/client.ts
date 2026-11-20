/**
 * Browser side of the experience lookup: same keys as getExperience
 * (slug, project id, alias), fetched from /api/experience and cached per key.
 */
import { type PhotoMeta, type ProjectExperience, readPhotoMeta } from "./types";

const cache = new Map<string, Promise<ProjectExperience | null>>();

export function fetchExperience(key: string): Promise<ProjectExperience | null> {
  let p = cache.get(key);
  if (!p) {
    p = fetch(`/api/experience?key=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { experience?: ProjectExperience } | null) => j?.experience ?? null)
      .catch(() => null);
    cache.set(key, p);
  }
  return p;
}

/**
 * Meta for the building photo stage: the project's experience config when one
 * lists this photo, else the legacy JSON next to the photo (on.webp → on.json).
 */
export async function loadPhotoStage(photoUrl: string, defaultAspect: number): Promise<{ meta: PhotoMeta | null; experience: ProjectExperience | null }> {
  const experience = await fetchExperience(photoUrl);
  if (experience?.photoStage) return { meta: readPhotoMeta(experience.photoStage, defaultAspect), experience };
  const legacy = await fetch(photoUrl.replace(/\.[a-z0-9]+$/i, ".json"))
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return { meta: readPhotoMeta(legacy, defaultAspect), experience };
}
