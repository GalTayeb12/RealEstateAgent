/** Which of these offers carry an attached design. Lists never ship the design itself (it is large and private). */
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export async function withDesignFlag<T extends { id: string }>(offers: T[]): Promise<(T & { hasDesign: boolean })[]> {
  if (!offers.length) return [];
  const rows = await prisma.offer.findMany({ where: { id: { in: offers.map((o) => o.id) }, designSnapshot: { not: Prisma.DbNull } }, select: { id: true } });
  const have = new Set(rows.map((r) => r.id));
  return offers.map((o) => ({ ...o, hasDesign: have.has(o.id) }));
}
