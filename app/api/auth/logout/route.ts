// app/api/auth/logout/route.ts
import { NextResponse } from 'next/server';
import { getSessionFromCookie, clearSessionCookie } from '@/lib/auth/session';
import { deleteSession } from '@/lib/auth/db';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const session = await getSessionFromCookie();
    if (session?.sessionId) {
      await deleteSession(session.sessionId);
    }
    await clearSessionCookie();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[/api/auth/logout] Error:', err);
    // Still clear cookie even if DB delete fails
    await clearSessionCookie().catch(() => {});
    return NextResponse.json({ success: true });
  }
}
