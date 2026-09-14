/**
 * POST /api/liveavatar/session
 *
 * Server-only route — never exposes HEYGEN_API_KEY or ELEVENLABS_API_KEY to the browser.
 *
 * Flow:
 *   1. Look up cached ElevenLabs secret_id in DB; register it with LiveAvatar if absent.
 *   2. Create a LITE session token (POST /v1/sessions/token).
 *   3. Start the session (POST /v1/sessions/start with Bearer token).
 *   4. Return { livekit_url, livekit_client_token, session_id } to the client.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";

const LIVEAVATAR_BASE = "https://api.liveavatar.com";
const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY ?? "";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? "";
const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID ?? "";
const LIVEAVATAR_AVATAR_ID = process.env.HEYGEN_AVATAR_ID ?? "";

const MAX_ATTEMPTS_PER_DAY = 2;
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours rolling

export async function POST(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const payload = extractToken(req.headers.get("authorization"));
    if (!payload || payload.role !== "buyer") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Rate limit: max 2 sessions per rolling 24 h ───────────────────────
    const since = new Date(Date.now() - WINDOW_MS);
    const recentAttempts = await prisma.interviewAttempt.findMany({
      where: { userId: payload.userId, startedAt: { gte: since } },
      orderBy: { startedAt: "asc" },
      select: { startedAt: true },
    });

    if (recentAttempts.length >= MAX_ATTEMPTS_PER_DAY) {
      const nextAvailableAt = new Date(
        recentAttempts[0].startedAt.getTime() + WINDOW_MS
      ).toISOString();
      return NextResponse.json(
        {
          error: `You've reached today's interview limit (${MAX_ATTEMPTS_PER_DAY}). Try again later.`,
          nextAvailableAt,
        },
        { status: 429 }
      );
    }

    // Record this attempt immediately — counts even if external APIs fail,
    // to prevent abuse where users repeatedly retry to get free quota resets.
    await prisma.interviewAttempt.create({
      data: { userId: payload.userId },
    });

    if (!HEYGEN_API_KEY || !ELEVENLABS_API_KEY || !ELEVENLABS_AGENT_ID) {
      return NextResponse.json(
        { error: "Missing API key configuration" },
        { status: 500 }
      );
    }

    // ── Step 1: Retrieve or register the ElevenLabs secret ────────────────
    let secretId: string;

    const cached = await prisma.liveAvatarSecret.findUnique({
      where: { id: "singleton" },
    });

    if (cached) {
      secretId = cached.secretId;
    } else {
      const secretRes = await fetch(`${LIVEAVATAR_BASE}/v1/secrets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": HEYGEN_API_KEY,
        },
        body: JSON.stringify({
          secret_type: "ELEVENLABS_API_KEY",
          secret_value: ELEVENLABS_API_KEY,
          secret_name: "aom-platform-elevenlabs",
        }),
      });

      if (!secretRes.ok) {
        const text = await secretRes.text();
        console.error("LiveAvatar /v1/secrets failed:", secretRes.status, text);
        return NextResponse.json(
          { error: "Failed to register ElevenLabs secret with LiveAvatar" },
          { status: 502 }
        );
      }

      const secretData = await secretRes.json();
      secretId = secretData.secret_id ?? secretData.data?.secret_id ?? secretData.data?.id;

      if (!secretId) {
        console.error("LiveAvatar /v1/secrets: unexpected response shape:", JSON.stringify(secretData));
        return NextResponse.json(
          { error: "LiveAvatar did not return a secret_id" },
          { status: 502 }
        );
      }

      await prisma.liveAvatarSecret.upsert({
        where: { id: "singleton" },
        create: { id: "singleton", secretId },
        update: { secretId },
      });
    }

    // ── Step 2: Create a LITE session token ───────────────────────────────
    // LITE mode embeds ElevenLabs config inline via elevenlabs_agent_config.
    // FULL mode only accepts a reference to a pre-stored voice agent UUID — not applicable here.
    const tokenBody: Record<string, unknown> = {
      mode: "LITE",
      avatar_id: LIVEAVATAR_AVATAR_ID || undefined,
      video_settings: { encoding: "H264", quality: "high" },
      elevenlabs_agent_config: {
        secret_id: secretId,
        agent_id: ELEVENLABS_AGENT_ID,
      },
    };
    console.log("LiveAvatar /v1/sessions/token body:", JSON.stringify(tokenBody));

    const tokenRes = await fetch(`${LIVEAVATAR_BASE}/v1/sessions/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": HEYGEN_API_KEY,
      },
      body: JSON.stringify(tokenBody),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error("LiveAvatar /v1/sessions/token failed:", tokenRes.status, text);
      return NextResponse.json(
        { error: "Failed to create LiveAvatar session token" },
        { status: 502 }
      );
    }

    const tokenData = await tokenRes.json();
    const sessionToken: string =
      tokenData.session_token ??
      tokenData.data?.session_token;

    if (!sessionToken) {
      return NextResponse.json(
        { error: "LiveAvatar did not return a session_token" },
        { status: 502 }
      );
    }

    // ── Step 3: Start the session ─────────────────────────────────────────
    const startRes = await fetch(`${LIVEAVATAR_BASE}/v1/sessions/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({}),
    });

    if (!startRes.ok) {
      const text = await startRes.text();
      console.error("LiveAvatar /v1/sessions/start failed:", startRes.status, text);
      return NextResponse.json(
        { error: "Failed to start LiveAvatar session" },
        { status: 502 }
      );
    }

    const startData = await startRes.json();
    const result = startData.data ?? startData;

    const livekit_url: string = result.livekit_url;
    const livekit_client_token: string = result.livekit_client_token ?? result.token;
    const session_id: string = result.session_id ?? result.id;

    if (!livekit_url || !livekit_client_token) {
      return NextResponse.json(
        { error: "LiveAvatar start response missing livekit fields" },
        { status: 502 }
      );
    }

    return NextResponse.json({ livekit_url, livekit_client_token, session_id });
  } catch (err) {
    console.error("LiveAvatar session error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
