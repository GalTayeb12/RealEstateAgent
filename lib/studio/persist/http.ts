/** Glue between Next route handlers and the design operations (auth, flag, JSON). */
import { NextResponse } from "next/server";
import { extractToken } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { studioAccess, studioEnabled } from "../flags";
import { getRepo } from "./repo";
import type { DesignRepo } from "./types";
import type { Result, User } from "./ops";

/**
 * Per-IP limits (M13). Autosave writes at most every 2 s (30/min), so owners get generous room;
 * public share links get less (they are also the surface a token guesser would hit).
 */
const LIMITS = { ownerRead: 600, ownerWrite: 120, shared: 60 } as const;
const limit = (req: Request, bucket: keyof typeof LIMITS) => rateLimit(req, `studio-${bucket}`, LIMITS[bucket], 60_000);
const isRead = (req: Request) => req.method === "GET" || req.method === "HEAD";

const send = (r: Result) => NextResponse.json(r.body, { status: r.status });
const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });

async function json(req: Request): Promise<unknown> {
  try { return await req.json(); } catch { return {}; }
}

/** Owner routes: signed-in developer/admin (flag + allowlist); anything else answers 404 like a missing route. */
export function owner(handler: (a: { repo: DesignRepo; user: User; req: Request; body: () => Promise<unknown>; params: Record<string, string> }) => Promise<Result>) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    const auth = extractToken(req.headers.get("Authorization"));
    if (!auth || !studioAccess(auth.role).allowed) return notFound();
    const limited = limit(req, isRead(req) ? "ownerRead" : "ownerWrite");
    if (limited) return limited;
    return send(await handler({ repo: await getRepo(), user: { id: auth.userId }, req, body: () => json(req), params: await ctx.params }));
  };
}

/** Share-link routes: no login, but the studio flag must be on. */
export function shared(handler: (a: { repo: DesignRepo; req: Request; body: () => Promise<unknown>; params: Record<string, string> }) => Promise<Result>) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    if (!studioEnabled()) return notFound();
    const limited = limit(req, "shared");
    if (limited) return limited;
    return send(await handler({ repo: await getRepo(), req, body: () => json(req), params: await ctx.params }));
  };
}
