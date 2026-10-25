/**
 * Inventory for UnitType quantity and for individual Units.
 *
 * Seller listings (no Unit rows) still decrement quantityAvailable atomically.
 * Developer apartments reserve a specific Unit with
 * UPDATE ... WHERE status = 'available'. A second buyer gets UnitTakenError.
 * Both signatures in the Deal Room move reserved → sold.
 * Cancelling an unsigned deal moves it back to available.
 * quantityAvailable counts only status = available, and is rewritten from Units.
 */

import { prisma } from "@/lib/prisma";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export class OutOfStockError extends Error {
  constructor() {
    super("OUT_OF_STOCK");
    this.name = "OutOfStockError";
  }
}

export class UnitTakenError extends Error {
  constructor() {
    super("UNIT_JUST_RESERVED");
    this.name = "UnitTakenError";
  }
}

export async function syncUnitTypeInventory(tx: Tx, unitTypeId: string) {
  const rows = await tx.unit.findMany({
    where: { unitTypeId },
    select: { status: true },
  });
  if (rows.length === 0) return;

  const available = rows.filter((row) => row.status === "available").length;
  await tx.unitType.update({
    where: { id: unitTypeId },
    data: {
      quantityTotal: rows.length,
      quantityAvailable: available,
      active: available > 0,
    },
  });
}

async function reserveSpecific(tx: Tx, unitTypeId: string, unitId: string) {
  const claimed = await tx.unit.updateMany({
    where: { id: unitId, unitTypeId, status: "available" },
    data: { status: "reserved" },
  });
  if (claimed.count !== 1) throw new UnitTakenError();
  const unit = await tx.unit.findUnique({
    where: { id: unitId },
    select: { id: true, price: true },
  });
  if (!unit) throw new UnitTakenError();
  return unit;
}

async function reserveCheapestAvailable(tx: Tx, unitTypeId: string) {
  const type = await tx.unitType.findUnique({
    where: { id: unitTypeId },
    select: { price: true },
  });
  const base = type?.price ?? 0;
  const candidates = await tx.unit.findMany({
    where: { unitTypeId, status: "available" },
    select: { id: true, price: true, floor: true, positionIndex: true },
  });
  candidates.sort((a, b) => {
    const priceDelta = (a.price ?? base) - (b.price ?? base);
    if (priceDelta !== 0) return priceDelta;
    if (a.floor !== b.floor) return a.floor - b.floor;
    return a.positionIndex - b.positionIndex;
  });

  for (const candidate of candidates) {
    const claimed = await tx.unit.updateMany({
      where: { id: candidate.id, status: "available" },
      data: { status: "reserved" },
    });
    if (claimed.count === 1) {
      return { id: candidate.id, price: candidate.price };
    }
  }
  throw new OutOfStockError();
}

/**
 * Accepts an offer. When the listing has Units, one apartment is reserved.
 * Otherwise the legacy quantity decrement runs.
 */
export async function atomicAcceptOffer(
  offerId: string,
  unitTypeId: string,
  extraData: Record<string, unknown> = {},
  unitId?: string | null
): Promise<Awaited<ReturnType<typeof prisma.offer.update>>> {
  return prisma.$transaction(async (tx) => {
    const unitCount = await tx.unit.count({ where: { unitTypeId } });

    if (unitCount > 0) {
      const reserved = unitId
        ? await reserveSpecific(tx, unitTypeId, unitId)
        : await reserveCheapestAvailable(tx, unitTypeId);

      const type = await tx.unitType.findUnique({
        where: { id: unitTypeId },
        select: { price: true },
      });
      await syncUnitTypeInventory(tx, unitTypeId);

      return tx.offer.update({
        where: { id: offerId },
        data: {
          status: "accepted",
          unitId: reserved.id,
          offeredPrice: reserved.price ?? type?.price ?? 0,
          ...extraData,
        },
      });
    }

    const decrement = await tx.unitType.updateMany({
      where: { id: unitTypeId, quantityAvailable: { gt: 0 } },
      data: { quantityAvailable: { decrement: 1 } },
    });
    if (decrement.count === 0) throw new OutOfStockError();

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

    return tx.offer.update({
      where: { id: offerId },
      data: { status: "accepted", ...extraData },
    });
  });
}

/** Reserved apartment becomes sold once both parties have signed. */
export async function markReservedUnitSold(offerId: string) {
  await prisma.$transaction(async (tx) => {
    const offer = await tx.offer.findUnique({
      where: { id: offerId },
      select: {
        unitId: true,
        unitTypeId: true,
        buyerSignature: true,
        developerSignature: true,
      },
    });
    if (!offer?.unitId) return;
    if (!offer.buyerSignature || !offer.developerSignature) return;

    await tx.unit.updateMany({
      where: { id: offer.unitId, status: "reserved" },
      data: { status: "sold" },
    });
    await syncUnitTypeInventory(tx, offer.unitTypeId);
  });
}

/**
 * Returns a reserved apartment to available and marks the offer cancelled.
 * Refuses once both parties have signed.
 *
 * TODO: automatically release a reservation whose deposit has not been paid
 * within X days. X is a product setting. Do not build the scheduler yet.
 */
export async function releaseReservedUnit(offerId: string) {
  await prisma.$transaction(async (tx) => {
    const offer = await tx.offer.findUnique({
      where: { id: offerId },
      select: {
        unitId: true,
        unitTypeId: true,
        status: true,
        buyerSignature: true,
        developerSignature: true,
      },
    });
    if (!offer || offer.status !== "accepted") return;
    if (offer.buyerSignature && offer.developerSignature) {
      throw new Error("DEAL_ALREADY_SIGNED");
    }

    if (offer.unitId) {
      await tx.unit.updateMany({
        where: { id: offer.unitId, status: "reserved" },
        data: { status: "available" },
      });
      await syncUnitTypeInventory(tx, offer.unitTypeId);
    }

    await tx.offer.update({
      where: { id: offerId },
      data: { status: "cancelled" },
    });
  });
}
