/**
 * GET /api/liveavatar/transcript?sessionId=
 *
 * Fetches the LiveAvatar session transcript as a fallback when the LiveKit
 * data channel did not deliver lines to the client.
 */
import { NextRequest, NextResponse } from "next/server";
import { extractToken } from "@/lib/auth";
import { LIVEAVATAR_BASE, mapLiveAvatarTranscript } from "@/lib/liveavatar";

const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY ?? "";

export async function GET(req: NextRequest) {
  const payload = extractToken(req.headers.get("authorization"));
  if (!payload || payload.role !== "buyer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionId = req.nextUrl.searchParams.get("sessionId")?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }
  if (!HEYGEN_API_KEY) {
    return NextResponse.json({ error: "Missing API key configuration" }, { status: 500 });
  }

  const res = await fetch(
    `${LIVEAVATAR_BASE}/v1/sessions/${encodeURIComponent(sessionId)}/transcript`,
    { headers: { "X-API-KEY": HEYGEN_API_KEY } }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error("LiveAvatar transcript failed:", res.status, text);
    return NextResponse.json({ error: "Failed to fetch session transcript" }, { status: 502 });
  }

  const body = await res.json();
  const data = body.data ?? body;
  const raw = Array.isArray(data.transcript_data) ? data.transcript_data : [];
  return NextResponse.json({ lines: mapLiveAvatarTranscript(raw) });
}
