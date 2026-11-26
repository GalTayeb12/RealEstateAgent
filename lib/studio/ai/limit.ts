/**
 * Sliding-window rate limit per key (the signed-in user id for the AI designer). In memory, per
 * server instance, like lib/rateLimit.ts; put a shared store behind the same interface when the
 * studio runs on more than one instance. The clock is injectable for tests.
 */
export class SlidingLimiter {
  private hits = new Map<string, number[]>();
  constructor(private limit: number, private windowMs: number, private now: () => number = Date.now) {}

  /** Records a hit and says whether it is allowed; `retryAfter` (seconds) when it is not. */
  take(key: string): { ok: true; remaining: number } | { ok: false; retryAfter: number } {
    const t = this.now();
    const list = (this.hits.get(key) ?? []).filter((h) => h > t - this.windowMs);
    if (list.length >= this.limit) {
      this.hits.set(key, list);
      return { ok: false, retryAfter: Math.max(1, Math.ceil((list[0] + this.windowMs - t) / 1000)) };
    }
    list.push(t);
    this.hits.set(key, list);
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (!v.some((h) => h > t - this.windowMs)) this.hits.delete(k);
    return { ok: true, remaining: this.limit - list.length };
  }
}
