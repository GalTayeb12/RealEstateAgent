/**
 * /admin/catalog - the Design Studio catalog admin (M11): import drafts, run the publish gates, publish,
 * retire, and see every numbered release. Studio flag + role "admin" only; anything else is a 404.
 */
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { verifyToken } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session";
import { studioEnabled } from "@/lib/studio/flags";
import CatalogAdmin from "@/components/studio/admin/CatalogAdmin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Catalog admin · HAVENIQ Design Studio", robots: { index: false } };

export default async function CatalogAdminPage() {
  let role: string | null = null;
  const jwt = (await cookies()).get(SESSION_COOKIE)?.value;
  if (jwt) {
    try { role = verifyToken(jwt).role; } catch { role = null; }
  }
  if (!studioEnabled() || role !== "admin") notFound();
  return <CatalogAdmin />;
}
