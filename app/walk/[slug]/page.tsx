/**
 * /walk/{slug} — first-person walkthrough of a project's apartment, configured
 * by its experience (lib/experience). /walk/yarkon is the Seed Yarkon demo.
 * The slug may also be a project id or alias; those redirect to the canonical slug.
 */
import { notFound, redirect } from "next/navigation";
import fs from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { getExperience } from "@/lib/experience/getExperience";
import { SESSION_COOKIE } from "@/lib/session";
import { studioAccess } from "@/lib/studio/flags";
import WalkClient from "./WalkClient";

export default async function WalkPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const key = decodeURIComponent(slug);
  const experience = await getExperience(key);
  if (!experience) notFound();
  if (experience.slug !== key) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(await searchParams)) {
      for (const one of Array.isArray(v) ? v : v === undefined ? [] : [v]) q.append(k, one);
    }
    const qs = q.toString();
    redirect(`/walk/${experience.slug}${qs ? `?${qs}` : ""}`);
  }
  // A link into the Design Studio for people who may use it (flag + role), only for an apartment that has a studio build.
  let role: string | null = null;
  const jwt = (await cookies()).get(SESSION_COOKIE)?.value;
  if (jwt) {
    try { role = verifyToken(jwt).role; } catch { role = null; }
  }
  let studioHref: string | undefined;
  if (studioAccess(role).allowed) {
    const has = (slug: string) => fs.existsSync(path.join(process.cwd(), "public", "walk", slug, "baseline.json"));
    const target = experience.studio ?? (has(experience.slug) ? experience.slug : undefined);
    if (target && has(target)) studioHref = `/studio/${target}`;
  }
  return <WalkClient experience={experience} studioHref={studioHref} />;
}
