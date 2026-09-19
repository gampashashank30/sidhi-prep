// app/(auth)/layout.tsx
// Shared layout for all auth pages (login, forgot-password, reset-password, set-password).
// Minimal wrapper — no header/wizard nav, just a centered card.

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Siddhi — Sign In',
  description: 'Sign in to access the Siddhi Question Bank PDF Generator.',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0F3D6E 0%, #1B5EA7 50%, #14B89A 100%)',
        padding: '1.5rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          background: '#ffffff',
          borderRadius: '1.5rem',
          boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Brand strip */}
        <div
          style={{
            padding: '2rem 2rem 1.5rem',
            background: 'linear-gradient(135deg, #0F3D6E 0%, #1B5EA7 55%, #1d7ad4 75%, #14B89A 100%)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '3.5rem',
              height: '3.5rem',
              borderRadius: '50%',
              overflow: 'hidden',
              border: '2px solid rgba(255,255,255,0.4)',
              margin: '0 auto 0.75rem',
              background: 'rgba(255,255,255,0.1)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Siddhi" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <h1
            style={{
              fontFamily: 'Georgia, serif',
              fontStyle: 'italic',
              fontWeight: 700,
              fontSize: '1.5rem',
              color: '#fff',
              marginBottom: '0.25rem',
            }}
          >
            Siddhi
          </h1>
          <p style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.65)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Question Bank PDF Generator
          </p>
        </div>

        {/* Page content */}
        <div style={{ padding: '2rem' }}>{children}</div>
      </div>
    </div>
  );
}
