/**
 * /studio/offer/{offerId} — the design a buyer attached to an offer, view-only. Only that buyer and the
 * offer's developer can open it (signed in); anyone else gets a 404, like a page that does not exist.
 */
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { verifyToken } from "@/lib/auth";
import { getExperience } from "@/lib/experience/getExperience";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE } from "@/lib/session";
import { studioEnabled } from "@/lib/studio/flags";
import type { DesignSnapshot } from "@/lib/studio/offerDesign";
import StudioClient from "../../[slug]/StudioClient";

export const dynamic = "force-dynamic";

export default async function OfferDesignPage({ params }: { params: Promise<{ offerId: string }> }) {
  if (!studioEnabled()) notFound();
  let userId: string | null = null;
  const jwt = (await cookies()).get(SESSION_COOKIE)?.value;
  if (jwt) { try { userId = verifyToken(jwt).userId; } catch { userId = null; } }
  if (!userId) notFound();
  const { offerId } = await params;
  const offer = await prisma.offer.findUnique({ where: { id: decodeURIComponent(offerId) }, select: { id: true, buyerId: true, developerId: true, designSnapshot: true } });
  if (!offer || !offer.designSnapshot || (offer.buyerId !== userId && offer.developerId !== userId)) notFound();
  const snap = offer.designSnapshot as unknown as DesignSnapshot;
  const experience = await getExperience(snap.baselineId);
  if (!experience) notFound();
  return <StudioClient experience={experience} offerId={offer.id} />;
}
