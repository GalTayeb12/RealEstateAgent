/**
 * POST /api/liveavatar/stop
 *
 * Ends a LiveAvatar session so the avatar worker stops billing.
 * Body: { sessionId: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { extractToken } from "@/lib/auth";
import { LIVEAVATAR_BASE } from "@/lib/liveavatar";

const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY ?? "";

export async function POST(req: NextRequest) {
  const payload = extractToken(req.headers.get("authorization"));
  if (!payload || payload.role !== "buyer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let sessionId = "";
  try {
    const body = (await req.json()) as { sessionId?: string };
    sessionId = body.sessionId?.trim() ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }
  if (!HEYGEN_API_KEY) {
    return NextResponse.json({ error: "Missing API key configuration" }, { status: 500 });
  }

  const res = await fetch(`${LIVEAVATAR_BASE}/v1/sessions/stop`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": HEYGEN_API_KEY,
    },
    body: JSON.stringify({ session_id: sessionId, reason: "USER_CLOSED" }),
  });

  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    console.error("LiveAvatar stop failed:", res.status, text);
    return NextResponse.json({ error: "Failed to stop session" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
