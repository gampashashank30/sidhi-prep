// lib/auth/tokens.ts
// Cryptographically secure token generation and hashing.
// Raw tokens are NEVER stored in the database — only the SHA-256 hash.

import { createHash, randomBytes } from 'crypto';

/**
 * Generate a cryptographically secure random token.
 * Returns the raw token (to be sent to the user via email) and its SHA-256 hash
 * (to be stored in the database).
 */
export function generateSecureToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('hex'); // 256 bits of entropy
  const hash = hashToken(raw);
  return { raw, hash };
}

/**
 * Hash a raw token using SHA-256 for safe database storage.
 */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Token expiry helpers.
 */
export const TOKEN_EXPIRY = {
  /** Password reset tokens expire in 1 hour */
  RESET_HOURS: 1,
  /** Invite/setup tokens expire in 7 days */
  INVITE_DAYS: 7,
};

export function resetTokenExpiresAt(): Date {
  const d = new Date();
  d.setHours(d.getHours() + TOKEN_EXPIRY.RESET_HOURS);
  return d;
}

export function inviteTokenExpiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + TOKEN_EXPIRY.INVITE_DAYS);
  return d;
}
