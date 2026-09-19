// app/api/auth/forgot-password/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserByEmail } from '@/lib/auth/db';
import { generateSecureToken, resetTokenExpiresAt } from '@/lib/auth/tokens';
import { createPasswordResetToken } from '@/lib/auth/db';
import { sendForgotPasswordEmail } from '@/lib/auth/email';
import { forgotPasswordRateLimit, getClientIp } from '@/lib/auth/rateLimit';

export const runtime = 'nodejs';

const ForgotSchema = z.object({
  email: z.string().email('Invalid email address'),
});

// ALWAYS return the same generic message regardless of whether the email exists
const GENERIC_RESPONSE = {
  message: 'If an account exists for this email, a password reset link has been sent.',
};

export async function POST(req: NextRequest) {
  try {
    // Rate limit
    const ip = getClientIp(req);
    const rl = forgotPasswordRateLimit(ip);
    if (!rl.allowed) {
      // Still return generic message — don't reveal rate limit details
      return NextResponse.json(GENERIC_RESPONSE);
    }

    const body = await req.json().catch(() => ({}));
    const parsed = ForgotSchema.safeParse(body);
    if (!parsed.success) {
      // Return generic message even for invalid email format — don't reveal info
      return NextResponse.json(GENERIC_RESPONSE);
    }

    const { email } = parsed.data;
    const user = await getUserByEmail(email);

    // Always respond the same way — don't reveal if email is registered
    if (!user || user.status === 'disabled') {
      return NextResponse.json(GENERIC_RESPONSE);
    }

    // Generate token, store hash, send email
    const { raw, hash } = generateSecureToken();
    const expiresAt = resetTokenExpiresAt();
    const stored = await createPasswordResetToken(user.id, hash, expiresAt);

    if (stored) {
      // Fire and forget — don't fail the response if email has a transient issue
      sendForgotPasswordEmail(user.email, raw).catch((e) => {
        console.error('[forgot-password] Failed to send email:', e?.message);
      });
    }

    return NextResponse.json(GENERIC_RESPONSE);
  } catch (err) {
    console.error('[/api/auth/forgot-password] Error:', err);
    return NextResponse.json(GENERIC_RESPONSE); // Never leak errors
  }
}
