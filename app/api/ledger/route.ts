/**
 * GET /api/ledger?chain=buyer|seller|aom_rating
 *
 * Returns the full block list for a chain + its integrity status.
 */
import { NextRequest, NextResponse } from "next/server";
import { getChain, verifyChain, ChainName } from "@/lib/ledger";
import { ledgerQuerySchema } from "@/lib/validation/admin";
import { zodError } from "@/lib/validation";
import { requireAdmin } from "@/lib/adminAuth";

const VALID_CHAINS: ChainName[] = ["buyer", "seller", "aom_rating"];

export async function GET(req: NextRequest) {
  // The chains hold buyer profiles and ratings: admin only.
  const guard = requireAdmin(req);
  if (!guard.ok) return guard.response;
  const { searchParams } = new URL(req.url);
  const parsedQuery = ledgerQuerySchema.safeParse({ chain: searchParams.get("chain") ?? undefined });
  if (!parsedQuery.success) return zodError(parsedQuery.error);
  const chain = parsedQuery.data.chain;

  if (!chain) {
    // Return all chains in parallel
    const results = await Promise.all(
      VALID_CHAINS.map(async (c) => {
        const [blocks, integrity] = await Promise.all([getChain(c), verifyChain(c)]);
        return [c, { blocks, integrity }] as const;
      })
    );
    return NextResponse.json({ chains: Object.fromEntries(results) });
  }

  const [blocks, integrity] = await Promise.all([
    getChain(chain as ChainName),
    verifyChain(chain as ChainName),
  ]);

  return NextResponse.json({ chain, blocks, integrity });
}
