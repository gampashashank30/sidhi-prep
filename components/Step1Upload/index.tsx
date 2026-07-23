'use client';

import React, { useCallback, useRef, useState } from 'react';
import { useWizardStore } from '@/store/wizardStore';
import type { ParseResult } from '@/lib/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidDocx(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith('.docx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
}

function mergeResults(results: { file: File; result: ParseResult }[]): ParseResult {
  let offset = 0;
  const mergedQuestions = results.flatMap(({ result }) => {
    const renumbered = result.questions.map((q, idx) => ({
      ...q,
      number: offset + idx + 1,
    }));
    offset += result.questions.length;
    return renumbered;
  });

  let errOffset = 0;
  const mergedErrors = results.flatMap(({ file, result }) => {
    const adjusted = result.errors.map((e) => ({
      questionNumber: e.questionNumber != null ? e.questionNumber + errOffset : null,
      message: results.length > 1 ? `[${file.name}] ${e.message}` : e.message,
    }));
    errOffset += result.questions.length;
    return adjusted;
  });

  return { questions: mergedQuestions, errors: mergedErrors };
}

function getCombinedStats(result: ParseResult) {
  const qs = result.questions;
  const topicSet = new Set(qs.map((q) => q.subjectPath.join('>')));
  const diff = { Easy: 0, Medium: 0, Hard: 0 };
  qs.forEach((q) => { diff[q.difficulty]++; });
  return { total: qs.length, topics: topicSet.size, diff };
}

// ─── Per-file state ────────────────────────────────────────────────────────────

type FileStatus = 'pending' | 'uploading' | 'done' | 'error';

interface FileEntry {
  id: string;
  file: File;
  status: FileStatus;
  result?: ParseResult;
  error?: string;
  progress: number;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function Spinner({ size = 16, color = 'var(--primary)' }: { size?: number; color?: string }) {
  return (
    <div
      className="animate-spin"
      style={{
        width: size, height: size, borderRadius: '50%',
        border: `${Math.max(2, size / 7)}px solid ${color}25`,
        borderTopColor: color, flexShrink: 0,
      }}
    />
  );
}

function StatPill({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="stat-pill">
      <span style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', background: dot, display: 'block', flexShrink: 0 }} />
      {label}
    </span>
  );
}

function FileCard({
  entry,
  onRemove,
}: {
  entry: FileEntry;
  onRemove: (id: string) => void;
}) {
  const isError  = entry.status === 'error';
  const isDone   = entry.status === 'done';
  const isLoading = entry.status === 'uploading' || entry.status === 'pending';

  const borderColor = isError ? '#FCA5A5' : isDone ? '#86EFAC' : 'var(--border)';
  const bg          = isError ? '#FEF2F2' : isDone ? '#F0FDF4' : 'var(--surface-2)';

  return (
    <div
      className="animate-fade-in"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
        padding: '0.875rem 1rem', borderRadius: '0.875rem',
        border: `1.5px solid ${borderColor}`, background: bg,
        transition: 'all 0.25s ease',
      }}
    >
      {/* Icon */}
      <div style={{
        width: '2.5rem', height: '2.5rem', borderRadius: '0.625rem', flexShrink: 0,
        background: isError ? '#FEE2E2' : isDone ? '#DCFCE7' : 'rgba(27,94,167,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isLoading ? (
          <Spinner size={18} />
        ) : isError ? (
          <svg width="18" height="18" viewBox="0 0 20 20" fill="#DC2626"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" /></svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 20 20" fill="#16A34A"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></svg>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-1)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {entry.file.name}
        </p>

        {isLoading && (
          <div style={{ marginTop: '0.375rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 500 }}>
                {entry.status === 'pending' ? 'Waiting…' : 'Parsing…'}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{entry.progress}%</span>
            </div>
            <div style={{ height: '0.25rem', borderRadius: '9999px', background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${entry.progress}%`,
                background: 'var(--primary)', borderRadius: '9999px',
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
        )}

        {isDone && entry.result && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.375rem' }}>
            <span style={{ fontSize: '0.75rem', color: '#15803D', fontWeight: 500 }}>
              {entry.result.questions.length} questions
            </span>
            {entry.result.errors.length > 0 && (
              <span style={{ fontSize: '0.75rem', color: '#D97706', fontWeight: 500, marginLeft: '0.5rem' }}>
                · {entry.result.errors.length} warning{entry.result.errors.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        {isError && (
          <p style={{ fontSize: '0.75rem', color: '#DC2626', marginTop: '0.25rem', fontWeight: 500 }}>
            {entry.error}
          </p>
        )}
      </div>

      {/* Remove */}
      {!isLoading && (
        <button
          onClick={() => onRemove(entry.id)}
          title="Remove file"
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem',
            color: 'var(--text-3)', borderRadius: '0.375rem',
            transition: 'color 0.15s, background 0.15s', flexShrink: 0,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#DC2626'; (e.currentTarget as HTMLButtonElement).style.background = '#FEE2E2'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ─── Step 1 Main ───────────────────────────────────────────────────────────────

export default function Step1Upload() {
  const { setParseResult, setStep, parseResult } = useWizardStore();
  const [dragActive, setDragActive] = useState(false);
  const [fileEntries, setFileEntries] = useState<FileEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasEntries = fileEntries.length > 0;
  const allDone    = hasEntries && fileEntries.every((e) => e.status === 'done' || e.status === 'error');
  const anyLoading = fileEntries.some((e) => e.status === 'uploading' || e.status === 'pending');
  const doneEntries = fileEntries.filter((e) => e.status === 'done' && e.result);
  const canProceed = doneEntries.length > 0 && !anyLoading &&
    doneEntries.every((e) => (e.result?.errors.length ?? 0) === 0);

  // Combined result for stats
  const combinedResult: ParseResult | null = doneEntries.length > 0
    ? mergeResults(doneEntries.map((e) => ({ file: e.file, result: e.result! })))
    : null;

  const processFiles = useCallback(async (files: File[]) => {
    const validFiles = files.filter((f) => isValidDocx(f));
    if (validFiles.length === 0) return;

    // Deduplicate by name vs existing entries
    const existingNames = new Set(fileEntries.map((e) => e.file.name));
    const newFiles = validFiles.filter((f) => !existingNames.has(f.name));
    if (newFiles.length === 0) return;

    // Create pending entries
    const newEntries: FileEntry[] = newFiles.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      status: 'pending' as FileStatus,
      progress: 0,
    }));

    setFileEntries((prev) => [...prev, ...newEntries]);

    // Process each file sequentially
    for (const entry of newEntries) {
      // Mark as uploading
      setFileEntries((prev) =>
        prev.map((e) => e.id === entry.id ? { ...e, status: 'uploading', progress: 20 } : e)
      );

      try {
        const formData = new FormData();
        formData.append('file', entry.file);

        setFileEntries((prev) =>
          prev.map((e) => e.id === entry.id ? { ...e, progress: 55 } : e)
        );

        const res = await fetch('/api/parse', { method: 'POST', body: formData });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? `Server error: ${res.status}`);
        }

        const result: ParseResult = await res.json();

        setFileEntries((prev) =>
          prev.map((e) =>
            e.id === entry.id ? { ...e, status: 'done', result, progress: 100 } : e
          )
        );
      } catch (err) {
        setFileEntries((prev) =>
          prev.map((e) =>
            e.id === entry.id
              ? { ...e, status: 'error', error: String(err instanceof Error ? err.message : err), progress: 0 }
              : e
          )
        );
      }
    }
  }, [fileEntries]);

  // Sync combined result to the wizard store whenever done entries change
  const updateStore = useCallback(() => {
    const done = fileEntries.filter((e) => e.status === 'done' && e.result);
    if (done.length === 0) return;
    const merged = mergeResults(done.map((e) => ({ file: e.file, result: e.result! })));
    const nameLabel = done.length === 1 ? done[0].file.name : `${done.length} files`;
    setParseResult(merged, nameLabel);
  }, [fileEntries, setParseResult]);

  // Keep store in sync on every fileEntries change
  React.useEffect(() => {
    const done = fileEntries.filter((e) => e.status === 'done' && e.result);
    if (done.length > 0) {
      const merged = mergeResults(done.map((e) => ({ file: e.file, result: e.result! })));
      const nameLabel = done.length === 1 ? done[0].file.name : `${done.length} files`;
      setParseResult(merged, nameLabel);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileEntries]);

  const removeEntry = useCallback((id: string) => {
    setFileEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const handleDragOver  = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragActive(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragActive(false); }, []);
  const handleDrop      = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    processFiles(files);
  }, [processFiles]);
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    processFiles(files);
    e.target.value = '';
  }, [processFiles]);

  const stats = combinedResult ? getCombinedStats(combinedResult) : null;
  const hasErrors = fileEntries.some((e) => e.status === 'error') ||
    (combinedResult && combinedResult.errors.length > 0);

  return (
    <div style={{ maxWidth: '48rem', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
         className="animate-slide-up">

      {/* ── Heading ─────────────────────────────────────────────────────────── */}
      <div>
        <h2 className="section-heading">
          <span style={{ width: '2rem', height: '2rem', borderRadius: '0.5rem', background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8125rem', fontWeight: 700 }}>1</span>
          Upload Question Bank
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', marginTop: '0.375rem', marginLeft: '2.625rem' }}>
          Upload one or more{' '}
          <code style={{ background: 'var(--bg)', padding: '0.125rem 0.375rem', borderRadius: '0.25rem', fontFamily: 'monospace', fontSize: '0.8125rem' }}>.docx</code>
          {' '}question files — questions from all files will be merged automatically.
        </p>
      </div>

      {/* ── Drop zone ───────────────────────────────────────────────────────── */}
      <div
        className={`drop-zone${dragActive ? ' active' : ''}`}
        style={hasEntries ? { minHeight: '6rem', padding: '1.5rem' } : {}}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload .docx files"
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          id="docx-upload-input"
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {/* Upload icon */}
        <div style={{
          width: hasEntries ? '2.5rem' : '4rem',
          height: hasEntries ? '2.5rem' : '4rem',
          borderRadius: '1rem', background: 'rgba(27,94,167,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.25s ease',
        }}>
          <svg
            width={hasEntries ? 20 : 32}
            height={hasEntries ? 20 : 32}
            viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
        </div>

        <div style={{ textAlign: 'center' }}>
          <p style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: hasEntries ? '0.875rem' : '0.9375rem' }}>
            {hasEntries ? 'Drop more files or click to add' : 'Drop your .docx files here'}
          </p>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-3)', marginTop: '0.25rem' }}>
            or <span style={{ color: 'var(--primary)', fontWeight: 600 }}>click to browse</span>
            {' '}— multiple .docx files supported
          </p>
        </div>
      </div>

      {/* ── File Queue ──────────────────────────────────────────────────────── */}
      {hasEntries && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.125rem' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Uploaded Files
            </h3>
            {fileEntries.length > 1 && (
              <span style={{
                fontSize: '0.75rem', fontWeight: 600,
                background: 'rgba(27,94,167,0.08)', color: 'var(--primary)',
                borderRadius: '9999px', padding: '0.125rem 0.625rem',
              }}>
                {fileEntries.length} files
              </span>
            )}
          </div>

          {fileEntries.map((entry) => (
            <FileCard key={entry.id} entry={entry} onRemove={removeEntry} />
          ))}
        </div>
      )}

      {/* ── Combined Stats Banner ────────────────────────────────────────────── */}
      {combinedResult && allDone && (
        <div className="animate-fade-in">
          {(combinedResult.errors.length === 0 && !fileEntries.some((e) => e.status === 'error')) ? (
            <div className="banner-success">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" style={{ flexShrink: 0, marginTop: '1px' }}>
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: '0.875rem' }}>
                  {doneEntries.length > 1
                    ? `All ${doneEntries.length} files parsed — ${combinedResult.questions.length} questions total`
                    : `All ${combinedResult.questions.length} questions passed validation`}
                </p>
                {stats && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginTop: '0.625rem' }}>
                    <StatPill dot="var(--primary)" label={`${stats.total} Questions`} />
                    <StatPill dot="var(--accent)"  label={`${stats.topics} Topics`} />
                    <StatPill dot="#16A34A" label={`Easy: ${stats.diff.Easy}`} />
                    <StatPill dot="#D97706" label={`Medium: ${stats.diff.Medium}`} />
                    <StatPill dot="#DC2626" label={`Hard: ${stats.diff.Hard}`} />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="banner-error">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" style={{ flexShrink: 0, marginTop: '1px' }}>
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
              </svg>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: '0.875rem' }}>
                  {combinedResult.errors.length} formatting error{combinedResult.errors.length > 1 ? 's' : ''} found — fix and re-upload affected files
                </p>
                <div style={{ marginTop: '0.75rem', maxHeight: '12rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.375rem', paddingRight: '0.25rem' }}>
                  {[...combinedResult.errors]
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
      {!hasEntries && (
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
          <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: '0.625rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            You can upload multiple .docx files — questions will be merged and renumbered sequentially.
          </p>
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
                {hasEntries
                  ? anyLoading
                    ? 'Wait for files to finish parsing…'
                    : 'Fix any errors above, then try again'
                  : 'Upload at least one valid .docx file'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
