'use client';

import { useWizardStore } from '@/store/wizardStore';
import Step1Upload from '@/components/Step1Upload';
import Step2Cover from '@/components/Step2Cover';
import Step3Customize from '@/components/Step3Customize';
import WizardNav from '@/components/shared/WizardNav';

export default function Home() {
  const currentStep = useWizardStore((s) => s.currentStep);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* ── Brand Header ─────────────────────────────────────────────────────── */}
      <header className="brand-gradient" style={{ boxShadow: '0 4px 24px rgba(15,23,42,0.25)' }}>
        <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '0.875rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Logo */}
          <div style={{ width: '3rem', height: '3rem', borderRadius: '50%', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.3)', flexShrink: 0, background: 'rgba(255,255,255,0.1)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Siddhi" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>

          {/* Brand wordmark */}
          <div>
            <h1 style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 700, fontSize: '1.25rem', color: '#fff', lineHeight: 1 }}>
              Siddhi
            </h1>
            <p style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.65)', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: '0.125rem' }}>
              Question Bank PDF Generator
            </p>
          </div>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Status badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', background: 'rgba(255,255,255,0.12)', borderRadius: '9999px', padding: '0.3rem 0.875rem', backdropFilter: 'blur(4px)' }}>
            <span style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', background: '#4ADE80', display: 'block' }} className="animate-pulse" />
            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>Ready</span>
          </div>
        </div>
      </header>

      {/* ── Step Navigation ─────────────────────────────────────────────────── */}
      <WizardNav />

      {/* ── Step Content ────────────────────────────────────────────────────── */}
      <main style={{ flex: 1, maxWidth: '80rem', margin: '0 auto', width: '100%', padding: '2rem 1rem' }}>
        <div className="animate-slide-up" key={currentStep}>
          {currentStep === 1 && <Step1Upload />}
          {currentStep === 2 && <Step2Cover />}
          {currentStep === 3 && <Step3Customize />}
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer style={{ textAlign: 'center', padding: '1rem', fontSize: '0.75rem', color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}>
        Siddhi © {new Date().getFullYear()} — Professional Question Bank PDF Generator
      </footer>
    </div>
  );
}
