// app/api/auth/set-password/route.ts
// Handles the invite/setup token flow (first-time password set for newly invited users).
// Uses the same password_reset_tokens table as reset-password.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getValidResetToken, markTokenUsed, updateUserPassword } from '@/lib/auth/db';
import { hashToken } from '@/lib/auth/tokens';
import { hashPassword } from '@/lib/auth/password';
import { resetPasswordRateLimit, getClientIp } from '@/lib/auth/rateLimit';

export const runtime = 'nodejs';

const SetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long'),
});

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = resetPasswordRateLimit(ip);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Please wait before trying again.' },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = SetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }

    const { token, password } = parsed.data;
    const tokenHash = hashToken(token);
    const dbToken = await getValidResetToken(tokenHash);

    if (!dbToken) {
      return NextResponse.json(
        { error: 'This setup link is invalid or has expired. Please ask an admin to resend the invite.' },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(password);
    const updated = await updateUserPassword(dbToken.user_id, passwordHash);
    if (!updated) {
      return NextResponse.json({ error: 'Failed to set password' }, { status: 500 });
    }

    // Mark invite token as used (single-use guarantee)
    await markTokenUsed(dbToken.id);

    return NextResponse.json({
      success: true,
      message: 'Password set successfully. You can now log in.',
    });
  } catch (err) {
    console.error('[/api/auth/set-password] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET: validate the token before the user fills in the form
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ valid: false, error: 'No token provided' }, { status: 400 });
    }

    const tokenHash = hashToken(token);
    const dbToken = await getValidResetToken(tokenHash);

    if (!dbToken) {
      return NextResponse.json({ valid: false, error: 'Token is invalid or expired' });
    }

    return NextResponse.json({ valid: true });
  } catch {
    return NextResponse.json({ valid: false, error: 'Internal server error' }, { status: 500 });
  }
}
