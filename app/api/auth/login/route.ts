// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserByEmail, createSession } from '@/lib/auth/db';
import { verifyPassword } from '@/lib/auth/password';
import { createSessionJWT, setSessionCookie, getSessionExpiresAt } from '@/lib/auth/session';
import { loginRateLimit, getClientIp } from '@/lib/auth/rateLimit';

export const runtime = 'nodejs';

const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const ip = getClientIp(req);
    const rl = loginRateLimit(ip);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please wait before trying again.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
        }
      );
    }

    // Validate input
    const body = await req.json().catch(() => ({}));
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }

    const { email, password } = parsed.data;

    // Look up user — use a generic error to prevent email enumeration
    const user = await getUserByEmail(email);
    const GENERIC_ERROR = 'Invalid email or password';

    if (!user) {
      // Still call verifyPassword to prevent timing-based enumeration
      await verifyPassword(password, '$2b$12$invalidhashpadding.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    if (user.status === 'disabled') {
      return NextResponse.json(
        { error: 'Your account has been disabled. Please contact an administrator.' },
        { status: 403 }
      );
    }

    // Create DB session
    const expiresAt = getSessionExpiresAt();
    const sessionId = await createSession(user.id, expiresAt);
    if (!sessionId) {
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }

    // Sign JWT
    const jwt = await createSessionJWT({
      sessionId,
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Set HTTP-only cookie
    await setSessionCookie(jwt);

    return NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('[/api/auth/login] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
