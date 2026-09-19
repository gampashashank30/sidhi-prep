// lib/auth/password.ts
// Secure password hashing using bcryptjs (Argon2id is ideal but requires native binaries
// that can break on serverless/container deployments; bcrypt is safer for this stack).

import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12; // Recommended minimum for bcrypt security

/**
 * Hash a plaintext password. Never log or return the plaintext.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

/**
 * Verify a plaintext password against a stored hash.
 * Returns true only if the password matches.
 */
export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}
