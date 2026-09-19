// app/api/auth/session/route.ts
// Returns the current session's user info (for client-side session checks).
// Does NOT include password_hash or session internals.

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';

export const runtime = 'nodejs';

export async function GET() {
  const { ctx, error } = await requireAuth();
  if (error) return error;

  return NextResponse.json({
    user: {
      id: ctx.user.id,
      email: ctx.user.email,
      role: ctx.user.role,
      status: ctx.user.status,
    },
  });
}
