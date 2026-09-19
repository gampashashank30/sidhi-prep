// lib/auth/session.ts
// HTTP-only cookie session management using signed JWT via `jose`.
// Session IDs are stored in the database so they can be individually invalidated
// (e.g., on logout or user disable).

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import type { UserRole, UserStatus } from './db';

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_COOKIE_NAME = 'siddhi_session';
const SESSION_DURATION_DAYS = 7;
const SESSION_DURATION_SECONDS = SESSION_DURATION_DAYS * 24 * 60 * 60;

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 characters long');
  }
  return new TextEncoder().encode(secret);
}

// ─── Session payload ──────────────────────────────────────────────────────────

export interface SessionPayload extends JWTPayload {
  sessionId: string;
  userId: string;
  email: string;
  role: UserRole;
}

// ─── Create session JWT ───────────────────────────────────────────────────────

export async function createSessionJWT(payload: Omit<SessionPayload, 'iat' | 'exp'>): Promise<string> {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_SECONDS * 1000);

  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(getSecret());
}

// ─── Verify session JWT ────────────────────────────────────────────────────────

export async function verifySessionJWT(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ['HS256'],
    });
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

// ─── Set session cookie (call from API route handlers) ────────────────────────

export async function setSessionCookie(jwt: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION_SECONDS,
    path: '/',
  });
}

// ─── Clear session cookie ─────────────────────────────────────────────────────

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

// ─── Get session from cookie (server component / route handler) ───────────────

export async function getSessionFromCookie(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionJWT(token);
}

// ─── Get session from request (middleware-safe) ───────────────────────────────

export async function getSessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionJWT(token);
}

// ─── Session expiry date ──────────────────────────────────────────────────────

export function getSessionExpiresAt(): Date {
  return new Date(Date.now() + SESSION_DURATION_SECONDS * 1000);
}
