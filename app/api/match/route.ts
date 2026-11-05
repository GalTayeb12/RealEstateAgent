/**
 * POST /api/match
 *
 * Body:
 * {
 *   buyerProfile: { expectedScore: number, minAcceptanceScore: number },
 *   unitTypeIds?: string[]   // optional filter; omit to match against ALL active unit types
 * }
 *
 * Returns ranked MatchOutcome[] plus chain integrity status.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { matchBuyerToAoms, BuyerProfile, AomCandidate, checkHardFilters, HardFilterCriteria } from "@/lib/matching";
import { appendBlock, verifyAllChains } from "@/lib/ledger";
import { matchSchema } from "@/lib/validation/matching";
import { zodError } from "@/lib/validation";
import { parseAttributes } from "@/lib/attributes";

export async function POST(req: NextRequest) {
  try {
    const auth = extractToken(req.headers.get("authorization"));
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = await req.json();
    const parsedBody = matchSchema.safeParse(rawBody);
    if (!parsedBody.success) return zodError(parsedBody.error);
    const { buyerProfile, unitTypeIds, aomIds } = parsedBody.data as {
      buyerProfile: BuyerProfile;
      unitTypeIds?: string[];
      aomIds?: string[];
    };

    const idFilter = unitTypeIds ?? aomIds;

    // Fetch buyer profile preferences for hard filter criteria
    const buyerProfileRow = await prisma.buyerProfile.findUnique({
      where: { userId: auth.userId },
      select: { preferences: true },
    });

    let hardCriteria: HardFilterCriteria = {};
    if (buyerProfileRow?.preferences) {
      try {
        const prefs = JSON.parse(buyerProfileRow.preferences) as Record<string, unknown>;
        hardCriteria = {
          minRooms:  typeof prefs.bedrooms   === "number" ? prefs.bedrooms   : null,
          maxBudget: typeof prefs.budget_max === "number" ? prefs.budget_max : null,
          location:  typeof prefs.location   === "string" ? prefs.location   : null,
        };
      } catch {
        // Malformed preferences — no hard filters
      }
    }

    const listings = await prisma.unitType.findMany({
      where: {
        active: true,
        ...(idFilter?.length ? { id: { in: idFilter } } : {}),
      },
      include: {
        project: { select: { name: true, location: true } },
      },
    });

    if (listings.length === 0) {
      return NextResponse.json(
        { error: "No active listings found" },
        { status: 404 }
      );
    }

    const candidates: AomCandidate[] = listings.map((l) => ({
      id: l.id,
      title: `${l.project.name} — ${l.unitLabel}`,
      eil: l.eil,
      ail: l.ail,
      price: l.price,
      location: l.project.location || undefined,
      attributes: parseAttributes(l.attributes),
    }));

    const rawRanked = matchBuyerToAoms(buyerProfile, candidates);

    // Apply hard requirement filters (rooms, budget, area) on top of Zij
    const ranked = rawRanked.map((outcome) => {
      const candidate = candidates.find((c) => c.id === outcome.aomId);
      if (!candidate) return outcome;
      const { passes, reasons } = checkHardFilters(candidate, hardCriteria);
      return { ...outcome, passesHardFilters: passes, hardFilterFailReasons: reasons };
    });

    await Promise.all([
      appendBlock("buyer", {
        event: "match_request",
        buyerId: auth.userId,
        buyerProfile,
        timestamp: new Date().toISOString(),
      }),
      appendBlock("seller", {
        event: "unit_types_evaluated",
        unitTypeIds: candidates.map((c) => c.id),
        timestamp: new Date().toISOString(),
      }),
      appendBlock("aom_rating", {
        event: "ratings_written",
        buyerId: auth.userId,
        results: ranked.map((r) => ({
          unitTypeId: r.aomId,
          pfij: r.pfij,
          zij: r.zij,
          valid: r.valid,
        })),
        timestamp: new Date().toISOString(),
      }),
    ]);

    const validMatches = ranked.filter((r) => r.valid);
    if (validMatches.length > 0) {
      await prisma.matchResult.createMany({
        data: validMatches.map((r) => ({
          buyerId: auth.userId,
          unitTypeId: r.aomId,
          pfij: r.pfij,
          zij: r.zij,
          valid: r.valid,
        })),
      });
    }

    const chainStatus = await verifyAllChains();

    return NextResponse.json({
      ranked,
      validCount: validMatches.length,
      totalCandidates: candidates.length,
      chainIntegrity: chainStatus,
    });
  } catch (err) {
    console.error("[match POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
