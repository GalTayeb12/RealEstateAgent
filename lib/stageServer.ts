/**
 * Server side of lib/stage.ts: reads and re-saves a project's stage marking in
 * file storage so it follows the buildings (see reconcileMeta).
 */
import { getStorage } from "@/lib/storage";
import { PhotoMeta } from "@/lib/experience/types";
import { cleanMeta, reconcileMeta, stageKey, type StageBuilding } from "@/lib/stage";

export async function readStageMeta(projectId: string): Promise<PhotoMeta | null> {
  const raw = await getStorage().get(stageKey(projectId, "on.json"));
  if (!raw) return null;
  const parsed = PhotoMeta.safeParse(JSON.parse(raw.toString("utf8")));
  return parsed.success ? parsed.data : null;
}

/** Re-space floor lines and apartment dots when building sizes changed. Returns the (possibly new) marking. */
export async function syncStageToBuildings(projectId: string, buildings: StageBuilding[]): Promise<PhotoMeta | null> {
  const meta = await readStageMeta(projectId);
  if (!meta) return null;
  const { meta: next, changed } = reconcileMeta(meta, buildings);
  if (!changed) return meta;
  const clean = cleanMeta(next);
  await getStorage().put(stageKey(projectId, "on.json"), new TextEncoder().encode(JSON.stringify(clean)), { contentType: "application/json" });
  return clean;
}
