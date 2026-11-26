/**
 * A buyer's Design Studio design is private to them. It reaches a developer only when the buyer
 * attaches it to an offer: the design is COPIED onto the offer (Offer.designSnapshot), so later edits
 * by the buyer do not change what the developer was shown, and nothing else is ever shared.
 */
import { getExperience } from "@/lib/experience/getExperience";
import { DesignDocument } from "./schema/document";
import { getRepo } from "./persist/repo";

export interface DesignSnapshot {
  /** The studio apartment the design was made in (e.g. "ut-demo-rotem-shell"). */
  baselineId: string;
  name: string;
  pieces: number;
  attachedAt: string;
  data: DesignDocument;
}

/** The studio apartments a listing's tour can lead to, in the order the tour page looks them up. */
export function studioCandidates(exp: { slug: string; studio?: string }): string[] {
  return [...new Set([exp.studio, exp.slug, `${exp.slug}-shell`].filter((s): s is string => !!s))];
}

/** The buyer's most recently edited design for the listing's apartment, or null when they have none. */
export async function latestDesignFor(userId: string, unitTypeId: string): Promise<DesignSnapshot | null> {
  const exp = await getExperience(unitTypeId);
  if (!exp) return null;
  const repo = await getRepo();
  let best: { id: string; updatedAt: string; baselineId: string } | null = null;
  for (const baselineId of studioCandidates(exp)) {
    for (const d of await repo.list(userId, baselineId)) if (!best || d.updatedAt > best.updatedAt) best = { id: d.id, updatedAt: d.updatedAt, baselineId };
  }
  if (!best) return null;
  const rec = await repo.get(best.id);
  if (!rec || rec.ownerId !== userId) return null;
  const pieces = Object.keys(rec.data.nodes).length;
  if (pieces === 0) return null; // an untouched empty apartment is not worth attaching
  return { baselineId: best.baselineId, name: rec.name, pieces, attachedAt: new Date().toISOString(), data: rec.data };
}
