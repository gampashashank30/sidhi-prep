'use client';

// app/(admin)/admin/page.tsx
// Full admin dashboard — user management, stats, actions.

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

interface User {
  id: string;
  email: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled';
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }: { status: User['status'] }) {
  const active = status === 'active';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
      padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.72rem', fontWeight: 700,
      background: active ? '#DCFCE7' : '#F1F5F9', color: active ? '#15803D' : '#64748B',
    }}>
      <span style={{ width: '0.45rem', height: '0.45rem', borderRadius: '50%', background: active ? '#16A34A' : '#94A3B8' }} />
      {active ? 'Active' : 'Disabled'}
    </span>
  );
}

function RoleBadge({ role }: { role: User['role'] }) {
  const isAdmin = role === 'admin';
  return (
    <span style={{
      display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.72rem', fontWeight: 700,
      background: isAdmin ? '#EDE9FE' : '#F0F4F8', color: isAdmin ? '#7C3AED' : '#64748B',
    }}>
      {isAdmin ? 'Admin' : 'User'}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // userId being actioned

  // Add user modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (res.status === 401 || res.status === 403) { router.push('/login'); return; }
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch {
      showToast('Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  }, [router, showToast]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setAddLoading(true);
    setAddError(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail }),
      });
      const data = await res.json();
      if (!res.ok) { setAddError(data.error ?? 'Failed to add user'); return; }
      showToast(`Invitation sent to ${newEmail}`);
      setShowAddModal(false);
      setNewEmail('');
      fetchUsers();
    } catch {
      setAddError('Network error');
    } finally {
      setAddLoading(false);
    }
  }

  async function handleToggleStatus(user: User) {
    const newStatus = user.status === 'active' ? 'disabled' : 'active';
    setActionLoading(user.id + '-status');
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? 'Failed', 'error'); return; }
      showToast(data.message ?? 'Updated');
      fetchUsers();
    } catch {
      showToast('Network error', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleResetPassword(user: User) {
    setActionLoading(user.id + '-reset');
    try {
      const res = await fetch(`/api/admin/users/${user.id}/reset-password`, { method: 'POST' });
      const data = await res.json();
      showToast(data.message ?? (res.ok ? 'Reset link sent' : data.error), res.ok ? 'success' : 'error');
    } catch {
      showToast('Network error', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeleteUser() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? 'Failed to delete', 'error'); return; }
      showToast('User deleted');
      setDeleteTarget(null);
      fetchUsers();
    } catch {
      showToast('Network error', 'error');
    } finally {
      setDeleteLoading(false);
    }
  }

  const filtered = users.filter((u) =>
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.status === 'active').length;
  const disabledUsers = users.filter((u) => u.status === 'disabled').length;

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4F8', fontFamily: 'var(--font-inter, Inter, sans-serif)' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '1.25rem', right: '1.25rem', zIndex: 9999,
          background: toast.type === 'success' ? '#0F172A' : '#DC2626',
          color: '#fff', padding: '0.875rem 1.25rem', borderRadius: '0.875rem',
          fontSize: '0.875rem', fontWeight: 600,
          boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          animation: 'slideIn 0.2s ease',
        }}>
          {toast.type === 'success' ? '✓' : '✗'} {toast.msg}
        </div>
      )}

      {/* Header */}
      <header style={{ background: 'linear-gradient(135deg, #0F3D6E 0%, #1B5EA7 55%, #14B89A 100%)', boxShadow: '0 4px 24px rgba(15,23,42,0.25)' }}>
        <div style={{ maxWidth: '72rem', margin: '0 auto', padding: '0.875rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: '50%', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.3)', flexShrink: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Siddhi" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div>
            <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 700, fontSize: '1.1rem', color: '#fff' }}>Siddhi</span>
            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.65)', marginLeft: '0.625rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Admin Panel</span>
          </div>
          <div style={{ flex: 1 }} />
          <a href="/" style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.8)', textDecoration: 'none', fontWeight: 500, marginRight: '0.5rem' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
          >
            ← Back to App
          </a>
          <button
            id="admin-logout-btn"
            onClick={handleLogout}
            style={{ padding: '0.4rem 0.875rem', background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '0.5rem', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', backdropFilter: 'blur(4px)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.22)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
          >
            Sign out
          </button>
        </div>
      </header>

      <main style={{ maxWidth: '72rem', margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', marginBottom: '0.25rem' }}>User Management</h1>
          <p style={{ fontSize: '0.875rem', color: '#64748B' }}>Manage all Siddhi Prep user accounts.</p>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          {[
            { label: 'Total Users', value: totalUsers, color: '#1B5EA7', bg: '#EFF6FF' },
            { label: 'Active', value: activeUsers, color: '#16A34A', bg: '#F0FDF4' },
            { label: 'Disabled', value: disabledUsers, color: '#DC2626', bg: '#FEF2F2' },
          ].map(({ label, value, color, bg }) => (
            <div key={label} style={{ background: '#fff', borderRadius: '1rem', padding: '1.25rem', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.375rem' }}>{label}</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color }}>{loading ? '—' : value}</div>
            </div>
          ))}
        </div>

        {/* Table card */}
        <div style={{ background: '#fff', borderRadius: '1.25rem', border: '1px solid #E2E8F0', boxShadow: '0 4px 16px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          {/* Table toolbar */}
          <div style={{ padding: '1.125rem 1.5rem', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <input
              id="admin-search"
              type="search"
              placeholder="Search users by email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: '1', minWidth: '200px', padding: '0.5rem 0.875rem', border: '1.5px solid #E2E8F0', borderRadius: '0.625rem', fontSize: '0.875rem', outline: 'none', background: '#F7F9FC' }}
              onFocus={(e) => { e.target.style.borderColor = '#1B5EA7'; }}
              onBlur={(e) => { e.target.style.borderColor = '#E2E8F0'; }}
            />
            <button
              id="admin-add-user-btn"
              onClick={() => { setShowAddModal(true); setAddError(null); setNewEmail(''); }}
              style={{ padding: '0.5rem 1.125rem', background: 'linear-gradient(135deg, #1B5EA7, #14B89A)', color: '#fff', border: 'none', borderRadius: '0.625rem', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>+</span> Add User
            </button>
          </div>

          {/* Table */}
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94A3B8' }}>Loading users…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94A3B8' }}>
              {search ? 'No users match your search.' : 'No users yet. Add one above.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    {['Email', 'Role', 'Status', 'Created', 'Actions'].map((h) => (
                      <th key={h} style={{ padding: '0.75rem 1.25rem', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((user, idx) => (
                    <tr key={user.id} style={{ borderBottom: idx < filtered.length - 1 ? '1px solid #F1F5F9' : 'none', transition: 'background 0.15s' }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = '#F8FAFC')}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = 'transparent')}
                    >
                      <td style={{ padding: '0.875rem 1.25rem', fontWeight: 600, color: '#0F172A', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {user.email}
                      </td>
                      <td style={{ padding: '0.875rem 1.25rem' }}><RoleBadge role={user.role} /></td>
                      <td style={{ padding: '0.875rem 1.25rem' }}><StatusBadge status={user.status} /></td>
                      <td style={{ padding: '0.875rem 1.25rem', color: '#64748B', whiteSpace: 'nowrap' }}>{formatDate(user.created_at)}</td>
                      <td style={{ padding: '0.875rem 1.25rem' }}>
                        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                          {/* Disable / Enable */}
                          <button
                            title={user.status === 'active' ? 'Disable user' : 'Enable user'}
                            disabled={actionLoading === user.id + '-status'}
                            onClick={() => handleToggleStatus(user)}
                            style={{ padding: '0.3rem 0.625rem', fontSize: '0.72rem', fontWeight: 600, border: '1px solid', borderColor: user.status === 'active' ? '#FCD34D' : '#BBF7D0', background: user.status === 'active' ? '#FFFBEB' : '#F0FDF4', color: user.status === 'active' ? '#92400E' : '#15803D', borderRadius: '0.375rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
                          >
                            {actionLoading === user.id + '-status' ? '…' : user.status === 'active' ? 'Disable' : 'Enable'}
                          </button>
                          {/* Send Reset */}
                          <button
                            title="Send password reset email"
                            disabled={actionLoading === user.id + '-reset' || user.status === 'disabled'}
                            onClick={() => handleResetPassword(user)}
                            style={{ padding: '0.3rem 0.625rem', fontSize: '0.72rem', fontWeight: 600, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8', borderRadius: '0.375rem', cursor: user.status === 'disabled' ? 'not-allowed' : 'pointer', opacity: user.status === 'disabled' ? 0.5 : 1, whiteSpace: 'nowrap' }}
                          >
                            {actionLoading === user.id + '-reset' ? '…' : 'Send Reset'}
                          </button>
                          {/* Delete */}
                          <button
                            title="Delete user"
                            onClick={() => setDeleteTarget(user)}
                            style={{ padding: '0.3rem 0.625rem', fontSize: '0.72rem', fontWeight: 600, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', borderRadius: '0.375rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Add User Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#fff', borderRadius: '1.25rem', padding: '2rem', width: '100%', maxWidth: '420px', boxShadow: '0 25px 50px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.25rem' }}>Add New User</h2>
            <p style={{ fontSize: '0.8125rem', color: '#94A3B8', marginBottom: '1.25rem' }}>An invitation email will be sent to the user to set their password.</p>

            {addError && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '0.625rem', padding: '0.75rem', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.8125rem', color: '#DC2626', fontWeight: 500 }}>{addError}</span>
              </div>
            )}

            <form onSubmit={handleAddUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label htmlFor="add-user-email" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '0.375rem' }}>Email address</label>
                <input
                  id="add-user-email"
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="user@example.com"
                  style={{ width: '100%', padding: '0.6875rem 0.875rem', border: '1.5px solid #E2E8F0', borderRadius: '0.625rem', fontSize: '0.9375rem', outline: 'none', background: '#F7F9FC' }}
                  onFocus={(e) => { e.target.style.borderColor = '#1B5EA7'; e.target.style.background = '#fff'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#E2E8F0'; e.target.style.background = '#F7F9FC'; }}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button type="button" onClick={() => setShowAddModal(false)}
                  style={{ flex: 1, padding: '0.75rem', background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0', borderRadius: '0.625rem', fontSize: '0.9375rem', fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button id="add-user-submit-btn" type="submit" disabled={addLoading}
                  style={{ flex: 1, padding: '0.75rem', background: addLoading ? '#94A3B8' : 'linear-gradient(135deg, #1B5EA7, #14B89A)', color: '#fff', border: 'none', borderRadius: '0.625rem', fontSize: '0.9375rem', fontWeight: 700, cursor: addLoading ? 'not-allowed' : 'pointer' }}>
                  {addLoading ? 'Sending…' : 'Send Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#fff', borderRadius: '1.25rem', padding: '2rem', width: '100%', maxWidth: '400px', boxShadow: '0 25px 50px rgba(0,0,0,0.2)' }}>
            <div style={{ width: '3rem', height: '3rem', background: '#FEF2F2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#DC2626" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
            </div>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0F172A', textAlign: 'center', marginBottom: '0.5rem' }}>Delete user?</h2>
            <p style={{ fontSize: '0.875rem', color: '#64748B', textAlign: 'center', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              Are you sure you want to permanently delete <strong>{deleteTarget.email}</strong>? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setDeleteTarget(null)}
                style={{ flex: 1, padding: '0.75rem', background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0', borderRadius: '0.625rem', fontSize: '0.9375rem', fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button id="confirm-delete-btn" onClick={handleDeleteUser} disabled={deleteLoading}
                style={{ flex: 1, padding: '0.75rem', background: deleteLoading ? '#94A3B8' : '#DC2626', color: '#fff', border: 'none', borderRadius: '0.625rem', fontSize: '0.9375rem', fontWeight: 700, cursor: deleteLoading ? 'not-allowed' : 'pointer' }}>
                {deleteLoading ? 'Deleting…' : 'Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes slideIn { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: translateX(0); } }`}</style>
    </div>
  );
}
