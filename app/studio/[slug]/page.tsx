/**
 * /studio/{slug} — HAVENIQ Design Studio. Dark by default: it needs
 * STUDIO_ENABLED=1 and a signed-in role on the allowlist (lib/studio/flags.ts),
 * otherwise it answers 404 exactly like a page that does not exist.
 */
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { verifyToken } from "@/lib/auth";
import { getExperience } from "@/lib/experience/getExperience";
import { SESSION_COOKIE } from "@/lib/session";
import { studioAccess } from "@/lib/studio/flags";
import StudioClient from "./StudioClient";

export const dynamic = "force-dynamic";

export default async function StudioPage({ params }: { params: Promise<{ slug: string }> }) {
  let role: string | null = null;
  const jwt = (await cookies()).get(SESSION_COOKIE)?.value;
  if (jwt) {
    try { role = verifyToken(jwt).role; } catch { role = null; }
  }
  if (!studioAccess(role).allowed) notFound();

  const { slug } = await params;
  const experience = await getExperience(decodeURIComponent(slug));
  if (!experience) notFound();
  return <StudioClient experience={experience} />;
}
