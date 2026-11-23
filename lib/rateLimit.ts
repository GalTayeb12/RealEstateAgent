/**
 * Small in-memory fixed-window rate limiter for abuse-prone public endpoints (login, register, password reset).
 * State is per server instance: it stops scripted guessing on one node; behind many serverless instances put a shared
 * store (Redis/Upstash) behind the same `rateLimit` signature.
 */
import { NextRequest, NextResponse } from "next/server";

const hits = new Map<string, { count: number; resetAt: number }>();

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

/** Returns a 429 response when `key` exceeded `limit` hits in `windowMs`, otherwise null. */
export function rateLimit(req: NextRequest, bucket: string, limit: number, windowMs: number): NextResponse | null {
  const now = Date.now();
  const key = `${bucket}:${clientIp(req)}`;
  const cur = hits.get(key);
  if (!cur || cur.resetAt <= now) {
    if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  cur.count += 1;
  if (cur.count <= limit) return null;
  const retry = Math.ceil((cur.resetAt - now) / 1000);
  return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(retry) } });
}
