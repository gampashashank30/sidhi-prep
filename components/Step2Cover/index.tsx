'use client';

import React, { useCallback, useRef, useState, useMemo } from 'react';
import { useWizardStore } from '@/store/wizardStore';
import { buildTopicTree } from '@/lib/topicTree';
import type { TopicNode } from '@/lib/topicTree';
import type { Question } from '@/lib/types';

// ─── Difficulty metadata ──────────────────────────────────────────────────────

type Difficulty = 'Very Easy' | 'Easy' | 'Medium' | 'Hard';

const DIFF_META: Record<Difficulty, {
  bg: string; activeBg: string; text: string; activeText: string; border: string;
  pillBg: string; pillText: string;
}> = {
  'Very Easy': { bg: '#F0FDF4', activeBg: '#16A34A', text: '#15803D', activeText: '#fff', border: '#86EFAC', pillBg: '#dcfce7', pillText: '#15803d' },
  'Easy':      { bg: '#EFF6FF', activeBg: '#2563EB', text: '#1D4ED8', activeText: '#fff', border: '#BFDBFE', pillBg: '#dbeafe', pillText: '#1d4ed8' },
  'Medium':    { bg: '#FFFBEB', activeBg: '#D97706', text: '#B45309', activeText: '#fff', border: '#FCD34D', pillBg: '#fef9c3', pillText: '#a16207' },
  'Hard':      { bg: '#FEF2F2', activeBg: '#DC2626', text: '#B91C1C', activeText: '#fff', border: '#FCA5A5', pillBg: '#fee2e2', pillText: '#b91c1c' },
};

// ─── Tri-state Checkbox ───────────────────────────────────────────────────────

type CheckState = 'checked' | 'unchecked' | 'indeterminate';

function TriCheckbox({ state, onChange }: { state: CheckState; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = state === 'indeterminate';
      ref.current.checked = state === 'checked';
    }
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      style={{ width: '1rem', height: '1rem', cursor: 'pointer', flexShrink: 0, accentColor: 'var(--primary)' }}
      onChange={onChange}
      checked={state === 'checked'}
    />
  );
}

// ─── Topic Tree Node ──────────────────────────────────────────────────────────

function TopicTreeNode({
  node, selectedNums, onToggle, onFocus, focusedPath, depth = 0,
}: {
  node: TopicNode;
  selectedNums: Set<number>;
  onToggle: (numbers: number[]) => void;
  onFocus: (path: string[] | null) => void;
  focusedPath: string[] | null;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);

  function getAllNums(n: TopicNode): number[] {
    if (n.children.length === 0) return n.questionNumbers;
    return [...n.questionNumbers, ...n.children.flatMap(getAllNums)];
  }

  const allNums = getAllNums(node);
  const selectedCount = allNums.filter(n => selectedNums.has(n)).length;
  const checkState: CheckState =
    selectedCount === 0 ? 'unchecked' :
    selectedCount === allNums.length ? 'checked' : 'indeterminate';

  // Is this node or an ancestor of the focused path?
  const isFocused = focusedPath !== null &&
    focusedPath.length >= node.fullPath.length &&
    node.fullPath.every((seg, i) => focusedPath[i] === seg);
  // Is this node exactly the focused path?
  const isExactFocus = focusedPath !== null &&
    focusedPath.length === node.fullPath.length && isFocused;

  const handleCheck = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (checkState === 'unchecked') onToggle(allNums);
    else onToggle(allNums.map(n => -n));
  };

  const handleFocus = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFocus(isExactFocus ? null : node.fullPath);
  };

  return (
    <div>
      <div
        onClick={handleFocus}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.375rem',
          paddingLeft: `${depth * 14 + 6}px`, paddingRight: '6px',
          paddingTop: '5px', paddingBottom: '5px',
          borderRadius: '0.375rem', cursor: 'pointer',
          background: isExactFocus ? 'rgba(27,94,167,0.1)' : isFocused ? 'rgba(27,94,167,0.04)' : 'transparent',
          transition: 'background 0.1s',
        }}
        className="hover:bg-[rgba(27,94,167,0.06)]"
      >
        {/* Checkbox — stops propagation so it doesn't trigger focus */}
        <div onClick={handleCheck} style={{ lineHeight: 0, flexShrink: 0 }}>
          <TriCheckbox state={checkState} onChange={() => {}} />
        </div>

        {/* Expand/collapse arrow */}
        {node.children.length > 0 ? (
          <button
            onClick={e => { e.stopPropagation(); setExpanded(x => !x); }}
            style={{ padding: '2px', borderRadius: '3px', border: 'none', background: 'none', cursor: 'pointer', lineHeight: 0, flexShrink: 0 }}
          >
            <svg
              style={{
                width: '11px', height: '11px', color: '#6b7280',
                transition: 'transform 0.15s',
                transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                display: 'block',
              }}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        ) : (
          <span style={{ width: '15px', flexShrink: 0 }} />
        )}

        {/* Label */}
        <span style={{
          flex: 1, fontSize: '0.8125rem', lineHeight: 1.3,
          color: isExactFocus ? 'var(--primary)' : '#374151',
          fontWeight: isExactFocus ? 700 : isFocused ? 600 : 500,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          userSelect: 'none',
        }}>
          {node.label}
        </span>

        {/* selected / total badge */}
        <span style={{
          fontSize: '0.625rem', flexShrink: 0,
          color: selectedCount > 0 ? 'var(--primary)' : '#9ca3af',
          background: selectedCount > 0 ? 'rgba(27,94,167,0.1)' : '#f3f4f6',
          borderRadius: '9999px', padding: '1px 6px', lineHeight: '1.5', fontWeight: 600,
        }}>
          {selectedCount}/{node.questionCount}
        </span>
      </div>

      {expanded && node.children.length > 0 && (
        <div>
          {node.children.map(child => (
            <TopicTreeNode
              key={child.slug}
              node={child}
              selectedNums={selectedNums}
              onToggle={onToggle}
              onFocus={onFocus}
              focusedPath={focusedPath}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Question Card ────────────────────────────────────────────────────────────

function QuestionCard({ q, displayNum, isSelected, onToggle }: {
  q: Question;
  displayNum: number;
  isSelected: boolean;
  onToggle: (num: number) => void;
}) {
  const diff = q.difficulty as Difficulty | undefined;
  const diffMeta = diff ? DIFF_META[diff] : null;

  return (
    <div
      onClick={() => onToggle(q.number)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: '0.625rem',
        padding: '0.75rem 0.875rem',
        borderRadius: '0.625rem',
        border: `1.5px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
        background: isSelected ? 'rgba(27,94,167,0.04)' : '#fff',
        cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
        boxShadow: isSelected ? '0 0 0 3px rgba(27,94,167,0.08)' : 'none',
      }}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onToggle(q.number)}
        onClick={e => e.stopPropagation()}
        style={{
          flexShrink: 0, marginTop: '0.25rem',
          width: '1rem', height: '1rem',
          cursor: 'pointer', accentColor: 'var(--primary)',
        }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Top metadata row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.3125rem', flexWrap: 'wrap' }}>
          {/* Q number */}
          <span style={{
            fontSize: '0.6875rem', fontWeight: 700, flexShrink: 0,
            color: 'var(--primary)', background: 'rgba(27,94,167,0.12)',
            padding: '1px 7px', borderRadius: '4px',
          }}>
            Q{displayNum}
          </span>

          {/* Difficulty pill */}
          {diffMeta && (
            <span style={{
              fontSize: '0.625rem', fontWeight: 700, flexShrink: 0,
              padding: '1px 6px', borderRadius: '9999px',
              background: diffMeta.pillBg, color: diffMeta.pillText,
            }}>
              {diff}
            </span>
          )}

          {/* Topic breadcrumb */}
          {q.subjectPath.length > 0 && (
            <span style={{
              fontSize: '0.625rem', color: 'var(--text-3)',
              overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', flex: 1, minWidth: 0,
            }}>
              {q.subjectPath.join(' › ')}
            </span>
          )}
        </div>

        {/* Question text — 2 line clamp */}
        <p style={{
          fontSize: '0.8125rem', color: '#1f2937',
          lineHeight: 1.55, margin: 0,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical' as const,
        }}>
          {q.text}
        </p>

        {/* Answer options preview — only first option shown on card */}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.375rem', flexWrap: 'wrap' }}>
          {(['A', 'B', 'C', 'D'] as const).map(opt => (
            <span key={opt} style={{
              fontSize: '0.625rem', color: '#6b7280',
              display: 'flex', gap: '3px', alignItems: 'flex-start',
              maxWidth: '120px',
            }}>
              <strong style={{ color: 'var(--primary)', flexShrink: 0 }}>{opt})</strong>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {q.options[opt]}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Selected indicator */}
      {isSelected && (
        <div style={{
          flexShrink: 0, marginTop: '0.125rem',
          width: '1.25rem', height: '1.25rem',
          borderRadius: '50%',
          background: 'var(--primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
      )}
    </div>
  );
}

// ─── Step 2 Main Component ────────────────────────────────────────────────────

export default function Step2Cover() {
  const {
    parseResult, selectedQuestionNumbers,
    setSelectedQuestions, selectAllQuestions, deselectAllQuestions,
    setStep,
  } = useWizardStore();

  const questions = parseResult?.questions ?? [];
  const topicTree = useMemo(() => buildTopicTree(questions), [questions]);
  const selectedSet = useMemo(() => new Set(selectedQuestionNumbers), [selectedQuestionNumbers]);
  const canProceed = selectedQuestionNumbers.length > 0;

  // Precompute display number for each question (1-based position in full list)
  const qDisplayNum = useMemo(() =>
    new Map(questions.map((q, i) => [q.number, i + 1])),
    [questions]
  );

  // ── Difficulty filter ─────────────────────────────────────────────────────
  const availableDifficulties = useMemo((): Difficulty[] => {
    const found = new Set(questions.map(q => q.difficulty as Difficulty));
    const order: Difficulty[] = ['Very Easy', 'Easy', 'Medium', 'Hard'];
    return order.filter(d => found.has(d));
  }, [questions]);

  const [activeDiffs, setActiveDiffs] = useState<Set<Difficulty>>(() => new Set(availableDifficulties));
  const prevAvailable = useRef(availableDifficulties);
  React.useEffect(() => {
    if (prevAvailable.current !== availableDifficulties) {
      prevAvailable.current = availableDifficulties;
      setActiveDiffs(new Set(availableDifficulties));
    }
  }, [availableDifficulties]);

  const toggleDifficulty = useCallback((diff: Difficulty) => {
    setActiveDiffs(prev => {
      const next = new Set(prev);
      const turningOn = !next.has(diff);
      if (turningOn) next.add(diff); else next.delete(diff);
      const cur = new Set(selectedQuestionNumbers);
      if (turningOn) questions.filter(q => q.difficulty === diff).forEach(q => cur.add(q.number));
      else            questions.filter(q => q.difficulty === diff).forEach(q => cur.delete(q.number));
      setSelectedQuestions(Array.from(cur));
      return next;
    });
  }, [questions, selectedQuestionNumbers, setSelectedQuestions]);

  // ── Topic focus (filters right panel) ───────────────────────────────────
  const [focusedPath, setFocusedPath] = useState<string[] | null>(null);

  // ── Search ───────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');

  // ── Bulk topic toggle ────────────────────────────────────────────────────
  const handleTopicToggle = useCallback((nums: number[]) => {
    const cur = new Set(selectedQuestionNumbers);
    for (const n of nums) { if (n < 0) cur.delete(-n); else cur.add(n); }
    setSelectedQuestions(Array.from(cur));
  }, [selectedQuestionNumbers, setSelectedQuestions]);

  // ── Individual question toggle ───────────────────────────────────────────
  const handleQToggle = useCallback((num: number) => {
    const cur = new Set(selectedQuestionNumbers);
    if (cur.has(num)) cur.delete(num); else cur.add(num);
    setSelectedQuestions(Array.from(cur));
  }, [selectedQuestionNumbers, setSelectedQuestions]);

  // ── Filtered questions for right panel ──────────────────────────────────
  const displayedQuestions = useMemo(() => {
    let qs = questions;
    if (focusedPath) {
      qs = qs.filter(q =>
        q.subjectPath.length >= focusedPath.length &&
        focusedPath.every((seg, i) => q.subjectPath[i] === seg)
      );
    }
    if (searchQuery.trim()) {
      const lower = searchQuery.toLowerCase();
      qs = qs.filter(q =>
        q.text.toLowerCase().includes(lower) ||
        q.subjectPath.some(p => p.toLowerCase().includes(lower)) ||
        String(q.number).includes(lower)
      );
    }
    return qs;
  }, [questions, focusedPath, searchQuery]);

  const selectedInView = displayedQuestions.filter(q => selectedSet.has(q.number)).length;
  const allInViewSelected = displayedQuestions.length > 0 && selectedInView === displayedQuestions.length;

  const toggleAllInView = useCallback(() => {
    const cur = new Set(selectedQuestionNumbers);
    if (allInViewSelected) {
      displayedQuestions.forEach(q => cur.delete(q.number));
    } else {
      displayedQuestions.forEach(q => cur.add(q.number));
    }
    setSelectedQuestions(Array.from(cur));
  }, [allInViewSelected, displayedQuestions, selectedQuestionNumbers, setSelectedQuestions]);

  const allSelected = selectedQuestionNumbers.length === questions.length;
  const noneSelected = selectedQuestionNumbers.length === 0;
  const hasFilter = !!focusedPath || !!searchQuery.trim();

  return (
    <div style={{ maxWidth: '88rem', margin: '0 auto' }} className="animate-slide-up">

      {/* ── Page title ─────────────────────────────────────────── */}
      <div style={{ marginBottom: '1rem' }}>
        <h2 className="section-heading">
          <span style={{
            width: '2rem', height: '2rem', borderRadius: '0.5rem',
            background: 'var(--primary)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.875rem', fontWeight: 700, flexShrink: 0,
          }}>2</span>
          Topic &amp; Question Selection
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', marginTop: '0.25rem', marginLeft: '2.625rem' }}>
          Use the left panel to bulk-select by topic or difficulty. Browse and pick individual questions on the right.
        </p>
      </div>

      {/* ── Status bar ────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#fff', borderRadius: '0.875rem',
        border: `1.5px solid ${canProceed ? 'var(--border)' : '#fca5a5'}`,
        padding: '0.625rem 1.125rem', marginBottom: '1rem',
        boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
        flexWrap: 'wrap', gap: '0.5rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Selected pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: '0.5rem', height: '0.5rem', borderRadius: '50%',
              background: canProceed ? 'var(--accent)' : '#ef4444',
            }} />
            <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: canProceed ? 'var(--primary)' : '#dc2626' }}>
              {selectedQuestionNumbers.length}
            </span>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-2)' }}>
              of {questions.length} questions selected
            </span>
          </div>
          {!canProceed && (
            <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 500 }}>
              — select at least one to continue
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.375rem' }}>
          <button
            className="btn-ghost"
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.875rem', borderRadius: '0.5rem' }}
            onClick={selectAllQuestions}
            disabled={allSelected}
          >
            Select All
          </button>
          <button
            className="btn-ghost"
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.875rem', borderRadius: '0.5rem' }}
            onClick={deselectAllQuestions}
            disabled={noneSelected}
          >
            Deselect All
          </button>
        </div>
      </div>

      {/* ── Two-panel layout ────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1rem', alignItems: 'start' }}>

        {/* ══ LEFT: Filter Panel ══════════════════════════════════ */}
        <div style={{ position: 'sticky', top: '5.5rem' }}>
          <div className="card" style={{ padding: '1rem', overflow: 'hidden' }}>

            {/* Difficulty section */}
            {availableDifficulties.length > 0 && (
              <div style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
                <p style={{
                  fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-2)',
                  marginBottom: '0.5rem', letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>
                  Filter by Difficulty
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3125rem' }}>
                  {availableDifficulties.map(diff => {
                    const meta = DIFF_META[diff];
                    const isActive = activeDiffs.has(diff);
                    const total = questions.filter(q => q.difficulty === diff).length;
                    const selected = questions.filter(q => q.difficulty === diff && selectedSet.has(q.number)).length;
                    return (
                      <button
                        key={diff}
                        onClick={() => toggleDifficulty(diff)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          width: '100%',
                          padding: '0.375rem 0.75rem',
                          borderRadius: '0.5rem',
                          border: `1.5px solid ${isActive ? meta.activeBg : meta.border}`,
                          background: isActive ? meta.activeBg : meta.bg,
                          color: isActive ? meta.activeText : meta.text,
                          fontSize: '0.8125rem', fontWeight: 600,
                          cursor: 'pointer', transition: 'all 0.15s',
                          textAlign: 'left',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {isActive ? (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          ) : (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          )}
                          {diff}
                        </div>
                        <span style={{
                          fontSize: '0.6875rem',
                          background: isActive ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.08)',
                          borderRadius: '9999px', padding: '1px 7px',
                        }}>
                          {selected}/{total}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {activeDiffs.size < availableDifficulties.length && (
                  <p style={{ fontSize: '0.6875rem', color: '#f59e0b', marginTop: '0.375rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <span>⚠</span> Some difficulties excluded from PDF
                  </p>
                )}
              </div>
            )}

            {/* Topic tree section */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <p style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Topics
                </p>
                {focusedPath && (
                  <button
                    onClick={() => setFocusedPath(null)}
                    style={{ fontSize: '0.6875rem', color: 'var(--primary)', fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '2px' }}
                  >
                    Show all <span style={{ fontSize: '0.8125rem' }}>×</span>
                  </button>
                )}
              </div>
              <div style={{ overflowY: 'auto', maxHeight: '56vh' }}>
                {topicTree.length === 0 ? (
                  <p style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-3)', padding: '2rem 0' }}>No topics found</p>
                ) : (
                  topicTree.map(node => (
                    <TopicTreeNode
                      key={node.slug}
                      node={node}
                      selectedNums={selectedSet}
                      onToggle={handleTopicToggle}
                      onFocus={setFocusedPath}
                      focusedPath={focusedPath}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ══ RIGHT: Question List ════════════════════════════════ */}
        <div className="card" style={{ padding: '1rem' }}>

          {/* Right panel header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.875rem', flexWrap: 'wrap' }}>

            {/* Search input */}
            <div style={{ flex: 1, minWidth: '180px', position: 'relative' }}>
              <svg style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', width: '0.9375rem', height: '0.9375rem', color: 'var(--text-3)', pointerEvents: 'none' }}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                placeholder="Search by question text or topic…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '2.25rem', height: '2.25rem', fontSize: '0.8125rem', borderRadius: '0.625rem' }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', right: '0.625rem', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '1rem', lineHeight: 1 }}
                >
                  ×
                </button>
              )}
            </div>

            {/* Active topic filter chip */}
            {focusedPath && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.25rem',
                background: 'rgba(27,94,167,0.08)', border: '1px solid rgba(27,94,167,0.2)',
                borderRadius: '9999px', padding: '0.25rem 0.75rem',
                fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600, whiteSpace: 'nowrap',
              }}>
                <svg style={{ width: '0.75rem', height: '0.75rem' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
                {focusedPath[focusedPath.length - 1]}
                <button onClick={() => setFocusedPath(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--primary)', padding: '0 0 0 2px', lineHeight: 1, fontSize: '0.9rem' }}>×</button>
              </div>
            )}

            {/* Stats + Select-in-view toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
                {displayedQuestions.length} shown · {selectedInView} selected
              </span>
              {displayedQuestions.length > 0 && (
                <button
                  onClick={toggleAllInView}
                  style={{
                    fontSize: '0.75rem', fontWeight: 600, padding: '0.25rem 0.75rem',
                    borderRadius: '0.5rem', border: '1.5px solid var(--border)',
                    background: '#fff', color: 'var(--text-2)', cursor: 'pointer',
                    transition: 'all 0.15s', whiteSpace: 'nowrap',
                  }}
                >
                  {allInViewSelected ? 'Deselect shown' : 'Select shown'}
                </button>
              )}
            </div>
          </div>

          {/* Question list */}
          <div style={{ overflowY: 'auto', maxHeight: '72vh', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {displayedQuestions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3.5rem 0', color: 'var(--text-3)' }}>
                <svg style={{ width: '2.5rem', height: '2.5rem', margin: '0 auto 0.75rem', opacity: 0.4 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                </svg>
                <p style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem' }}>No questions match your filters</p>
                {hasFilter && (
                  <button
                    onClick={() => { setSearchQuery(''); setFocusedPath(null); }}
                    style={{ fontSize: '0.8125rem', color: 'var(--primary)', fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              displayedQuestions.map(q => (
                <QuestionCard
                  key={q.number}
                  q={q}
                  displayNum={qDisplayNum.get(q.number) ?? q.number}
                  isSelected={selectedSet.has(q.number)}
                  onToggle={handleQToggle}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Navigation ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '1.25rem' }}>
        <button className="btn-ghost" onClick={() => setStep(1)}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back
        </button>

        <div style={{ position: 'relative' }} className="group">
          <button
            id="step2-continue"
            className="btn-primary"
            disabled={!canProceed}
            onClick={() => setStep(3)}
          >
            Continue to Step 3
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </button>
          {!canProceed && (
            <div style={{ position: 'absolute', right: 0, bottom: '110%', marginBottom: '0.375rem' }} className="hidden group-hover:block z-50">
              <div style={{ background: '#111827', color: '#fff', fontSize: '0.75rem', borderRadius: '0.5rem', padding: '0.375rem 0.875rem', whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}>
                Select at least one question to continue
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
