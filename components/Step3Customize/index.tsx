'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWizardStore } from '@/store/wizardStore';
import type { PDFSettings, AdImage, CoverSettings, Question } from '@/lib/types';
import { buildHTMLTemplate } from '@/lib/pdfTemplate';

// ─── Analytics Palette ────────────────────────────────────────────────────────

const SUBJECT_COLORS = [
  '#6366F1', // indigo
  '#14B89A', // teal
  '#F59E0B', // amber
  '#EF4444', // rose
  '#10B981', // emerald
  '#8B5CF6', // violet
  '#3B82F6', // blue
  '#EC4899', // pink
  '#F97316', // orange
  '#06B6D4', // cyan
];

/** Lighten a hex color towards white by `amount` (0–1) */
function lightenColor(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `#${lr.toString(16).padStart(2,'0')}${lg.toString(16).padStart(2,'0')}${lb.toString(16).padStart(2,'0')}`;
}

interface SubjectSlice  { label: string; count: number; pct: number; color: string; }
interface SubtopicSlice { label: string; count: number; pct: number; color: string; subjectColor: string; }

interface NestedSlices {
  subjects: SubjectSlice[];
  subtopics: SubtopicSlice[];
  total: number;
}

function buildNestedSlices(questions: Question[]): NestedSlices {
  const total = questions.length;
  // Build subject → subtopic map
  const subjectMap = new Map<string, Map<string, number>>();
  for (const q of questions) {
    const subject  = q.subjectPath[0] ?? 'Uncategorised';
    const subtopic = q.subjectPath[1] ?? q.subjectPath[0] ?? 'General';
    if (!subjectMap.has(subject)) subjectMap.set(subject, new Map());
    const inner = subjectMap.get(subject)!;
    inner.set(subtopic, (inner.get(subtopic) ?? 0) + 1);
  }

  const subjects: SubjectSlice[]  = [];
  const subtopics: SubtopicSlice[] = [];

  Array.from(subjectMap.entries())
    .sort((a, b) => {
      const sa = Array.from(a[1].values()).reduce((s, v) => s + v, 0);
      const sb = Array.from(b[1].values()).reduce((s, v) => s + v, 0);
      return sb - sa;
    })
    .forEach(([subject, stMap], si) => {
      const subjectColor = SUBJECT_COLORS[si % SUBJECT_COLORS.length];
      const subjectCount = Array.from(stMap.values()).reduce((s, v) => s + v, 0);
      subjects.push({
        label: subject,
        count: subjectCount,
        pct: total > 0 ? Math.round((subjectCount / total) * 100) : 0,
        color: subjectColor,
      });
      // Sort subtopics by count descending
      Array.from(stMap.entries())
        .sort((a, b) => b[1] - a[1])
        .forEach(([subtopic, cnt], ti) => {
          // Outer ring: each subtopic gets a lightened tint of the subject color
          const tint = lightenColor(subjectColor, 0.15 + ti * 0.1);
          subtopics.push({
            label: subtopic,
            count: cnt,
            pct: total > 0 ? Math.round((cnt / total) * 100) : 0,
            color: tint,
            subjectColor,
          });
        });
    });

  return { subjects, subtopics, total };
}

// ── Arc path helper ────────────────────────────────────────────────────────────

function buildArcPath(cx: number, cy: number, rOuter: number, rInner: number, startDeg: number, endDeg: number): string {
  const sweep = Math.min(endDeg - startDeg, 359.999);
  const large = sweep > 180 ? 1 : 0;
  const toXY  = (r: number, deg: number) => ({ x: cx + r * Math.cos((deg * Math.PI) / 180), y: cy + r * Math.sin((deg * Math.PI) / 180) });
  const s  = toXY(rOuter, startDeg); const e  = toXY(rOuter, startDeg + sweep);
  const si = toXY(rInner, startDeg); const ei = toXY(rInner, startDeg + sweep);
  return `M ${s.x} ${s.y} A ${rOuter} ${rOuter} 0 ${large} 1 ${e.x} ${e.y} L ${ei.x} ${ei.y} A ${rInner} ${rInner} 0 ${large} 0 ${si.x} ${si.y} Z`;
}

// ── Two-level nested Donut ─────────────────────────────────────────────────────

function NestedDonutChart({ nested }: { nested: NestedSlices }) {
  const { subjects, subtopics, total } = nested;
  const [hovered, setHovered] = useState<{ ring: 'inner' | 'outer'; idx: number } | null>(null);

  const SIZE = 260; const CX = 130; const CY = 130;
  // Inner ring: subjects (r 48–74)
  // Gap ring: 4px gap
  // Outer ring: subtopics (r 80–105)
  const R_IN_OUTER  = 72;  const R_IN_INNER  = 46;
  const R_OUT_OUTER = 105; const R_OUT_INNER = 80;

  if (subjects.length === 0) return null;

  // Inner arcs (subjects)
  const innerArcs: React.JSX.Element[] = [];
  let angle = -90;
  subjects.forEach((sl, i) => {
    if (sl.count <= 0) return;
    const sweep = (sl.count / total) * 360;
    const d = buildArcPath(CX, CY, R_IN_OUTER, R_IN_INNER, angle, angle + sweep);
    const isHov = hovered?.ring === 'inner' && hovered.idx === i;
    innerArcs.push(
      <path key={`in-${i}`} d={d} fill={sl.color} stroke="#fff" strokeWidth={2}
        style={{ transformOrigin: `${CX}px ${CY}px`, transform: `scale(${isHov ? 1.05 : 1})`, transition: 'transform 0.2s, opacity 0.2s', opacity: hovered && !isHov ? 0.55 : 1, cursor: 'pointer' }}
        onMouseEnter={() => setHovered({ ring: 'inner', idx: i })}
        onMouseLeave={() => setHovered(null)}>
        <title>{sl.label}: {sl.count} ({sl.pct}%)</title>
      </path>
    );
    angle += sweep;
  });

  // Outer arcs (subtopics)
  const outerArcs: React.JSX.Element[] = [];
  angle = -90;
  subtopics.forEach((sl, i) => {
    if (sl.count <= 0) return;
    const sweep = (sl.count / total) * 360;
    const d = buildArcPath(CX, CY, R_OUT_OUTER, R_OUT_INNER, angle, angle + sweep);
    const isHov = hovered?.ring === 'outer' && hovered.idx === i;
    outerArcs.push(
      <path key={`out-${i}`} d={d} fill={sl.color} stroke="#fff" strokeWidth={1.5}
        style={{ transformOrigin: `${CX}px ${CY}px`, transform: `scale(${isHov ? 1.04 : 1})`, transition: 'transform 0.2s, opacity 0.2s', opacity: hovered && !isHov ? 0.55 : 1, cursor: 'pointer' }}
        onMouseEnter={() => setHovered({ ring: 'outer', idx: i })}
        onMouseLeave={() => setHovered(null)}>
        <title>{sl.label}: {sl.count} ({sl.pct}%)</title>
      </path>
    );
    angle += sweep;
  });

  // Center label
  const hoveredSlice = hovered?.ring === 'inner' ? subjects[hovered.idx] : hovered?.ring === 'outer' ? subtopics[hovered.idx] : null;

  return (
    <div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: '100%', maxWidth: SIZE, height: 'auto', display: 'block', margin: '0 auto' }}>
        {outerArcs}
        {innerArcs}
        {/* Center */}
        <text x={CX} y={CY - 11} textAnchor="middle" dominantBaseline="auto" style={{ fontSize: 28, fontWeight: 700, fill: '#0F172A', fontFamily: 'inherit' }}>
          {hoveredSlice ? hoveredSlice.count : total}
        </text>
        <text x={CX} y={CY + 14} textAnchor="middle" dominantBaseline="auto" style={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'inherit' }}>
          {hoveredSlice ? hoveredSlice.label.slice(0, 14) : 'questions'}
        </text>
        {/* Ring labels */}
        <text x={CX} y={SIZE - 8} textAnchor="middle" style={{ fontSize: 8, fill: '#CBD5E1', fontFamily: 'inherit' }}>
          inner: subjects · outer: topics
        </text>
      </svg>
      {/* Legend: subjects */}
      <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: subjects.length > 5 ? '1fr 1fr' : '1fr', gap: '0.3rem 0.75rem' }}>
        {subjects.map((sl, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0, padding: '0.15rem 0' }}
            onMouseEnter={() => setHovered({ ring: 'inner', idx: i })}
            onMouseLeave={() => setHovered(null)}>
            <span style={{ width: '0.6rem', height: '0.6rem', borderRadius: '0.15rem', background: sl.color, flexShrink: 0 }} />
            <span style={{ fontSize: '0.7rem', color: '#475569', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }} title={sl.label}>{sl.label}</span>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#0F172A', flexShrink: 0 }}>{sl.count}</span>
            <span style={{ fontSize: '0.65rem', color: '#fff', fontWeight: 600, background: sl.color, borderRadius: '9999px', padding: '0.05rem 0.3rem', flexShrink: 0 }}>{sl.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Analytics Section ─────────────────────────────────────────────────────────

function AnalyticsSection({ questions, enabled, setEnabled }: {
  questions: Question[];
  enabled: boolean;
  setEnabled: (v: boolean) => void;
}) {
  const nested = useMemo(() => buildNestedSlices(questions), [questions]);
  const total  = questions.length;

  return (
    <div style={{ borderRadius: '1.25rem', border: '1.5px solid transparent', backgroundImage: enabled ? 'linear-gradient(#fff,#fff), linear-gradient(135deg,#6366F1 0%,#8B5CF6 50%,#14B89A 100%)' : 'linear-gradient(#fff,#fff), linear-gradient(135deg,#E2E8F0,#E2E8F0)', backgroundOrigin: 'border-box', backgroundClip: 'padding-box, border-box', padding: '1.25rem 1.375rem', boxShadow: enabled ? '0 6px 32px rgba(99,102,241,0.14)' : '0 1px 4px rgba(15,23,42,0.06)', transition: 'box-shadow 0.3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: enabled ? '1.125rem' : 0 }}>
        <div style={{ width: '2.25rem', height: '2.25rem', borderRadius: '0.625rem', flexShrink: 0, background: enabled ? 'linear-gradient(135deg,rgba(99,102,241,0.18),rgba(139,92,246,0.15))' : 'rgba(99,102,241,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366F1', transition: 'background 0.3s' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#0F172A', lineHeight: 1.3 }}>Topic Analytics</h3>
          <p style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '0.1rem' }}>Subject + subtopic donut — also appears in PDF</p>
        </div>
        <button id="analytics-toggle" role="switch" aria-checked={enabled} onClick={() => setEnabled(!enabled)}
          style={{ position: 'relative', display: 'inline-flex', height: '1.5rem', width: '2.75rem', alignItems: 'center', borderRadius: '9999px', border: 'none', padding: 0, background: enabled ? '#6366F1' : '#CBD5E1', cursor: 'pointer', flexShrink: 0, transition: 'background 0.25s ease', boxShadow: enabled ? '0 0 0 3px rgba(99,102,241,0.22)' : 'none' }}>
          <span style={{ position: 'absolute', height: '1.125rem', width: '1.125rem', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.22)', transform: enabled ? 'translateX(1.375rem)' : 'translateX(0.1875rem)', transition: 'transform 0.2s ease' }} />
        </button>
      </div>
      {enabled && (
        <div>
          {total === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.25rem 1rem', background: 'rgba(99,102,241,0.04)', borderRadius: '1rem', border: '1.5px dashed rgba(99,102,241,0.2)' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#A5B4FC" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 0.75rem' }}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
              <p style={{ fontSize: '0.875rem', color: '#94A3B8', fontWeight: 500 }}>No questions selected</p>
              <p style={{ fontSize: '0.75rem', color: '#CBD5E1', marginTop: '0.25rem' }}>Go to Step 2 and select questions to see analytics</p>
            </div>
          ) : (
            <>
              <div style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.05),rgba(139,92,246,0.04))', borderRadius: '1rem', padding: '1.125rem 1rem 0.875rem', border: '1px solid rgba(99,102,241,0.14)' }}>
                <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6366F1', marginBottom: '0.75rem', textAlign: 'center', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Topic Distribution</p>
                <NestedDonutChart nested={nested} />
              </div>
              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(99,102,241,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{nested.subjects.length} subject{nested.subjects.length !== 1 ? 's' : ''}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6366F1' }}>{total} questions total</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}



function CoverImageSection() {
  const { coverSettings, setCoverSettings } = useWizardStore();
  const [dragging, setDragging] = useState(false);
  const [isDraggingFocal, setIsDraggingFocal] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // A4 aspect ratio: 210/297 ≈ 0.7071
  const A4_RATIO = 210 / 297;
  const PREVIEW_HEIGHT = 280; // px
  const PREVIEW_WIDTH = Math.round(PREVIEW_HEIGHT * A4_RATIO);

  const processFile = useCallback(async (file: File) => {
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        const blobUrl = URL.createObjectURL(file);
        img.onload = () => {
          const MAX = 1600;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) { URL.revokeObjectURL(blobUrl); reject(new Error('canvas')); return; }
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(blobUrl);
          resolve(canvas.toDataURL('image/jpeg', 0.9));
        };
        img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error('load')); };
        img.src = blobUrl;
      });
      setCoverSettings({ dataUrl, focalX: 0.5, focalY: 0.5 });
    } catch (err) {
      console.error('Cover image processing failed:', err);
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
        <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
        </div>
        <div>
          <h3 className="font-bold text-gray-900">Cover Image</h3>
          <p className="text-xs text-gray-500">Optional — drag to reposition focal point</p>
        </div>
        {coverSettings && (
          <button
            className="btn-ghost text-xs px-2 py-1 ml-auto text-red-400 hover:text-red-600"
            onClick={() => setCoverSettings(null)}
            title="Remove cover image"
          >
            ✕ Remove
          </button>
        )}
      </div>

      <div className="flex gap-6 items-start flex-wrap">
        {/* Upload dropzone */}
        <div
          className={`drop-zone flex-shrink-0 ${dragging ? 'active' : ''}`}
          style={{ width: 160, height: 100, minHeight: 'unset', padding: '1rem' }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) processFile(f); }}
          onClick={() => document.getElementById('cover-upload-step3')?.click()}
        >
          <input id="cover-upload-step3" type="file" accept="image/jpeg,image/png" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ''; }} />
          <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <p className="text-xs text-gray-500">{coverSettings ? 'Replace image' : 'Upload JPG/PNG'}</p>
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

// ─── Toggle Row ───────────────────────────────────────────────────────────────

function ToggleRow({
  label, description, value, onChange, id,
}: {
  label: string; description?: string; value: boolean;
  onChange: (v: boolean) => void; id: string;
}) {
  return (
    <div className="toggle-wrapper">
      <div className="flex-1 mr-4">
        <label htmlFor={id} className="text-sm font-semibold text-gray-800 cursor-pointer">{label}</label>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={value}
        className={`toggle-switch ${value ? 'on' : 'off'}`}
        onClick={() => onChange(!value)}
      >
        <span className={`toggle-thumb ${value ? 'on' : 'off'}`} />
      </button>
    </div>
  );
}

// ─── Color Picker Row ─────────────────────────────────────────────────────────

function ColorRow({
  label, value, onChange, id,
}: {
  label: string; value: string; onChange: (v: string) => void; id: string;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <label htmlFor={id} className="text-sm font-semibold text-gray-800">{label}</label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="color-swatch"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => /^#[0-9A-Fa-f]{0,6}$/.test(e.target.value) && onChange(e.target.value)}
          className="form-input w-24 font-mono text-xs"
          maxLength={7}
          spellCheck={false}
        />
      </div>
    </div>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SettingsSection({
  title, icon, children,
}: {
  title: string; icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="w-8 h-8 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center text-[var(--primary)]">
          {icon}
        </div>
        <h3 className="font-bold text-gray-900">{title}</h3>
      </div>
      <div>{children}</div>
    </div>
  );
}

// ─── URL Validator ────────────────────────────────────────────────────────────

function isValidUrl(url: string): boolean {
  return !url || /^https?:\/\/.+/.test(url);
}

// ─── Live Preview Pane ────────────────────────────────────────────────────────

/** Fetch /logo.png once and convert to a base64 data URL */
async function fetchLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch('/logo.png');
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function LivePreview({
  settings,
  coverSettings,
  questions,
}: {
  settings: PDFSettings;
  coverSettings: CoverSettings | null;
  questions: import('@/lib/types').Question[];
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const logoRef = useRef<string | null>(null);
  const [logoReady, setLogoReady] = useState(false);
  const [pageIdx, setPageIdx] = useState(0);
  const [fading, setFading] = useState(false);

  // Clamp pageIdx when questions change
  const safeIdx = questions.length === 0 ? 0 : Math.min(pageIdx, questions.length - 1);

  // Fetch logo once on mount and cache it
  useEffect(() => {
    fetchLogoDataUrl().then(url => {
      logoRef.current = url;
      setLogoReady(true);
    });
  }, []);

  // Rebuild preview on every change with fade transition
  useEffect(() => {
    if (!logoReady || questions.length === 0 || !iframeRef.current) return;
    setFading(true);
    const t = setTimeout(() => {
      const html = buildHTMLTemplate({
        questions: [questions[safeIdx]],
        coverSettings,
        logoDataUrl: logoRef.current,
        settings,
        previewMode: true,
        previewQuestionIndex: 0,
      });
      if (iframeRef.current) iframeRef.current.srcdoc = html;
      setFading(false);
    }, 120);
    return () => clearTimeout(t);
  }, [settings, questions, coverSettings, logoReady, safeIdx]);

  const goPage = (dir: 1 | -1) => {
    const next = Math.max(0, Math.min(questions.length - 1, safeIdx + dir));
    setPageIdx(next);
  };

  // A4 at 96 dpi = 793.7 px wide. We want to fill a ~480px column.
  const PREVIEW_W = 460;
  const A4_W_PX = 210 * 3.7795;  // 793.7 px
  const A4_H_PX = 297 * 3.7795;  // 1122.5 px
  const SCALE = PREVIEW_W / A4_W_PX;
  const PREVIEW_H = Math.round(A4_H_PX * SCALE);

  return (
    <div className="sticky top-20">
      {/* ── Header bar ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        borderRadius: '1rem 1rem 0 0',
        padding: '0.75rem 1rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '0.5rem',
      }}>
        {/* Left: icon + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            width: '1.75rem', height: '1.75rem', borderRadius: '0.5rem',
            background: 'rgba(99,179,237,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg style={{ width: '0.875rem', height: '0.875rem', color: '#63B3ED' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#F1F5F9', lineHeight: 1 }}>Live Preview</p>
            <p style={{ fontSize: '0.625rem', color: '#64748B', marginTop: '1px' }}>Updates instantly</p>
          </div>
        </div>

        {/* Right: loading indicator or page nav */}
        {!logoReady ? (
          <span style={{ fontSize: '0.6875rem', color: '#63B3ED', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <span style={{ width: '0.75rem', height: '0.75rem', borderRadius: '50%', border: '2px solid rgba(99,179,237,0.3)', borderTopColor: '#63B3ED', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
            Loading…
          </span>
        ) : questions.length > 1 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <button
              onClick={() => goPage(-1)}
              disabled={safeIdx === 0}
              style={{
                width: '1.5rem', height: '1.5rem', borderRadius: '0.375rem', border: 'none',
                background: safeIdx === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(99,179,237,0.15)',
                color: safeIdx === 0 ? '#475569' : '#63B3ED',
                cursor: safeIdx === 0 ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}
            >
              <svg style={{ width: '0.625rem', height: '0.625rem' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <span style={{ fontSize: '0.6875rem', color: '#94A3B8', fontWeight: 600, whiteSpace: 'nowrap' }}>
              Q{safeIdx + 1} / {questions.length}
            </span>
            <button
              onClick={() => goPage(1)}
              disabled={safeIdx === questions.length - 1}
              style={{
                width: '1.5rem', height: '1.5rem', borderRadius: '0.375rem', border: 'none',
                background: safeIdx === questions.length - 1 ? 'rgba(255,255,255,0.05)' : 'rgba(99,179,237,0.15)',
                color: safeIdx === questions.length - 1 ? '#475569' : '#63B3ED',
                cursor: safeIdx === questions.length - 1 ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}
            >
              <svg style={{ width: '0.625rem', height: '0.625rem' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        ) : (
          <span style={{ fontSize: '0.6875rem', color: '#64748B', fontWeight: 600 }}>
            {questions.length} Q{questions.length !== 1 ? 's' : ''} selected
          </span>
        )}
      </div>

      {/* ── Document window ── */}
      <div style={{
        background: '#1a2234',
        borderRadius: '0 0 1rem 1rem',
        padding: '1.25rem 1rem 1rem',
        boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
      }}>
        {questions.length === 0 ? (
          <div style={{
            height: PREVIEW_H,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: '0.75rem', color: '#475569',
          }}>
            <svg style={{ width: '2.5rem', height: '2.5rem', opacity: 0.4 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <p style={{ fontSize: '0.8125rem', fontWeight: 500 }}>Select questions in Step 2 to preview</p>
          </div>
        ) : (
          /* The A4 page with drop shadow */
          <div style={{
            width: PREVIEW_W,
            height: PREVIEW_H,
            position: 'relative',
            overflow: 'hidden',
            borderRadius: '4px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.6), 0 1px 4px rgba(0,0,0,0.4)',
            opacity: fading ? 0.4 : 1,
            transition: 'opacity 0.12s ease',
          }}>
            <iframe
              ref={iframeRef}
              title="PDF Preview"
              sandbox="allow-same-origin"
              style={{
                position: 'absolute', top: 0, left: 0, border: 0,
                width: `${A4_W_PX}px`,
                height: `${A4_H_PX}px`,
                transformOrigin: 'top left',
                transform: `scale(${SCALE})`,
                pointerEvents: 'none',
                background: '#fff',
              }}
            />
          </div>
        )}

        {/* Footer hint */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.75rem' }}>
          <span style={{
            fontSize: '0.625rem', color: '#334155', fontWeight: 500,
            background: 'rgba(255,255,255,0.05)', borderRadius: '9999px',
            padding: '0.25rem 0.75rem',
            display: 'flex', alignItems: 'center', gap: '0.375rem',
          }}>
            <svg style={{ width: '0.625rem', height: '0.625rem', color: '#475569' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            Sample of one question per page
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Step 3 Main Component ────────────────────────────────────────────────────

export default function Step3Customize() {
  const {
    pdfSettings, updatePdfSettings,
    coverSettings, getSelectedQuestions,
    setStep,
  } = useWizardStore();

  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const selectedQuestions = getSelectedQuestions();

  // Analytics state
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);


  const update = useCallback(<K extends keyof PDFSettings>(key: K, value: PDFSettings[K]) => {
    updatePdfSettings({ [key]: value } as Partial<PDFSettings>);
  }, [updatePdfSettings]);

  // ── Ad image upload — max 2 images, client-side compression ──────────────
  const MAX_AD_IMAGES = 2;
  const handleAdUpload = useCallback(async (files: FileList) => {
    const remaining = MAX_AD_IMAGES - pdfSettings.adImages.length;
    if (remaining <= 0) return;

    const compress = (file: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const img = new Image();
        const blobUrl = URL.createObjectURL(file);
        img.onload = () => {
          const MAX = 1400;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) { URL.revokeObjectURL(blobUrl); reject(new Error('canvas')); return; }
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(blobUrl);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error('load')); };
        img.src = blobUrl;
      });

    const uploaded: AdImage[] = [];
    for (const file of Array.from(files).slice(0, remaining)) {
      try {
        const dataUrl = await compress(file);
        uploaded.push({ dataUrl });
      } catch { /* skip bad files */ }
    }
    if (uploaded.length > 0) {
      update('adImages', [...pdfSettings.adImages, ...uploaded]);
    }
  }, [pdfSettings.adImages, update]);


  // ── PDF generation ─────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questions: selectedQuestions,
          coverSettings,
          settings: pdfSettings,
          analyticsCharts: analyticsEnabled
            ? { donut: true, pie: false, column: false }
            : undefined,
        }),
      });
      if (!res.ok) {
        let errorMsg = 'PDF generation failed';
        try { const err = await res.json(); errorMsg = err.error ?? errorMsg; } catch {}
        throw new Error(errorMsg);
      }

      const blob = await res.blob();
      const pdfBlob = new Blob([blob], { type: 'application/pdf' });
      const url = URL.createObjectURL(pdfBlob);

      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = 'siddhi-question-bank.pdf';
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 2000);

    } catch (err) {
      setGenError(String(err instanceof Error ? err.message : err));
    } finally {
      setGenerating(false);
    }
  }, [selectedQuestions, coverSettings, pdfSettings, analyticsEnabled]);


  const socialFields: Array<{ key: keyof PDFSettings['socialLinks']; label: string; placeholder: string }> = [
    { key: 'instagram',      label: 'Instagram',        placeholder: 'https://instagram.com/...' },
    { key: 'youtube',        label: 'YouTube',          placeholder: 'https://youtube.com/...' },
    { key: 'telegram',       label: 'Telegram',         placeholder: 'https://t.me/...' },
    { key: 'playStore',      label: 'Google Play Store', placeholder: 'https://play.google.com/...' },
    { key: 'appStore',       label: 'Apple App Store',  placeholder: 'https://apps.apple.com/...' },
    { key: 'microsoftStore', label: 'Microsoft Store',  placeholder: 'https://apps.microsoft.com/...' },
  ];

  return (
    <div className="max-w-7xl mx-auto animate-slide-up">
      {/* ── Page title ─────────────────────────────────────────────── */}
      <div className="mb-6">
        <h2 className="section-heading">
          <span className="w-8 h-8 rounded-lg bg-[var(--primary)] text-white flex items-center justify-center text-sm font-bold">3</span>
          Cover &amp; Export
        </h2>
        <p className="text-sm text-gray-500 mt-1 ml-10">
          Add a cover image and configure your PDF appearance — preview updates instantly.
        </p>
      </div>

      <div className="grid-step3-layout">
        {/* ── Settings sidebar ─────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Analytics section — first in sidebar */}
          <AnalyticsSection
            questions={selectedQuestions}
            enabled={analyticsEnabled}
            setEnabled={setAnalyticsEnabled}
          />

          {/* Cover image */}
          <CoverImageSection />

          {/* 5.7 Colors */}
          <SettingsSection title="Colors" icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
            </svg>
          }>
            <ColorRow id="color-primary" label="Primary Color" value={pdfSettings.primaryColor} onChange={v => update('primaryColor', v)} />
            <ColorRow id="color-accent" label="Accent Color" value={pdfSettings.accentColor} onChange={v => update('accentColor', v)} />
          </SettingsSection>

          {/* 5.1 Watermark */}
          <SettingsSection title="Watermark" icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a7.464 7.464 0 01-1.15 3.993m1.989 3.559A11.209 11.209 0 008.25 10.5a3.75 3.75 0 117.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 01-3.6 9.75m6.633-4.596a18.666 18.666 0 01-2.485 5.33" />
            </svg>
          }>
            <ToggleRow id="toggle-watermark" label="Background Watermark" description="Centered, 7% opacity, prints behind all content" value={pdfSettings.watermarkEnabled} onChange={v => update('watermarkEnabled', v)} />
            {pdfSettings.watermarkEnabled && (
              <div className="mt-3 pl-4 border-l-2 border-gray-100 space-y-3">
                {/* Default / Custom radio */}
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-700">
                    <input
                      type="radio"
                      name="watermark-mode"
                      value="default"
                      checked={!pdfSettings.watermarkDataUrl}
                      onChange={() => update('watermarkDataUrl' as keyof PDFSettings, undefined as any)}
                      className="accent-[var(--primary)]"
                    />
                    Default (app logo)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-700">
                    <input
                      type="radio"
                      name="watermark-mode"
                      value="custom"
                      checked={!!pdfSettings.watermarkDataUrl}
                      onChange={() => document.getElementById('wm-upload')?.click()}
                      className="accent-[var(--primary)]"
                    />
                    Custom image
                  </label>
                </div>

                {/* Dimension hint */}
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 text-[var(--primary)] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
                  Best size: <strong>800 × 800 px</strong> square PNG/JPG, max 2 MB. Square images look most uniform as a watermark.
                </p>

                {/* Upload zone (shown whether default or custom, always available for switching) */}
                <div>
                  <input
                    id="wm-upload"
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 2 * 1024 * 1024) { alert('Watermark image must be under 2 MB.'); return; }
                      const reader = new FileReader();
                      reader.onloadend = () => update('watermarkDataUrl' as keyof PDFSettings, reader.result as any);
                      reader.readAsDataURL(file);
                      e.target.value = '';
                    }}
                  />
                  {pdfSettings.watermarkDataUrl ? (
                    <div className="flex items-center gap-3 p-2 border border-gray-100 bg-gray-50 rounded-lg">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={pdfSettings.watermarkDataUrl} alt="Custom watermark" className="w-14 h-14 object-contain rounded border border-gray-200 bg-white" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-700">Custom watermark set</p>
                        <p className="text-xs text-gray-400">Replaces the default logo in the PDF background</p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <button
                          className="btn-ghost text-xs px-2 py-1"
                          onClick={() => document.getElementById('wm-upload')?.click()}
                        >Change</button>
                        <button
                          className="btn-ghost text-xs px-2 py-1 text-red-400 hover:text-red-600"
                          onClick={() => update('watermarkDataUrl' as keyof PDFSettings, undefined as any)}
                        >✕ Remove</button>
                      </div>
                    </div>
                  ) : (
                    <label className="btn-ghost text-xs px-3 py-2 cursor-pointer inline-flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                      Upload Custom Watermark
                      <input id="wm-upload-label" type="file" accept="image/png,image/jpeg" className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 2 * 1024 * 1024) { alert('Watermark image must be under 2 MB.'); return; }
                          const reader = new FileReader();
                          reader.onloadend = () => update('watermarkDataUrl' as keyof PDFSettings, reader.result as any);
                          reader.readAsDataURL(file);
                          e.target.value = '';
                        }} />
                    </label>
                  )}
                </div>

                {/* Opacity slider */}
                <div>
                  <label className="form-label" htmlFor="watermark-opacity">
                    Opacity: <strong>{Math.round((pdfSettings.watermarkOpacity ?? 0.07) * 100)}%</strong>
                  </label>
                  <input
                    id="watermark-opacity"
                    type="range"
                    min={1}
                    max={30}
                    step={1}
                    value={Math.round((pdfSettings.watermarkOpacity ?? 0.07) * 100)}
                    style={{ ['--pct' as string]: `${(((pdfSettings.watermarkOpacity ?? 0.07) * 100 - 1) / (30 - 1)) * 100}%` }}
                    onChange={e => update('watermarkOpacity' as keyof PDFSettings, parseFloat(e.target.value) / 100 as any)}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="text-xs text-gray-400">Subtle (1%)</span>
                    <span className="text-xs text-gray-400">Strong (30%)</span>
                  </div>
                </div>
              </div>
            )}
          </SettingsSection>


          {/* 5.2 Border */}
          <SettingsSection title="Page Border" icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 8.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v8.25A2.25 2.25 0 006 16.5h2.25m8.25-8.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-7.5A2.25 2.25 0 018.25 18v-1.5m8.25-8.25h-6a2.25 2.25 0 00-2.25 2.25v6" />
            </svg>
          }>
            <ToggleRow id="toggle-border" label="Page Border" description="With corner logo icons at all 4 corners" value={pdfSettings.borderEnabled} onChange={v => update('borderEnabled', v)} />
            {pdfSettings.borderEnabled && (
              <div className="mt-3 space-y-3 pl-4 border-l-2 border-gray-100">
                <ColorRow id="color-border" label="Border Color" value={pdfSettings.borderColor} onChange={v => update('borderColor', v)} />
                <div>
                  <label className="form-label" htmlFor="border-style">Border Style</label>
                  <select
                    id="border-style"
                    className="form-select"
                    value={pdfSettings.borderStyle}
                    onChange={e => update('borderStyle', e.target.value as PDFSettings['borderStyle'])}
                  >
                    <option value="solid">Solid</option>
                    <option value="double">Double</option>
                    <option value="dashed">Dashed</option>
                  </select>
                </div>
                <div>
                  <label className="form-label" htmlFor="border-width">
                    Border Width: {pdfSettings.borderWidthMm}mm
                  </label>
                  <input
                    id="border-width"
                    type="range" min={1} max={6} step={0.5}
                    value={pdfSettings.borderWidthMm}
                    style={{ ['--pct' as string]: `${((pdfSettings.borderWidthMm - 1) / (6 - 1)) * 100}%` }}
                    onChange={e => update('borderWidthMm', parseFloat(e.target.value))}
                  />
                </div>
              </div>
            )}
          </SettingsSection>

          {/* 5.3 Badges */}
          <SettingsSection title="Question Badges" icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
            </svg>
          }>
            <ToggleRow id="toggle-difficulty-badge" label="Difficulty Badge" description="Easy · Medium · Hard pill on each question" value={pdfSettings.difficultyBadgeEnabled} onChange={v => update('difficultyBadgeEnabled', v)} />
            <ToggleRow id="toggle-topic-badge" label="Topic Badge" description="Deepest subject path segment" value={pdfSettings.topicBadgeEnabled} onChange={v => update('topicBadgeEnabled', v)} />
            <ToggleRow id="toggle-show-answer" label="Show Answer" description='Display the "Ans: A/B/C/D" badge on each question' value={pdfSettings.showAnswer} onChange={v => update('showAnswer', v)} />
            <ToggleRow id="toggle-explanations" label="Include Explanations Section" description="Append a full explanations page at the end of the PDF" value={pdfSettings.includeExplanations} onChange={v => update('includeExplanations', v)} />
          </SettingsSection>

          {/* 5.5 Social Links */}
          <SettingsSection title="Social / Footer Links" icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
          }>
            <div className="space-y-3">
              {socialFields.map(field => {
                const val = pdfSettings.socialLinks[field.key];
                const invalid = val && !isValidUrl(val);
                return (
                  <div key={field.key}>
                    <label className="form-label" htmlFor={`social-${field.key}`}>{field.label}</label>
                    <input
                      id={`social-${field.key}`}
                      type="url"
                      className={`form-input ${invalid ? 'border-red-400 focus:border-red-400' : ''}`}
                      placeholder={field.placeholder}
                      value={val}
                      onChange={e => update('socialLinks', { ...pdfSettings.socialLinks, [field.key]: e.target.value })}
                    />
                    {invalid && (
                      <p className="text-xs text-amber-600 mt-1">⚠ URL looks malformed — will still be saved</p>
                    )}
                  </div>
                );
              })}
            </div>
          </SettingsSection>

          {/* 5.6 Ads */}
          <SettingsSection title="Advertisement Pages" icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
            </svg>
          }>
            <ToggleRow id="toggle-ads" label="Insert Advertisement Pages" description="Both images appear together on each ad page" value={pdfSettings.adsEnabled} onChange={v => update('adsEnabled', v)} />
            {pdfSettings.adsEnabled && (
              <div className="mt-3 pl-4 border-l-2 border-gray-100 space-y-3">
                <div>
                  <label className="form-label" htmlFor="ad-interval">
                    Insert ad after every{' '}
                    <input
                      id="ad-interval"
                      type="number"
                      min={1}
                      value={pdfSettings.adIntervalQuestions}
                      onChange={e => update('adIntervalQuestions', Math.max(1, parseInt(e.target.value) || 1))}
                      className="form-input inline-block w-16 mx-1 text-center"
                    />
                    {' '}questions
                  </label>
                  <p className="text-xs text-gray-400 mt-1">e.g. 15 questions = ad appears after Q15, Q30, Q45…</p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="form-label mb-0">Ad Images (max 2)</label>
                    {pdfSettings.adImages.length >= 2 && (
                      <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Max 2 reached</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mb-2">Both images are shown stacked on every ad page — each with its own link.</p>
                  <div className="flex flex-col gap-3 mt-1">
                    {pdfSettings.adImages.map((ad, i) => (
                      <div key={i} className="flex items-start gap-3 p-2 border border-gray-100 bg-gray-50 rounded-lg">
                        <div className="relative flex-shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={ad.dataUrl} alt={`Ad ${i+1}`} className="w-24 h-[54px] object-cover rounded border border-gray-200" />
                          <span className="absolute -top-1.5 -left-1.5 w-5 h-5 bg-gray-700 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{i + 1}</span>
                        </div>
                        <div className="flex-1">
                          <label className="text-xs font-semibold text-gray-600 block mb-1">Ad {i + 1} Link URL</label>
                          <input
                            type="url"
                            placeholder="https://..."
                            className="form-input text-xs h-7 px-2 w-full"
                            value={ad.linkUrl || ''}
                            onChange={e => {
                              const newAds = [...pdfSettings.adImages];
                              newAds[i] = { ...newAds[i], linkUrl: e.target.value };
                              update('adImages', newAds);
                            }}
                          />
                        </div>
                        <button
                          className="text-gray-400 hover:text-red-500 p-1"
                          onClick={() => update('adImages', pdfSettings.adImages.filter((_, j) => j !== i))}
                          title="Remove Ad"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {pdfSettings.adImages.length < 2 && (
                      <div>
                        <label className={`btn-ghost text-xs px-3 py-2 cursor-pointer inline-flex items-center gap-2`}>
                          <span className="text-lg leading-none">+</span> Add Ad Image {pdfSettings.adImages.length === 0 ? '(1 of 2)' : '(2 of 2)'}
                          <input type="file" accept="image/*" multiple className="hidden"
                            onChange={e => { if (e.target.files) handleAdUpload(e.target.files); e.target.value = ''; }} />
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </SettingsSection>

          {/* Navigation */}
          <div className="flex justify-between pt-2 pb-6">
            <button className="btn-ghost" onClick={() => setStep(2)}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Back
            </button>
            <div className="space-x-3">
              <button
                id="generate-pdf-btn"
                className="btn-accent"
                onClick={handleGenerate}
                disabled={generating || selectedQuestions.length === 0}
              >
                {generating ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Generating PDF…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Download PDF
                  </>
                )}
              </button>
            </div>
          </div>

          {genError && (
            <div className="banner-error">
              <p className="text-sm">{genError}</p>
            </div>
          )}
        </div>

        {/* ── Live Preview ──────────────────────────────────────────── */}
        <div>
          <LivePreview
            settings={pdfSettings}
            coverSettings={coverSettings}
            questions={selectedQuestions}
          />
        </div>
      </div>
    </div>
  );
}
