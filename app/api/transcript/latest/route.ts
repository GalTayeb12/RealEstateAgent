/**
 * GET /api/transcript/latest
 *
 * Returns the most recent transcript for the authenticated buyer.
 * Used by the /processing dev shortcut button.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const transcript = await prisma.transcript.findFirst({
    where: { buyerId: auth.userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true },
  });

  if (!transcript) {
    return NextResponse.json({ error: "No transcripts found" }, { status: 404 });
  }

  return NextResponse.json({ transcriptId: transcript.id, createdAt: transcript.createdAt });
}
