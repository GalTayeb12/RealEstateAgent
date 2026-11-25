/**
 * /studio/shared/{token} — open a design someone shared. No login is needed;
 * the unguessable link is the permission (view-only or edit, chosen by the
 * owner, revocable). The studio flag must still be on, otherwise it is a 404.
 */
import { notFound } from "next/navigation";
import { getExperience } from "@/lib/experience/getExperience";
import { studioEnabled } from "@/lib/studio/flags";
import { getRepo } from "@/lib/studio/persist/repo";
import StudioClient from "../../[slug]/StudioClient";

export const dynamic = "force-dynamic";

export default async function SharedStudioPage({ params }: { params: Promise<{ token: string }> }) {
  if (!studioEnabled()) notFound();
  const { token } = await params;
  const shared = await (await getRepo()).resolveShare(decodeURIComponent(token));
  if (!shared) notFound();
  const experience = await getExperience(shared.design.baselineId);
  if (!experience) notFound();
  return <StudioClient experience={experience} sharedToken={decodeURIComponent(token)} />;
}
