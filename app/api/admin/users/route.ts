// app/api/admin/users/route.ts
// GET /api/admin/users  — list all users
// POST /api/admin/users — create (invite) a user

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guard';
import { getAllUsers, getUserByEmail, createUser } from '@/lib/auth/db';
import { generateSecureToken, inviteTokenExpiresAt } from '@/lib/auth/tokens';
import { createPasswordResetToken } from '@/lib/auth/db';
import { sendInviteEmail } from '@/lib/auth/email';
import { hashPassword } from '@/lib/auth/password';

export const runtime = 'nodejs';

// ── GET: list all users ───────────────────────────────────────────────────────

export async function GET() {
  const { ctx, error } = await requireAdmin();
  if (error) return error;

  const users = await getAllUsers();
  return NextResponse.json({ users });
}

// ── POST: create a new user (invite flow) ─────────────────────────────────────

const CreateUserSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const parsed = CreateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    );
  }

  const { email } = parsed.data;

  // Check if email is already registered
  const existing = await getUserByEmail(email);
  if (existing) {
    return NextResponse.json(
      { error: 'An account with this email already exists.' },
      { status: 409 }
    );
  }

  // Create the user with a placeholder password hash.
  // The real password will be set when the user clicks the invite link.
  // We use a random placeholder so the hash is valid bcrypt but not guessable.
  const { raw: tempRaw } = generateSecureToken();
  const placeholderHash = await hashPassword(tempRaw + '_placeholder_not_usable_' + Date.now());

  const user = await createUser(email, placeholderHash, 'user', 'active');
  if (!user) {
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }

  // Generate invite token and send email
  const { raw, hash } = generateSecureToken();
  const expiresAt = inviteTokenExpiresAt();
  const stored = await createPasswordResetToken(user.id, hash, expiresAt);
  if (!stored) {
    return NextResponse.json({ error: 'Failed to generate invite token' }, { status: 500 });
  }

  sendInviteEmail(user.email, raw).catch((e) => {
    console.error('[admin/users POST] Failed to send invite email:', e?.message);
  });

  return NextResponse.json({
    success: true,
    message: `Invitation sent to ${email}`,
    user: { id: user.id, email: user.email, role: user.role, status: user.status },
  });
}
