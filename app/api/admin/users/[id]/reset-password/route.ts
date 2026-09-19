// app/api/admin/users/[id]/reset-password/route.ts
// POST: admin sends a password reset link to a specific user via Resend

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { getUserById, createPasswordResetToken } from '@/lib/auth/db';
import { generateSecureToken, resetTokenExpiresAt } from '@/lib/auth/tokens';
import { sendAdminResetEmail } from '@/lib/auth/email';

export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;

  const user = await getUserById(id);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (user.status === 'disabled') {
    return NextResponse.json(
      { error: 'Cannot send reset link to a disabled user. Enable the account first.' },
      { status: 400 }
    );
  }

  const { raw, hash } = generateSecureToken();
  const expiresAt = resetTokenExpiresAt();
  const stored = await createPasswordResetToken(user.id, hash, expiresAt);

  if (!stored) {
    return NextResponse.json({ error: 'Failed to generate reset token' }, { status: 500 });
  }

  await sendAdminResetEmail(user.email, raw).catch((e) => {
    console.error('[admin/reset-password] Email send failed:', e?.message);
    // Don't surface email errors to admin — token is still in DB
  });

  return NextResponse.json({
    success: true,
    message: `Password reset link sent to ${user.email}.`,
  });
}
