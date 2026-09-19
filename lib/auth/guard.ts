// lib/auth/guard.ts
// Server-side authorization guard helpers.
// Use these inside API route handlers for defence-in-depth beyond middleware.

import { getSessionFromCookie } from './session';
import { getUserById, getSessionById, type DbUser } from './db';
import { NextResponse } from 'next/server';

export interface AuthContext {
  user: DbUser;
  sessionId: string;
}

/**
 * Require a valid, active authenticated session.
 * Returns the user and sessionId, or a NextResponse error to return immediately.
 */
export async function requireAuth(): Promise<
  { ctx: AuthContext; error: null } | { ctx: null; error: NextResponse }
> {
  const session = await getSessionFromCookie();
  if (!session) {
    return {
      ctx: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  // Validate session exists in DB (allows session revocation)
  const dbSession = await getSessionById(session.sessionId);
  if (!dbSession || new Date(dbSession.expires_at) < new Date()) {
    return {
      ctx: null,
      error: NextResponse.json({ error: 'Session expired' }, { status: 401 }),
    };
  }

  // Validate user still exists and is active
  const user = await getUserById(session.userId);
  if (!user) {
    return {
      ctx: null,
      error: NextResponse.json({ error: 'User not found' }, { status: 401 }),
    };
  }
  if (user.status === 'disabled') {
    return {
      ctx: null,
      error: NextResponse.json({ error: 'Account is disabled' }, { status: 403 }),
    };
  }

  return { ctx: { user, sessionId: session.sessionId }, error: null };
}

/**
 * Require a valid, active admin session.
 * Normal users get 403.
 */
export async function requireAdmin(): Promise<
  { ctx: AuthContext; error: null } | { ctx: null; error: NextResponse }
> {
  const result = await requireAuth();
  if (result.error) return result;

  if (result.ctx!.user.role !== 'admin') {
    return {
      ctx: null,
      error: NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 }),
    };
  }

  return result;
}
