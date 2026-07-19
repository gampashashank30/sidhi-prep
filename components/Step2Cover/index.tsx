'use client';

import React, { useCallback, useRef, useState } from 'react';
import { useWizardStore } from '@/store/wizardStore';
import { buildTopicTree } from '@/lib/topicTree';
import type { TopicNode } from '@/lib/topicTree';
import type { CoverSettings } from '@/lib/types';

// ─── Cover Image Upload + Preview ────────────────────────────────────────────

function CoverImageSection() {
  const { coverSettings, setCoverSettings } = useWizardStore();
  const [dragging, setDragging] = useState(false);
  const [isDraggingFocal, setIsDraggingFocal] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // A4 aspect ratio: 210/297 ≈ 0.7071
  const A4_RATIO = 210 / 297;
  const PREVIEW_HEIGHT = 320; // px
  const PREVIEW_WIDTH = Math.round(PREVIEW_HEIGHT * A4_RATIO);

  const processFile = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', 'cover');
    formData.append('focalX', '0.5');
    formData.append('focalY', '0.5');

    try {
      const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.dataUrl) {
        setCoverSettings({ dataUrl: data.dataUrl, focalX: 0.5, focalY: 0.5 });
      }
    } catch (err) {
      console.error('Cover image upload failed:', err);
    }
  }, [setCoverSettings]);

  const handleFocalDrag = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingFocal || !previewRef.current || !coverSettings) return;
    const rect = previewRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setCoverSettings({ ...coverSettings, focalX: x, focalY: y });
  }, [isDraggingFocal, coverSettings, setCoverSettings]);

  return (
    <div className="card">
      <div className="card-header">
        <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
          <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
        </div>
        <div>
          <h3 className="font-bold text-gray-900">Cover Image</h3>
          <p className="text-xs text-gray-500">Optional — drag to reposition focal point</p>
        </div>
      </div>

      <div className="flex gap-6 items-start flex-wrap">
        {/* Upload dropzone */}
        <div
          className={`drop-zone w-48 h-32 ${dragging ? 'active' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) processFile(f); }}
          onClick={() => document.getElementById('cover-upload')?.click()}
        >
          <input id="cover-upload" type="file" accept="image/jpeg,image/png" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ''; }} />
          <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <p className="text-xs text-gray-500">Upload JPG/PNG</p>
        </div>

        {/* Live preview with focal point control */}
        {coverSettings && (
          <div className="space-y-2">
            <div
              ref={previewRef}
              className="relative rounded-xl overflow-hidden border-2 border-[var(--primary)]/30 cursor-crosshair select-none"
              style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }}
              onMouseDown={() => setIsDraggingFocal(true)}
              onMouseUp={() => setIsDraggingFocal(false)}
              onMouseLeave={() => setIsDraggingFocal(false)}
              onMouseMove={handleFocalDrag}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverSettings.dataUrl}
                alt="Cover preview"
                className="w-full h-full"
                style={{
                  objectFit: 'cover',
                  objectPosition: `${Math.round(coverSettings.focalX * 100)}% ${Math.round(coverSettings.focalY * 100)}%`,
                }}
                draggable={false}
              />
              {/* Focal point crosshair */}
              <div
                className="absolute w-5 h-5 rounded-full border-2 border-white shadow-lg pointer-events-none"
                style={{
                  left: `calc(${coverSettings.focalX * 100}% - 10px)`,
                  top: `calc(${coverSettings.focalY * 100}% - 10px)`,
                  background: 'rgba(255,255,255,0.3)',
                  backdropFilter: 'blur(2px)',
                }}
              />
              {/* A4 ratio label */}
              <div className="absolute bottom-1 right-1 text-white text-xs bg-black/40 rounded px-1.5 py-0.5 backdrop-blur-sm">
                A4 Preview
              </div>
            </div>
            <p className="text-xs text-gray-400 text-center">Click &amp; drag to set focal point</p>
          </div>
        )}
      </div>
    </div>
  );
}

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
    // If currently checked or indeterminate → uncheck all; if unchecked → check all
    if (checkState === 'unchecked') {
      onToggle(allNums);  // signal: add these
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

        <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
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

  // Toggle handler from tree node
  const handleToggle = useCallback((nums: number[]) => {
    const currentSet = new Set(selectedQuestionNumbers);
    // Positive = add, negative = remove
    for (const n of nums) {
      if (n < 0) currentSet.delete(-n);
      else currentSet.add(n);
    }
    setSelectedQuestions(Array.from(currentSet));
  }, [selectedQuestionNumbers, setSelectedQuestions]);

  const allSelected = selectedQuestionNumbers.length === questions.length;
  const noneSelected = selectedQuestionNumbers.length === 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-slide-up">
      {/* ── Page title ─────────────────────────────────────────────── */}
      <div>
        <h2 className="section-heading">
          <span className="w-8 h-8 rounded-lg bg-[var(--primary)] text-white flex items-center justify-center text-sm font-bold">2</span>
          Cover &amp; Topic Selection
        </h2>
        <p className="text-sm text-gray-500 mt-1 ml-10">
          Add a cover image and choose which topics to include in your PDF.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Cover image ─────────────────────────────────────────── */}
        <CoverImageSection />

        {/* ── Topic selection ─────────────────────────────────────── */}
        <div className="card flex flex-col">
          <div className="card-header">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-gray-900">Select Topics</h3>
              <p className="text-xs text-gray-500">
                <span className={`font-semibold ${canProceed ? 'text-[var(--primary)]' : 'text-red-500'}`}>
                  {selectedQuestionNumbers.length}
                </span> of {questions.length} questions selected
              </p>
            </div>
            {/* Select all / none buttons */}
            <div className="flex gap-1.5">
              <button className="btn-ghost text-xs px-2 py-1" onClick={selectAllQuestions} disabled={allSelected}>
                All
              </button>
              <button className="btn-ghost text-xs px-2 py-1" onClick={deselectAllQuestions} disabled={noneSelected}>
                None
              </button>
            </div>
          </div>

          {/* Tree */}
          <div className="flex-1 overflow-y-auto max-h-96 border border-gray-100 rounded-xl bg-gray-50/50">
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

          {/* Live counter */}
          <div className={`mt-3 text-sm font-medium text-center ${canProceed ? 'text-[var(--primary)]' : 'text-red-500'}`}>
            {canProceed
              ? `${selectedQuestionNumbers.length} question${selectedQuestionNumbers.length > 1 ? 's' : ''} selected`
              : 'Select at least one question to continue'}
          </div>
        </div>
      </div>

      {/* ── Navigation ─────────────────────────────────────────────── */}
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
