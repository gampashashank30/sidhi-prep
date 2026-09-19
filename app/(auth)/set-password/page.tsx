'use client';

// app/(auth)/set-password/page.tsx — First-time password setup via invite token
import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function SetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);

  useEffect(() => {
    if (!token) { setTokenValid(false); return; }
    fetch(`/api/auth/set-password?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => setTokenValid(d.valid === true))
      .catch(() => setTokenValid(false));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to set password.'); return; }
      setSuccess(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!token || tokenValid === false) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '4rem', height: '4rem', background: '#FEF2F2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
          <svg width="28" height="28" fill="#DC2626" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" /></svg>
        </div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.5rem' }}>Invite link expired</h2>
        <p style={{ fontSize: '0.875rem', color: '#64748B', lineHeight: 1.6 }}>This setup link is invalid or has expired. Please contact an administrator to resend your invitation.</p>
      </div>
    );
  }

  if (tokenValid === null) {
    return <div style={{ textAlign: 'center', color: '#94A3B8', padding: '2rem 0' }}>Validating invite…</div>;
  }

  if (success) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '4rem', height: '4rem', background: '#F0FDF4', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
          <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#16A34A" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
        </div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.5rem' }}>Welcome to Siddhi!</h2>
        <p style={{ fontSize: '0.875rem', color: '#64748B' }}>Your account is ready. Redirecting to sign in…</p>
      </div>
    );
  }

  return (
    <>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.25rem' }}>Create your password</h2>
      <p style={{ fontSize: '0.8125rem', color: '#94A3B8', marginBottom: '1.5rem' }}>Welcome! Set a password to activate your account.</p>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '0.625rem', padding: '0.75rem 1rem', marginBottom: '1rem' }} role="alert">
          <span style={{ fontSize: '0.8125rem', color: '#DC2626', fontWeight: 500 }}>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {(['password', 'confirm'] as const).map((field) => (
          <div key={field}>
            <label htmlFor={`set-${field}`} style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '0.375rem' }}>
              {field === 'password' ? 'New password' : 'Confirm password'}
            </label>
            <input
              id={`set-${field}`}
              type="password"
              required
              value={field === 'password' ? password : confirm}
              onChange={(e) => field === 'password' ? setPassword(e.target.value) : setConfirm(e.target.value)}
              placeholder={field === 'password' ? 'At least 8 characters' : 'Repeat your password'}
              style={{ width: '100%', padding: '0.6875rem 0.875rem', border: '1.5px solid #E2E8F0', borderRadius: '0.625rem', fontSize: '0.9375rem', color: '#0F172A', outline: 'none', background: '#F7F9FC' }}
              onFocus={(e) => { e.target.style.borderColor = '#1B5EA7'; e.target.style.background = '#fff'; }}
              onBlur={(e) => { e.target.style.borderColor = '#E2E8F0'; e.target.style.background = '#F7F9FC'; }}
            />
          </div>
        ))}

        <button id="set-password-submit-btn" type="submit" disabled={loading}
          style={{ width: '100%', padding: '0.8125rem', background: loading ? '#94A3B8' : 'linear-gradient(135deg, #1B5EA7 0%, #14B89A 100%)', color: '#fff', border: 'none', borderRadius: '0.625rem', fontSize: '0.9375rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
        >
          {loading && <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />}
          {loading ? 'Setting password…' : 'Set password & activate account'}
        </button>
      </form>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: 'center', color: '#94A3B8', padding: '2rem 0' }}>Loading…</div>}>
      <SetPasswordForm />
    </Suspense>
  );
}
