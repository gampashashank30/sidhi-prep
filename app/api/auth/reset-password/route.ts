// app/api/auth/reset-password/route.ts
// Handles password reset via token (both forgot-password and admin-reset flows).
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getValidResetToken, markTokenUsed, updateUserPassword, deleteAllUserSessions } from '@/lib/auth/db';
import { hashToken } from '@/lib/auth/tokens';
import { hashPassword } from '@/lib/auth/password';
import { resetPasswordRateLimit, getClientIp } from '@/lib/auth/rateLimit';

export const runtime = 'nodejs';

const ResetSchema = z.object({
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
    const parsed = ResetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }

    const { token, password } = parsed.data;

    // Look up the token hash in DB
    const tokenHash = hashToken(token);
    const dbToken = await getValidResetToken(tokenHash);

    if (!dbToken) {
      return NextResponse.json(
        { error: 'This reset link is invalid or has expired. Please request a new one.' },
        { status: 400 }
      );
    }

    // Hash the new password
    const passwordHash = await hashPassword(password);

    // Update the user's password
    const updated = await updateUserPassword(dbToken.user_id, passwordHash);
    if (!updated) {
      return NextResponse.json({ error: 'Failed to update password' }, { status: 500 });
    }

    // Mark token as used (single-use guarantee)
    await markTokenUsed(dbToken.id);

    // Invalidate all existing sessions for this user (security: force re-login)
    await deleteAllUserSessions(dbToken.user_id);

    return NextResponse.json({ success: true, message: 'Password updated successfully. Please log in.' });
  } catch (err) {
    console.error('[/api/auth/reset-password] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
