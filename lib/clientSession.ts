"use client";
/**
 * Client-side session helpers. The real JWT is an httpOnly cookie (lib/session.ts) that scripts cannot read.
 * localStorage["token"] only holds a non-secret marker, and localStorage["user"] holds the display profile
 * (id, email, role, name, locale) returned by /api/auth/login.
 */
import { SESSION_MARKER } from "./session";

export function storedUserRole(): string | null {
  try {
    const raw = localStorage.getItem("user");
    const role = raw ? (JSON.parse(raw) as { role?: unknown }).role : null;
    return typeof role === "string" ? role : null;
  } catch {
    return null;
  }
}

/** Role claim of a legacy JWT still held in localStorage (display only; the API checks the real one). */
function legacyJwtRole(token: string): string | null {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const role = JSON.parse(atob(part)).role;
    return typeof role === "string" ? role : null;
  } catch {
    return null;
  }
}

/** Role of the signed-in user for UI decisions, or null when signed out. */
export function currentRole(): string | null {
  try {
    const t = localStorage.getItem("token");
    if (!t) return null;
    return storedUserRole() ?? legacyJwtRole(t);
  } catch {
    return null;
  }
}

/**
 * Browsers that signed in before cookies existed still hold the JWT in localStorage. Hand it to the server once so it
 * becomes the httpOnly cookie, then replace it with the marker so scripts no longer hold a usable token.
 */
export async function migrateLegacyToken(): Promise<void> {
  try {
    const t = localStorage.getItem("token");
    if (!t || t === SESSION_MARKER || !t.includes(".")) return;
    const res = await fetch("/api/auth/session", { method: "POST", headers: { Authorization: `Bearer ${t}` } });
    if (res.ok) localStorage.setItem("token", SESSION_MARKER);
    else if (res.status === 401) { localStorage.removeItem("token"); localStorage.removeItem("user"); } // expired
  } catch {
    /* offline or storage blocked: try again next load */
  }
}

export async function signOutRemote(): Promise<void> {
  try { await fetch("/api/auth/session", { method: "DELETE" }); } catch { /* cookie expires on its own */ }
}
