/**
 * Hash-chained ledger backed by the `LedgerBlock` database table (patent § 3.6).
 *
 * Three independent chain instances mirror the patent's three-blockchain structure:
 *   - "buyer"      — buyer preference entries
 *   - "seller"     — seller / AOM preference entries
 *   - "aom_rating" — AOM match-point (rating) entries
 *
 * Block shape:
 *   { index, timestamp, data, previousHash, hash }
 *
 * The hash is SHA-256 of:
 *   index + timestamp + JSON(data) + previousHash
 *
 * All state lives in the database — no in-memory arrays. This means chain
 * history survives server restarts. The trade-off is that every read/write
 * is a DB round-trip (acceptable for the current traffic profile).
 *
 * No direct buyer↔seller channel — all data flows through the matching engine
 * before being committed, per the patent's constraint.
 */

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

export type ChainName = "buyer" | "seller" | "aom_rating";

export interface Block {
  index: number;
  timestamp: string; // ISO-8601
  data: unknown;
  previousHash: string;
  hash: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function computeHash(
  index: number,
  timestamp: string,
  data: unknown,
  previousHash: string
): string {
  return sha256(`${index}${timestamp}${JSON.stringify(data)}${previousHash}`);
}

const GENESIS_HASH = "0".repeat(64);

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Append a new block to the named chain and persist it to the database.
 * Reads the current chain tail from the DB to determine index and previousHash.
 */
export async function appendBlock(chain: ChainName, data: unknown): Promise<Block> {
  const last = await prisma.ledgerBlock.findFirst({
    where: { chain },
    orderBy: { index: "desc" },
  });

  const index = last ? last.index + 1 : 0;
  const timestamp = new Date().toISOString();
  const previousHash = last ? last.hash : GENESIS_HASH;

  const hash = computeHash(index, timestamp, data, previousHash);

  await prisma.ledgerBlock.create({
    data: {
      chain,
      index,
      timestamp: new Date(timestamp),
      data: JSON.stringify(data),
      previousHash,
      hash,
    },
  });

  return { index, timestamp, data, previousHash, hash };
}

/**
 * Return all blocks for a chain (ordered by index), read from the database.
 */
export async function getChain(chain: ChainName): Promise<Block[]> {
  const rows = await prisma.ledgerBlock.findMany({
    where: { chain },
    orderBy: { index: "asc" },
  });

  return rows.map((row) => ({
    index: row.index,
    timestamp: row.timestamp.toISOString(),
    data: JSON.parse(row.data),
    previousHash: row.previousHash,
    hash: row.hash,
  }));
}

/**
 * Verify the integrity of a chain by re-computing every hash and
 * checking the previousHash linkage against data read from the database.
 *
 * Returns { valid: true } or { valid: false, reason, blockIndex }.
 */
export async function verifyChain(
  chain: ChainName
): Promise<{ valid: true } | { valid: false; reason: string; blockIndex: number }> {
  const blocks = await getChain(chain);

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    const expected = computeHash(
      block.index,
      block.timestamp,
      block.data,
      block.previousHash
    );
    if (block.hash !== expected) {
      return {
        valid: false,
        reason: `Block ${i} hash mismatch (data tampered)`,
        blockIndex: i,
      };
    }

    const expectedPrevious = i === 0 ? GENESIS_HASH : blocks[i - 1].hash;
    if (block.previousHash !== expectedPrevious) {
      return {
        valid: false,
        reason: `Block ${i} previousHash does not match block ${i - 1} hash`,
        blockIndex: i,
      };
    }
  }

  return { valid: true };
}

/**
 * Verify all three chains at once (parallel DB reads).
 */
export async function verifyAllChains(): Promise<
  Record<
    ChainName,
    { valid: true } | { valid: false; reason: string; blockIndex: number }
  >
> {
  const [buyer, seller, aom_rating] = await Promise.all([
    verifyChain("buyer"),
    verifyChain("seller"),
    verifyChain("aom_rating"),
  ]);
  return { buyer, seller, aom_rating };
}

/**
 * Delete all ledger blocks from the database (used in tests only).
 */
export async function resetChains(): Promise<void> {
  await prisma.ledgerBlock.deleteMany({});
}
