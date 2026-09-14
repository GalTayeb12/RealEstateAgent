/**
 * lib/tokens.ts — Shared verification token infrastructure
 *
 * Used by:
 *   - email_verify : sent after registration, confirmed at /verify-email
 *   - password_reset: sent from /forgot-password, consumed at /reset-password
 *
 * Tokens are cryptographically random (32 bytes → 64-char hex string).
 * Each token is single-use (usedAt is set on redemption) and time-limited.
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";

// ─── TTLs ────────────────────────────────────────────────────────────────────

const TTL_MS: Record<string, number> = {
  email_verify:   24 * 60 * 60 * 1000, // 24 hours
  password_reset:  1 * 60 * 60 * 1000, //  1 hour
};

// ─── Result types ─────────────────────────────────────────────────────────────

export type VerifyResult =
  | { ok: true;  userId: string }
  | { ok: false; reason: "not_found" | "expired" | "already_used" };

// ─── createVerificationToken ──────────────────────────────────────────────────

/**
 * Generates a secure random token, stores it in the DB, and returns the raw
 * token string (to be embedded in an email link).
 *
 * If an unused, non-expired token of the same type already exists for this user
 * it is deleted first — so the user always gets a fresh link.
 */
export async function createVerificationToken(
  userId: string,
  type: "email_verify" | "password_reset"
): Promise<string> {
  // Invalidate any previous pending token of the same type for this user.
  await prisma.verificationToken.deleteMany({
    where: { userId, type, usedAt: null },
  });

  const token = crypto.randomBytes(32).toString("hex");
  const ttl = TTL_MS[type] ?? TTL_MS.email_verify;
  const expiresAt = new Date(Date.now() + ttl);

  await prisma.verificationToken.create({
    data: { userId, token, type, expiresAt },
  });

  return token;
}

// ─── redeemVerificationToken ──────────────────────────────────────────────────

/**
 * Validates a token string against the DB.
 *
 * On success: marks the token as used (usedAt = now) and returns the userId.
 * On failure: returns a discriminated error reason — never a generic message.
 *
 * Does NOT update the User model — callers are responsible for any follow-up
 * writes (e.g. setting emailVerified=true or updating passwordHash).
 */
export async function redeemVerificationToken(
  token: string,
  type: "email_verify" | "password_reset"
): Promise<VerifyResult> {
  const record = await prisma.verificationToken.findUnique({
    where: { token },
  });

  if (!record || record.type !== type) {
    return { ok: false, reason: "not_found" };
  }

  if (record.usedAt !== null) {
    return { ok: false, reason: "already_used" };
  }

  if (record.expiresAt < new Date()) {
    return { ok: false, reason: "expired" };
  }

  // Mark as used atomically before returning.
  await prisma.verificationToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });

  return { ok: true, userId: record.userId };
}
