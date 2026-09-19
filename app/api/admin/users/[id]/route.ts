// app/api/admin/users/[id]/route.ts
// PATCH /api/admin/users/[id] — enable/disable user
// DELETE /api/admin/users/[id] — delete user

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guard';
import {
  getUserById,
  updateUserStatus,
  deleteUser,
  countAdminUsers,
  deleteAllUserSessions,
} from '@/lib/auth/db';

export const runtime = 'nodejs';

// ── PATCH: enable or disable user ─────────────────────────────────────────────

const PatchSchema = z.object({
  status: z.enum(['active', 'disabled']),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { ctx, error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    );
  }

  // Prevent admin from disabling themselves
  if (id === ctx.user.id && parsed.data.status === 'disabled') {
    return NextResponse.json(
      { error: 'You cannot disable your own account.' },
      { status: 400 }
    );
  }

  const target = await getUserById(id);
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const ok = await updateUserStatus(id, parsed.data.status);
  if (!ok) {
    return NextResponse.json({ error: 'Failed to update user status' }, { status: 500 });
  }

  // If disabling, immediately invalidate all sessions
  if (parsed.data.status === 'disabled') {
    await deleteAllUserSessions(id);
  }

  return NextResponse.json({
    success: true,
    message: `User ${parsed.data.status === 'active' ? 'enabled' : 'disabled'} successfully.`,
  });
}

// ── DELETE: remove user ───────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { ctx, error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;

  // Cannot delete yourself
  if (id === ctx.user.id) {
    return NextResponse.json(
      { error: 'You cannot delete your own account.' },
      { status: 400 }
    );
  }

  const target = await getUserById(id);
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Prevent deleting the last admin
  if (target.role === 'admin') {
    const adminCount = await countAdminUsers();
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: 'Cannot delete the last admin account. Promote another user to admin first.' },
        { status: 400 }
      );
    }
  }

  const ok = await deleteUser(id);
  if (!ok) {
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: 'User deleted successfully.' });
}
