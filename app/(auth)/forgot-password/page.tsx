'use client';

// app/(auth)/forgot-password/page.tsx
import React, { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      // Always show success regardless of response (anti-enumeration)
      setSubmitted(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ width: '4rem', height: '4rem', background: '#F0FDF4', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#16A34A" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.5rem' }}>Check your email</h2>
          <p style={{ fontSize: '0.875rem', color: '#64748B', lineHeight: 1.6 }}>
            If an account exists for <strong>{email}</strong>, a password reset link has been sent. Check your inbox (and spam folder).
          </p>
        </div>
        <Link
          href="/login"
          style={{ display: 'block', textAlign: 'center', fontSize: '0.875rem', color: '#1B5EA7', fontWeight: 600, textDecoration: 'none' }}
        >
          ← Back to sign in
        </Link>
      </>
    );
  }

  return (
    <>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.25rem' }}>Reset your password</h2>
      <p style={{ fontSize: '0.8125rem', color: '#94A3B8', marginBottom: '1.5rem' }}>
        Enter your email address and we&apos;ll send you a reset link.
      </p>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '0.625rem', padding: '0.75rem 1rem', marginBottom: '1rem' }} role="alert">
          <span style={{ fontSize: '0.8125rem', color: '#DC2626', fontWeight: 500 }}>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label htmlFor="forgot-email" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '0.375rem' }}>
            Email address
          </label>
          <input
            id="forgot-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{ width: '100%', padding: '0.6875rem 0.875rem', border: '1.5px solid #E2E8F0', borderRadius: '0.625rem', fontSize: '0.9375rem', color: '#0F172A', outline: 'none', background: '#F7F9FC' }}
            onFocus={(e) => { e.target.style.borderColor = '#1B5EA7'; e.target.style.background = '#fff'; }}
            onBlur={(e) => { e.target.style.borderColor = '#E2E8F0'; e.target.style.background = '#F7F9FC'; }}
          />
        </div>

        <button
          id="forgot-submit-btn"
          type="submit"
          disabled={loading}
          style={{ width: '100%', padding: '0.8125rem', background: loading ? '#94A3B8' : 'linear-gradient(135deg, #1B5EA7 0%, #14B89A 100%)', color: '#fff', border: 'none', borderRadius: '0.625rem', fontSize: '0.9375rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
        >
          {loading && <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />}
          {loading ? 'Sending…' : 'Send reset link'}
        </button>

        <Link href="/login" style={{ textAlign: 'center', fontSize: '0.8125rem', color: '#1B5EA7', fontWeight: 600, textDecoration: 'none' }}>
          ← Back to sign in
        </Link>
      </form>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
