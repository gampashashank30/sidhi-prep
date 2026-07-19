'use client';

import React, { useCallback, useState } from 'react';
import { useWizardStore } from '@/store/wizardStore';
import type { ParseResult } from '@/lib/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidDocx(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith('.docx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
}

function getStats(result: ParseResult) {
  const qs = result.questions;
  const topicSet = new Set(qs.map(q => q.subjectPath.join('>')));
  const diff = { Easy: 0, Medium: 0, Hard: 0 };
  qs.forEach(q => { diff[q.difficulty]++; });
  return { total: qs.length, topics: topicSet.size, diff };
}

type UploadState = 'idle' | 'uploading' | 'done' | 'error';

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner({ size = 20, color = 'var(--primary)' }: { size?: number; color?: string }) {
  return (
    <div
      className="animate-spin"
      style={{
        width: size, height: size, borderRadius: '50%',
        border: `${Math.max(2, size / 8)}px solid ${color}20`,
        borderTopColor: color,
      }}
    />
  );
}

// ─── Stat Pill ────────────────────────────────────────────────────────────────

function StatPill({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="stat-pill">
      <span style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', background: dot, display: 'block', flexShrink: 0 }} />
      {label}
    </span>
  );
}

// ─── Step 1 ───────────────────────────────────────────────────────────────────

export default function Step1Upload() {
  const { setParseResult, setStep, parseResult, uploadedFileName } = useWizardStore();
  const [uploadState, setUploadState]   = useState<UploadState>(parseResult ? 'done' : 'idle');
  const [dragActive, setDragActive]     = useState(false);
  const [clientError, setClientError]   = useState<string | null>(null);
  const [progress, setProgress]         = useState(0);

  const processFile = useCallback(async (file: File) => {
    setClientError(null);
    if (!isValidDocx(file)) {
      setClientError('Only .docx files are accepted. Please upload a Word document (.docx).');
      return;
    }

    setUploadState('uploading');
    setProgress(30);

    try {
      const formData = new FormData();
      formData.append('file', file);
      setProgress(60);

      const res = await fetch('/api/parse', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Server error: ${res.status}`);
      }

      const result: ParseResult = await res.json();
      setProgress(100);
      setParseResult(result, file.name);
      setUploadState('done');
    } catch (err) {
      setClientError(String(err instanceof Error ? err.message : err));
      setUploadState('error');
    }
  }, [setParseResult]);

  const handleDragOver  = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragActive(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragActive(false); }, []);
  const handleDrop      = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, [processFile]);
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  }, [processFile]);

  const canProceed = parseResult !== null && parseResult.errors.length === 0;

  return (
    <div style={{ maxWidth: '44rem', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
         className="animate-slide-up">

      {/* ── Heading ─────────────────────────────────────────────────────────── */}
      <div>
        <h2 className="section-heading">
          <span style={{ width: '2rem', height: '2rem', borderRadius: '0.5rem', background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8125rem', fontWeight: 700 }}>1</span>
          Upload Question Bank
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', marginTop: '0.375rem', marginLeft: '2.625rem' }}>
          Upload your <code style={{ background: 'var(--bg)', padding: '0.125rem 0.375rem', borderRadius: '0.25rem', fontFamily: 'monospace', fontSize: '0.8125rem' }}>.docx</code> question file — we'll validate the format instantly.
        </p>
      </div>

      {/* ── Drop zone ───────────────────────────────────────────────────────── */}
      <div
        className={`drop-zone${dragActive ? ' active' : ''}${clientError ? ' error' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => document.getElementById('docx-upload-input')?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload .docx file"
        onKeyDown={(e) => e.key === 'Enter' && document.getElementById('docx-upload-input')?.click()}
      >
        <input
          id="docx-upload-input"
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {uploadState === 'uploading' ? (
          <>
            <Spinner size={40} />
            <div>
              <p style={{ fontWeight: 600, color: 'var(--primary)', fontSize: '0.9375rem' }}>Parsing your document…</p>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-3)', marginTop: '0.25rem' }}>Extracting and validating questions</p>
            </div>
            <div style={{ width: '12rem', height: '0.375rem', borderRadius: '9999px', background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: 'var(--primary)', borderRadius: '9999px', transition: 'width 0.5s ease' }} />
            </div>
          </>
        ) : (
          <>
            {/* Upload icon */}
            <div style={{ width: '4rem', height: '4rem', borderRadius: '1rem', background: 'rgba(27,94,167,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>
              </svg>
            </div>
            <div>
              <p style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: '0.9375rem' }}>
                {uploadedFileName ? `Replace "${uploadedFileName}"` : 'Drop your .docx file here'}
              </p>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-3)', marginTop: '0.25rem' }}>
                or <span style={{ color: 'var(--primary)', fontWeight: 600 }}>click to browse</span> — .docx files only
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── Client error ────────────────────────────────────────────────────── */}
      {clientError && (
        <div className="banner-error animate-fade-in">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" style={{ flexShrink: 0, marginTop: '1px' }}>
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
          </svg>
          <div>
            <p style={{ fontWeight: 700, fontSize: '0.875rem' }}>Upload failed</p>
            <p style={{ fontSize: '0.875rem', marginTop: '0.125rem' }}>{clientError}</p>
          </div>
        </div>
      )}

      {/* ── Parse results ────────────────────────────────────────────────────── */}
      {parseResult && uploadState === 'done' && (
        <div className="animate-fade-in">
          {parseResult.errors.length === 0 ? (
            <div className="banner-success">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" style={{ flexShrink: 0, marginTop: '1px' }}>
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: '0.875rem' }}>
                  All {parseResult.questions.length} questions passed validation
                </p>
                {(() => {
                  const { total, topics, diff } = getStats(parseResult);
                  return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginTop: '0.625rem' }}>
                      <StatPill dot="var(--primary)" label={`${total} Questions`} />
                      <StatPill dot="var(--accent)"  label={`${topics} Topics`} />
                      <StatPill dot="#16A34A" label={`Easy: ${diff.Easy}`} />
                      <StatPill dot="#D97706" label={`Medium: ${diff.Medium}`} />
                      <StatPill dot="#DC2626" label={`Hard: ${diff.Hard}`} />
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className="banner-error">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" style={{ flexShrink: 0, marginTop: '1px' }}>
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
              </svg>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: '0.875rem' }}>
                  {parseResult.errors.length} formatting error{parseResult.errors.length > 1 ? 's' : ''} found — fix and re-upload
                </p>
                <div style={{ marginTop: '0.75rem', maxHeight: '14rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.375rem', paddingRight: '0.25rem' }}>
                  {[...parseResult.errors]
                    .sort((a, b) => (a.questionNumber ?? -1) - (b.questionNumber ?? -1))
                    .map((err, i) => (
                      <div key={i} style={{ display: 'flex', gap: '0.625rem', fontSize: '0.8125rem', background: 'rgba(255,255,255,0.6)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', border: '1px solid #FECACA' }}>
                        <span style={{ fontWeight: 700, color: '#B91C1C', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {err.questionNumber != null ? `Q${err.questionNumber}` : 'Doc'}
                        </span>
                        <span style={{ color: '#991B1B' }}>{err.message}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Format guide card ────────────────────────────────────────────────── */}
      {uploadState === 'idle' && (
        <div className="card animate-fade-in" style={{ padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-2)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
            </svg>
            Expected format per question:
          </div>
          <pre style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontFamily: 'monospace', lineHeight: 1.7, overflow: 'auto', background: 'var(--bg)', borderRadius: '0.5rem', padding: '0.75rem' }}>
{`Q1. Which planet is closest to the Sun?
A. Venus   B. Mercury   C. Mars   D. Earth
Ans: B
Exp: Mercury is the innermost planet in the Solar System.
Difficulty: Easy
Subject: GS > Science > Solar System`}
          </pre>
        </div>
      )}

      {/* ── Navigation ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.5rem' }}>
        <div style={{ position: 'relative' }}>
          <button
            id="step1-continue"
            className="btn-primary"
            disabled={!canProceed}
            onClick={() => setStep(2)}
          >
            Continue to Step 2
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </button>
          {!canProceed && (
            <div style={{ position: 'absolute', right: 0, bottom: 'calc(100% + 0.5rem)', display: 'none', zIndex: 50 }} className="tooltip-on-parent-hover">
              <div style={{ background: '#0F172A', color: '#fff', fontSize: '0.75rem', borderRadius: '0.5rem', padding: '0.375rem 0.75rem', whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
                {parseResult ? 'Fix the errors above and re-upload' : 'Upload a valid .docx file first'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
