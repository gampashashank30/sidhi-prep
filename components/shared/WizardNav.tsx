'use client';

import { useWizardStore } from '@/store/wizardStore';

const STEPS = [
  { number: 1, label: 'Upload & Validate' },
  { number: 2, label: 'Topic Selection' },
  { number: 3, label: 'Cover & Export' },
];

export default function WizardNav() {
  const currentStep = useWizardStore((s) => s.currentStep);

  return (
    <nav className="sticky top-0 z-40" style={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
      <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '0.75rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          {STEPS.map((step, i) => {
            const isActive    = currentStep === step.number;
            const isCompleted = currentStep > step.number;
            const isLast      = i === STEPS.length - 1;

            return (
              <div key={step.number} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {/* Dot + label */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                  <div
                    className={`step-dot ${isActive ? 'active' : isCompleted ? 'completed' : 'inactive'}`}
                    aria-current={isActive ? 'step' : undefined}
                  >
                    {isCompleted ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    ) : step.number}
                  </div>
                  <span style={{
                    fontSize: '0.6875rem', fontWeight: 600, whiteSpace: 'nowrap',
                    color: isActive ? 'var(--primary)' : isCompleted ? 'var(--accent)' : 'var(--text-3)',
                    letterSpacing: '0.02em',
                  }}>
                    {step.label}
                  </span>
                </div>

                {/* Connector */}
                {!isLast && (
                  <div
                    className={`step-connector ${isCompleted ? 'completed' : 'inactive'}`}
                    style={{ marginBottom: '1.25rem' }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
