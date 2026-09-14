/**
 * lib/inventory.ts — shared atomic offer-acceptance + inventory decrement.
 *
 * Used by both the developer respond route and the buyer respond route so the
 * same race-condition-safe logic runs regardless of which side triggers Accept.
 *
 * Pattern: single SQL UPDATE with WHERE quantityAvailable > 0 (atomic check +
 * decrement). If count === 0 another concurrent accept already took the last
 * unit — the whole transaction is rolled back and OUT_OF_STOCK is thrown.
 */

import { prisma } from "@/lib/prisma";

export class OutOfStockError extends Error {
  constructor() {
    super("OUT_OF_STOCK");
    this.name = "OutOfStockError";
  }
}

/**
 * Accepts an offer and atomically decrements the unit's inventory.
 * Deactivates the UnitType when stock reaches 0.
 * Throws OutOfStockError if no stock was available at the moment of accept.
 *
 * @param offerId    — the Offer.id to accept
 * @param unitTypeId — the associated UnitType.id
 * @param extraData  — optional extra fields to merge into the offer update (e.g. roundNumber)
 */
export async function atomicAcceptOffer(
  offerId: string,
  unitTypeId: string,
  extraData: Record<string, unknown> = {}
): Promise<Awaited<ReturnType<typeof prisma.offer.update>>> {
  return prisma.$transaction(async (tx) => {
    // Atomic conditional decrement: one SQL UPDATE, no separate SELECT.
    const decrement = await tx.unitType.updateMany({
      where: {
        id: unitTypeId,
        quantityAvailable: { gt: 0 },
      },
      data: { quantityAvailable: { decrement: 1 } },
    });

    if (decrement.count === 0) {
      throw new OutOfStockError();
    }

    // Check post-decrement value to deactivate if sold out.
    const unit = await tx.unitType.findUnique({
      where: { id: unitTypeId },
      select: { quantityAvailable: true },
    });

    if (unit?.quantityAvailable === 0) {
      await tx.unitType.update({
        where: { id: unitTypeId },
        data: { active: false },
      });
    }

    // Accept the offer in the same transaction.
    return tx.offer.update({
      where: { id: offerId },
      data: { status: "accepted", ...extraData },
    });
  });
}
