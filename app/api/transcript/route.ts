/**
 * POST /api/transcript
 *
 * Saves the assembled interview transcript for the authenticated buyer.
 * Body: { lines: Array<{ role: "user" | "agent", text: string, ts: number }> }
 * Returns: { transcriptId }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { transcriptSchema } from "@/lib/validation/matching";
import { zodError } from "@/lib/validation";

export async function POST(req: NextRequest) {
  const payload = extractToken(req.headers.get("Authorization"));
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsedBody = transcriptSchema.safeParse(rawBody);
  if (!parsedBody.success) return zodError(parsedBody.error);

  const transcript = await prisma.transcript.create({
    data: {
      buyerId: payload.userId,
      raw: JSON.stringify(parsedBody.data.lines),
    },
  });

  return NextResponse.json({ transcriptId: transcript.id });
}
