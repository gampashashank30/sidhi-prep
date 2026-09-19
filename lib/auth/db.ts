// lib/auth/db.ts
// Supabase client — SERVER-SIDE ONLY.
// Never import this in client components or pages marked 'use client'.
// Uses the service-role key to bypass RLS and perform admin operations.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Lazy singleton — only instantiated when first used (not at module import time).
// This lets `next build` succeed even without SUPABASE_* env vars set locally.
let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'Missing Supabase environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.'
    );
  }

  _client = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return _client;
}

/** Shorthand used internally in all query functions */
const db = () => getClient();

// ─── Database row types ────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'user';
export type UserStatus = 'active' | 'disabled';

export interface DbUser {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  updated_at: string;
}

export interface DbSession {
  id: string;
  user_id: string;
  expires_at: string;
  created_at: string;
}

export interface DbPasswordResetToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

// ─── User queries ──────────────────────────────────────────────────────────────

export async function getUserByEmail(email: string): Promise<DbUser | null> {
  const { data, error } = await db()
    .from('users')
    .select('*')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();

  if (error) {
    console.error('[db] getUserByEmail error:', error.message);
    return null;
  }
  return data;
}

export async function getUserById(id: string): Promise<DbUser | null> {
  const { data, error } = await db()
    .from('users')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[db] getUserById error:', error.message);
    return null;
  }
  return data;
}

export async function getAllUsers(): Promise<Omit<DbUser, 'password_hash'>[]> {
  const { data, error } = await db()
    .from('users')
    .select('id, email, role, status, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[db] getAllUsers error:', error.message);
    return [];
  }
  return data ?? [];
}

export async function createUser(
  email: string,
  passwordHash: string,
  role: UserRole = 'user',
  status: UserStatus = 'active'
): Promise<DbUser | null> {
  const { data, error } = await db()
    .from('users')
    .insert({
      email: email.toLowerCase().trim(),
      password_hash: passwordHash,
      role,
      status,
    })
    .select('*')
    .single();

  if (error) {
    console.error('[db] createUser error:', error.message);
    return null;
  }
  return data;
}

export async function updateUserStatus(id: string, status: UserStatus): Promise<boolean> {
  const { error } = await db()
    .from('users')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('[db] updateUserStatus error:', error.message);
    return false;
  }
  return true;
}

export async function updateUserPassword(id: string, passwordHash: string): Promise<boolean> {
  const { error } = await db()
    .from('users')
    .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('[db] updateUserPassword error:', error.message);
    return false;
  }
  return true;
}

export async function deleteUser(id: string): Promise<boolean> {
  // First delete related sessions and tokens (cascade via DB FK, but also explicit for safety)
  await db().from('password_reset_tokens').delete().eq('user_id', id);
  await db().from('sessions').delete().eq('user_id', id);

  const { error } = await db().from('users').delete().eq('id', id);
  if (error) {
    console.error('[db] deleteUser error:', error.message);
    return false;
  }
  return true;
}

export async function countAdminUsers(): Promise<number> {
  const { count, error } = await db()
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'admin');

  if (error) return 0;
  return count ?? 0;
}

// ─── Session queries ───────────────────────────────────────────────────────────

export async function createSession(userId: string, expiresAt: Date): Promise<string | null> {
  const { data, error } = await db()
    .from('sessions')
    .insert({
      user_id: userId,
      expires_at: expiresAt.toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    console.error('[db] createSession error:', error.message);
    return null;
  }
  return data.id;
}

export async function getSessionById(sessionId: string): Promise<DbSession | null> {
  const { data, error } = await db()
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();

  if (error) {
    console.error('[db] getSessionById error:', error.message);
    return null;
  }
  return data;
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  const { error } = await db()
    .from('sessions')
    .delete()
    .eq('id', sessionId);

  if (error) {
    console.error('[db] deleteSession error:', error.message);
    return false;
  }
  return true;
}

export async function deleteAllUserSessions(userId: string): Promise<boolean> {
  const { error } = await db()
    .from('sessions')
    .delete()
    .eq('user_id', userId);

  if (error) {
    console.error('[db] deleteAllUserSessions error:', error.message);
    return false;
  }
  return true;
}

// ─── Password reset token queries ─────────────────────────────────────────────

export async function createPasswordResetToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date
): Promise<boolean> {
  // Invalidate any existing unused tokens for this user
  await db()
    .from('password_reset_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('used_at', null);

  const { error } = await db().from('password_reset_tokens').insert({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    console.error('[db] createPasswordResetToken error:', error.message);
    return false;
  }
  return true;
}

export async function getValidResetToken(
  tokenHash: string
): Promise<DbPasswordResetToken | null> {
  const { data, error } = await db()
    .from('password_reset_tokens')
    .select('*')
    .eq('token_hash', tokenHash)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) {
    console.error('[db] getValidResetToken error:', error.message);
    return null;
  }
  return data;
}

export async function markTokenUsed(tokenId: string): Promise<boolean> {
  const { error } = await db()
    .from('password_reset_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', tokenId);

  if (error) {
    console.error('[db] markTokenUsed error:', error.message);
    return false;
  }
  return true;
}
