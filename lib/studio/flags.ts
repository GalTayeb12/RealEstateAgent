/**
 * Design Studio feature flag. Everything under /studio and /api/studio must
 * call `studioAccess` first, so the feature stays dark until it is enabled.
 *
 *   STUDIO_ENABLED=1            turn the feature on (default: off)
 *   STUDIO_ROLES=admin,developer  roles allowed in while it is on (default: admin,developer)
 *                               use "*" to allow every signed-in role
 */
export type StudioAccess = { allowed: true } | { allowed: false; reason: "disabled" | "role" | "anonymous" };

type Env = Record<string, string | undefined>;

export function studioEnabled(env: Env = process.env): boolean {
  const v = env.STUDIO_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

export function studioRoles(env: Env = process.env): string[] {
  const raw = env.STUDIO_ROLES?.trim();
  return (raw ? raw.split(",") : ["admin", "developer"]).map((r) => r.trim()).filter(Boolean);
}

export function studioAccess(role: string | null | undefined, env: Env = process.env): StudioAccess {
  if (!studioEnabled(env)) return { allowed: false, reason: "disabled" };
  if (!role) return { allowed: false, reason: "anonymous" };
  const roles = studioRoles(env);
  if (roles.includes("*") || roles.includes(role)) return { allowed: true };
  return { allowed: false, reason: "role" };
}
