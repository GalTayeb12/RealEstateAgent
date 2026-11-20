/**
 * /walk/{slug} — first-person walkthrough of a project's apartment, configured
 * by its experience (lib/experience). /walk/yarkon is the Seed Yarkon demo.
 * The slug may also be a project id or alias; those redirect to the canonical slug.
 */
import { notFound, redirect } from "next/navigation";
import { getExperience } from "@/lib/experience/getExperience";
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
  return <WalkClient experience={experience} />;
}
