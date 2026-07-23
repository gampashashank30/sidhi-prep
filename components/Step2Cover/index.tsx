'use client';

import React, { useCallback, useRef, useState } from 'react';
import { useWizardStore } from '@/store/wizardStore';
import { buildTopicTree } from '@/lib/topicTree';
import type { TopicNode } from '@/lib/topicTree';

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
      className="w-4 h-4 rounded accent-[var(--primary)] cursor-pointer flex-shrink-0"
      onChange={onChange}
      checked={state === 'checked'}
    />
  );
}

// ─── Recursive topic tree node ────────────────────────────────────────────────

function TopicTreeNode({
  node,
  selectedNums,
  onToggle,
  depth = 0,
}: {
  node: TopicNode;
  selectedNums: Set<number>;
  onToggle: (numbers: number[]) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(true);

  // Collect all leaf question numbers under this node
  function getAllNums(n: TopicNode): number[] {
    if (n.children.length === 0) return n.questionNumbers;
    return [...n.questionNumbers, ...n.children.flatMap(getAllNums)];
  }

  const allNums = getAllNums(node);
  const selectedCount = allNums.filter(n => selectedNums.has(n)).length;

  const checkState: CheckState =
    selectedCount === 0 ? 'unchecked' :
    selectedCount === allNums.length ? 'checked' : 'indeterminate';

  const handleCheck = () => {
    if (checkState === 'unchecked') {
      onToggle(allNums);           // positive = add
    } else {
      onToggle(allNums.map(n => -n)); // negative = remove
    }
  };

  return (
    <div>
      <div
        className="checkbox-tree-item"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <TriCheckbox state={checkState} onChange={handleCheck} />

        {node.children.length > 0 && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="p-0.5 rounded hover:bg-gray-200 transition-colors"
          >
            <svg
              className={`w-3.5 h-3.5 text-gray-500 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        )}

        <span
          className="text-sm text-gray-700 flex-1 cursor-pointer select-none font-medium"
          onClick={handleCheck}
        >
          {node.label}
        </span>

        <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5 flex-shrink-0">
          {node.questionCount}
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
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Difficulty colours ───────────────────────────────────────────────────────

type Difficulty = 'Very Easy' | 'Easy' | 'Medium' | 'Hard';

const DIFF_META: Record<Difficulty, { bg: string; activeBg: string; text: string; activeText: string; border: string }> = {
  'Very Easy': { bg: '#F0FDF4', activeBg: '#16A34A', text: '#15803D', activeText: '#fff', border: '#86EFAC' },
  'Easy':      { bg: '#EFF6FF', activeBg: '#2563EB', text: '#1D4ED8', activeText: '#fff', border: '#BFDBFE' },
  'Medium':    { bg: '#FFFBEB', activeBg: '#D97706', text: '#B45309', activeText: '#fff', border: '#FCD34D' },
  'Hard':      { bg: '#FEF2F2', activeBg: '#DC2626', text: '#B91C1C', activeText: '#fff', border: '#FCA5A5' },
};

// ─── Step 2 Main Component ────────────────────────────────────────────────────

export default function Step2Cover() {
  const {
    parseResult, selectedQuestionNumbers,
    setSelectedQuestions, selectAllQuestions, deselectAllQuestions,
    setStep,
  } = useWizardStore();

  const questions = parseResult?.questions ?? [];
  const topicTree = React.useMemo(() => buildTopicTree(questions), [questions]);
  const selectedSet = new Set(selectedQuestionNumbers);
  const canProceed = selectedQuestionNumbers.length > 0;

  // ── Difficulty filter state ───────────────────────────────────────────────
  // Derive which difficulties actually exist in the document
  const availableDifficulties = React.useMemo((): Difficulty[] => {
    const found = new Set(questions.map(q => q.difficulty as Difficulty));
    const order: Difficulty[] = ['Very Easy', 'Easy', 'Medium', 'Hard'];
    return order.filter(d => found.has(d));
  }, [questions]);

  // Active = difficulty is shown in PDF (included). Start with all active.
  const [activeDiffs, setActiveDiffs] = useState<Set<Difficulty>>(
    () => new Set(availableDifficulties)
  );

  // Re-sync when the document changes (new upload)
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
      const turning_on = !next.has(diff);
      if (turning_on) {
        next.add(diff);
      } else {
        next.delete(diff);
      }

      // Apply the change to selectedQuestionNumbers immediately
      const currentSet = new Set(selectedQuestionNumbers);
      if (turning_on) {
        // Re-select all questions of this difficulty
        questions.filter(q => q.difficulty === diff).forEach(q => currentSet.add(q.number));
      } else {
        // Deselect all questions of this difficulty
        questions.filter(q => q.difficulty === diff).forEach(q => currentSet.delete(q.number));
      }
      setSelectedQuestions(Array.from(currentSet));

      return next;
    });
  }, [questions, selectedQuestionNumbers, setSelectedQuestions]);

  // ── Topic toggle handler ──────────────────────────────────────────────────
  const handleToggle = useCallback((nums: number[]) => {
    const currentSet = new Set(selectedQuestionNumbers);
    for (const n of nums) {
      if (n < 0) currentSet.delete(-n);
      else currentSet.add(n);
    }
    setSelectedQuestions(Array.from(currentSet));
  }, [selectedQuestionNumbers, setSelectedQuestions]);

  const allSelected = selectedQuestionNumbers.length === questions.length;
  const noneSelected = selectedQuestionNumbers.length === 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-slide-up">
      {/* ── Page title ─────────────────────────────────────────────── */}
      <div>
        <h2 className="section-heading">
          <span className="w-8 h-8 rounded-lg bg-[var(--primary)] text-white flex items-center justify-center text-sm font-bold flex-shrink-0">2</span>
          Topic &amp; Question Selection
        </h2>
        <p className="text-sm text-gray-500 mt-1 ml-10">
          Choose which difficulty levels and topics to include in your PDF.
        </p>
      </div>

      {/* ── Main selection card ──────────────────────────────────────── */}
      <div className="card">

        {/* ── Card header — icon | title+subtitle | All/None buttons ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {/* Icon */}
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
            </svg>
          </div>

          {/* Title + subtitle */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 className="font-bold text-gray-900" style={{ lineHeight: '1.2' }}>Select Topics</h3>
            <p className="text-xs text-gray-500" style={{ marginTop: '0.125rem' }}>
              <span className={`font-semibold ${canProceed ? 'text-[var(--primary)]' : 'text-red-500'}`}>
                {selectedQuestionNumbers.length}
              </span>
              {' '}of {questions.length} questions selected
            </p>
          </div>

          {/* All / None buttons */}
          <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
            <button className="btn-ghost text-xs px-2 py-1" onClick={selectAllQuestions} disabled={allSelected}>
              All
            </button>
            <button className="btn-ghost text-xs px-2 py-1" onClick={deselectAllQuestions} disabled={noneSelected}>
              None
            </button>
          </div>
        </div>

        {/* ── Difficulty filter toggles ─────────────────────────────── */}
        {availableDifficulties.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.5rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Filter by Difficulty
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {availableDifficulties.map(diff => {
                const meta = DIFF_META[diff];
                const isActive = activeDiffs.has(diff);
                const count = questions.filter(q => q.difficulty === diff).length;
                return (
                  <button
                    key={diff}
                    onClick={() => toggleDifficulty(diff)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.375rem',
                      padding: '0.3125rem 0.75rem',
                      borderRadius: '9999px',
                      border: `1.5px solid ${isActive ? meta.activeBg : meta.border}`,
                      background: isActive ? meta.activeBg : meta.bg,
                      color: isActive ? meta.activeText : meta.text,
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      userSelect: 'none',
                    }}
                    title={`${isActive ? 'Hide' : 'Show'} ${diff} questions`}
                  >
                    {/* Checkmark when active */}
                    {isActive ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    )}
                    {diff}
                    <span style={{
                      fontSize: '0.6875rem',
                      background: isActive ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.08)',
                      borderRadius: '9999px',
                      padding: '0 0.375rem',
                      lineHeight: '1.4',
                    }}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
            {activeDiffs.size < availableDifficulties.length && (
              <p style={{ fontSize: '0.6875rem', color: 'var(--text-3)', marginTop: '0.375rem' }}>
                ⚠ Some difficulty levels are hidden — those questions won&apos;t appear in the PDF.
              </p>
            )}
          </div>
        )}

        {/* ── Topic tree ────────────────────────────────────────────── */}
        <div className="overflow-y-auto border border-gray-100 rounded-xl bg-gray-50/50" style={{ maxHeight: '28rem' }}>
          {topicTree.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">No topics found</div>
          ) : (
            topicTree.map(node => (
              <TopicTreeNode
                key={node.slug}
                node={node}
                selectedNums={selectedSet}
                onToggle={handleToggle}
              />
            ))
          )}
        </div>

        {/* ── Live counter ──────────────────────────────────────────── */}
        <div className={`mt-3 text-sm font-medium text-center ${canProceed ? 'text-[var(--primary)]' : 'text-red-500'}`}>
          {canProceed
            ? `${selectedQuestionNumbers.length} question${selectedQuestionNumbers.length > 1 ? 's' : ''} selected`
            : 'Select at least one question to continue'}
        </div>
      </div>

      {/* ── Navigation ──────────────────────────────────────────────── */}
      <div className="flex justify-between pt-2">
        <button className="btn-ghost" onClick={() => setStep(1)}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back
        </button>
        <div className="relative group">
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
            <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block z-50">
              <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
                Select at least one question to continue
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
