'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWizardStore } from '@/store/wizardStore';
import type { PDFSettings, AdImage, CoverSettings, Question } from '@/lib/types';
import { buildHTMLTemplate } from '@/lib/pdfTemplate';

// ─── Analytics Palette ────────────────────────────────────────────────────────

const CHART_COLORS = [
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

type ChartType = 'donut' | 'pie' | 'column';

interface TopicSlice {
  label: string;
  count: number;
  pct: number;
  color: string;
}

function buildSlices(questions: Question[]): TopicSlice[] {
  const map = new Map<string, number>();
  for (const q of questions) {
    const key = q.subjectPath[0] ?? 'Uncategorised';
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  const total = questions.length;
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, count], i) => ({
      label,
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));
}

// ── Pure SVG Donut / Pie chart ─────────────────────────────────────────────────

function DonutPieChart({ slices, total, type }: { slices: TopicSlice[]; total: number; type: 'donut' | 'pie' }) {
  const SIZE   = 220;
  const CX     = SIZE / 2;
  const CY     = SIZE / 2;
  const R_OUTER = 88;
  const R_INNER = type === 'donut' ? 52 : 0;
  const [hovered, setHovered] = useState<number | null>(null);

  if (slices.length === 0) return null;

  // Build arc paths
  let cumulativeAngle = -90; // start from top
  const arcs = slices.map((slice, i) => {
    const angle = (slice.pct / 100) * 360;
    const startAngle = cumulativeAngle;
    cumulativeAngle += angle;
    const endAngle = cumulativeAngle;
    const startRad = (startAngle * Math.PI) / 180;
    const endRad   = (endAngle   * Math.PI) / 180;
    const largeArc = angle > 180 ? 1 : 0;

    if (type === 'donut') {
      const x1 = CX + R_OUTER * Math.cos(startRad);
      const y1 = CY + R_OUTER * Math.sin(startRad);
      const x2 = CX + R_OUTER * Math.cos(endRad);
      const y2 = CY + R_OUTER * Math.sin(endRad);
      const x3 = CX + R_INNER * Math.cos(endRad);
      const y3 = CY + R_INNER * Math.sin(endRad);
      const x4 = CX + R_INNER * Math.cos(startRad);
      const y4 = CY + R_INNER * Math.sin(startRad);
      return { d: `M ${x1} ${y1} A ${R_OUTER} ${R_OUTER} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${R_INNER} ${R_INNER} 0 ${largeArc} 0 ${x4} ${y4} Z`, i, slice, angle };
    } else {
      const x1 = CX + R_OUTER * Math.cos(startRad);
      const y1 = CY + R_OUTER * Math.sin(startRad);
      const x2 = CX + R_OUTER * Math.cos(endRad);
      const y2 = CY + R_OUTER * Math.sin(endRad);
      return { d: `M ${CX} ${CY} L ${x1} ${y1} A ${R_OUTER} ${R_OUTER} 0 ${largeArc} 1 ${x2} ${y2} Z`, i, slice, angle };
    }
  });

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: SIZE, height: SIZE, display: 'block', margin: '0 auto' }}>
      {arcs.map(({ d, i, slice }) => {
        const scale = hovered === i ? 1.04 : 1;
        return (
          <path
            key={i} d={d}
            fill={slice.color}
            stroke="#fff" strokeWidth={2}
            style={{
              transformOrigin: `${CX}px ${CY}px`,
              transform: `scale(${scale})`,
              transition: 'transform 0.2s ease, opacity 0.2s',
              opacity: hovered !== null && hovered !== i ? 0.6 : 1,
              cursor: 'pointer',
            }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <title>{slice.label}: {slice.count} ({slice.pct}%)</title>
          </path>
        );
      })}
      {type === 'donut' && (
        <>
          <text x={CX} y={CY - 10} textAnchor="middle" dominantBaseline="auto"
            style={{ fontSize: 26, fontWeight: 700, fill: '#0F172A', fontFamily: 'inherit' }}>
            {hovered !== null ? slices[hovered].count : total}
          </text>
          <text x={CX} y={CY + 14} textAnchor="middle" dominantBaseline="auto"
            style={{ fontSize: 11, fill: '#94A3B8', fontFamily: 'inherit' }}>
            {hovered !== null ? slices[hovered].label.slice(0, 12) : 'questions'}
          </text>
        </>
      )}
    </svg>
  );
}

// ── Pure SVG Column chart ──────────────────────────────────────────────────────

function ColumnChart({ slices }: { slices: TopicSlice[] }) {
  const CHART_W = 340;
  const CHART_H = 160;
  const PAD_L   = 32;
  const PAD_B   = 56;
  const PAD_T   = 12;
  const PAD_R   = 8;
  const innerW  = CHART_W - PAD_L - PAD_R;
  const innerH  = CHART_H - PAD_B - PAD_T;
  const [hovered, setHovered] = useState<number | null>(null);

  if (slices.length === 0) return null;

  const maxCount = Math.max(...slices.map((s) => s.count));
  const barW     = Math.min(36, (innerW / slices.length) * 0.6);
  const gap      = innerW / slices.length;

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} style={{ width: '100%', maxWidth: CHART_W, height: CHART_H, display: 'block', margin: '0 auto' }}>
      {/* Y gridlines */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
        const y = PAD_T + innerH * (1 - pct);
        return (
          <g key={pct}>
            <line x1={PAD_L} x2={CHART_W - PAD_R} y1={y} y2={y} stroke="#E2E8F0" strokeWidth={1} />
            <text x={PAD_L - 4} y={y + 1} textAnchor="end" dominantBaseline="middle"
              style={{ fontSize: 9, fill: '#94A3B8', fontFamily: 'inherit' }}>
              {Math.round(maxCount * pct)}
            </text>
          </g>
        );
      })}
      {/* Bars */}
      {slices.map((slice, i) => {
        const barH  = maxCount > 0 ? (slice.count / maxCount) * innerH : 0;
        const x     = PAD_L + gap * i + (gap - barW) / 2;
        const y     = PAD_T + innerH - barH;
        const label = slice.label.length > 8 ? slice.label.slice(0, 7) + '…' : slice.label;
        return (
          <g key={i}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            style={{ cursor: 'pointer' }}
          >
            {/* Bar */}
            <rect
              x={x} y={y} width={barW} height={barH}
              rx={4} fill={slice.color}
              style={{ opacity: hovered !== null && hovered !== i ? 0.5 : 1, transition: 'opacity 0.2s, height 0.4s' }}
            />
            {/* Value label on top */}
            {hovered === i && (
              <text x={x + barW / 2} y={y - 4} textAnchor="middle"
                style={{ fontSize: 10, fontWeight: 700, fill: slice.color, fontFamily: 'inherit' }}>
                {slice.count}
              </text>
            )}
            {/* X-axis label */}
            <text
              x={x + barW / 2}
              y={PAD_T + innerH + 8}
              textAnchor="middle"
              dominantBaseline="hanging"
              style={{ fontSize: 9, fill: hovered === i ? slice.color : '#64748B', fontFamily: 'inherit', fontWeight: hovered === i ? 700 : 400 }}
            >
              {label}
            </text>
            <title>{slice.label}: {slice.count} ({slice.pct}%)</title>
          </g>
        );
      })}
    </svg>
  );
}

// ── Analytics Section ─────────────────────────────────────────────────────────

function AnalyticsSection({ questions }: { questions: Question[] }) {
  const [enabled, setEnabled]     = useState(false);
  const [chartType, setChartType] = useState<ChartType>('donut');

  const slices = useMemo(() => buildSlices(questions), [questions]);

  const CHART_TYPES: { key: ChartType; label: string; icon: React.ReactNode }[] = [
    {
      key: 'donut',
      label: 'Donut',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="4" />
        </svg>
      ),
    },
    {
      key: 'pie',
      label: 'Pie',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
          <path d="M22 12A10 10 0 0 0 12 2v10z" />
        </svg>
      ),
    },
    {
      key: 'column',
      label: 'Column',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6"  y1="20" x2="6"  y2="14" />
          <line x1="2"  y1="20" x2="22" y2="20" />
        </svg>
      ),
    },
  ];

  return (
    <div style={{
      borderRadius: '1.25rem',
      border: '1.5px solid transparent',
      backgroundImage: enabled
        ? 'linear-gradient(#fff,#fff), linear-gradient(135deg,#6366F1,#14B89A)'
        : 'linear-gradient(#fff,#fff), linear-gradient(135deg,#E2E8F0,#E2E8F0)',
      backgroundOrigin: 'border-box',
      backgroundClip: 'padding-box, border-box',
      padding: '1.375rem 1.5rem',
      boxShadow: enabled ? '0 4px 24px rgba(99,102,241,0.12)' : '0 1px 4px rgba(15,23,42,0.06)',
      transition: 'box-shadow 0.3s ease',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: enabled ? '1.25rem' : 0 }}>
        <div style={{
          width: '2rem', height: '2rem', borderRadius: '0.625rem', flexShrink: 0,
          background: enabled ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.07)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#6366F1',
          transition: 'background 0.3s',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6"  y1="20" x2="6"  y2="14" />
            <line x1="2"  y1="20" x2="22" y2="20" />
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#0F172A', lineHeight: 1.3 }}>Topic Analytics</h3>
          <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.1rem' }}>Visualise question distribution by subject</p>
        </div>
        {/* Toggle */}
        <button
          id="analytics-toggle"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled((v) => !v)}
          style={{
            position: 'relative', display: 'inline-flex', height: '1.5rem', width: '2.75rem',
            alignItems: 'center', borderRadius: '9999px', border: 'none', padding: 0,
            background: enabled ? '#6366F1' : '#CBD5E1',
            cursor: 'pointer', flexShrink: 0,
            transition: 'background 0.25s ease', boxShadow: enabled ? '0 0 0 3px rgba(99,102,241,0.2)' : 'none',
          }}
        >
          <span style={{
            position: 'absolute', height: '1.125rem', width: '1.125rem', borderRadius: '50%',
            background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            transform: enabled ? 'translateX(1.375rem)' : 'translateX(0.1875rem)',
            transition: 'transform 0.2s ease',
          }} />
        </button>
      </div>

      {/* Chart panel */}
      {enabled && (
        <div className="animate-fade-in">
          {questions.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '2.5rem 1rem',
              background: 'rgba(99,102,241,0.04)', borderRadius: '1rem',
              border: '1.5px dashed rgba(99,102,241,0.2)',
            }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#A5B4FC" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 0.75rem' }}>
                <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
              </svg>
              <p style={{ fontSize: '0.875rem', color: '#94A3B8', fontWeight: 500 }}>No questions selected</p>
              <p style={{ fontSize: '0.75rem', color: '#CBD5E1', marginTop: '0.25rem' }}>Select questions in Step 2 to see analytics</p>
            </div>
          ) : (
            <>
              {/* Chart type selector */}
              <div style={{
                display: 'flex', gap: '0.375rem', background: '#F1F5F9',
                borderRadius: '0.75rem', padding: '0.3rem', marginBottom: '1.25rem',
              }}>
                {CHART_TYPES.map(({ key, label, icon }) => (
                  <button
                    key={key}
                    id={`chart-type-${key}`}
                    onClick={() => setChartType(key)}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem',
                      padding: '0.4375rem 0.5rem', borderRadius: '0.5rem', border: 'none',
                      fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer',
                      background: chartType === key ? '#fff' : 'transparent',
                      color: chartType === key ? '#6366F1' : '#64748B',
                      boxShadow: chartType === key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {icon}{label}
                  </button>
                ))}
              </div>

              {/* Chart render */}
              <div style={{ marginBottom: '1.25rem' }}>
                {(chartType === 'donut' || chartType === 'pie') ? (
                  <DonutPieChart slices={slices} total={questions.length} type={chartType} />
                ) : (
                  <ColumnChart slices={slices} />
                )}
              </div>

              {/* Legend */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: slices.length > 4 ? '1fr 1fr' : '1fr',
                gap: '0.375rem 1rem',
              }}>
                {slices.map((slice, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                    <span style={{
                      width: '0.625rem', height: '0.625rem', borderRadius: '0.1875rem',
                      background: slice.color, flexShrink: 0,
                    }} />
                    <span style={{
                      fontSize: '0.75rem', color: '#475569', flex: 1,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      fontWeight: 500,
                    }} title={slice.label}>
                      {slice.label}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#0F172A', fontWeight: 700, flexShrink: 0 }}>
                      {slice.count}
                    </span>
                    <span style={{
                      fontSize: '0.6875rem', color: '#fff', fontWeight: 600,
                      background: slice.color, borderRadius: '9999px',
                      padding: '0.0625rem 0.375rem', flexShrink: 0,
                    }}>
                      {slice.pct}%
                    </span>
                  </div>
                ))}
              </div>

              {/* Footer stat */}
              <div style={{
                marginTop: '1rem', paddingTop: '0.875rem',
                borderTop: '1px solid rgba(99,102,241,0.12)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{slices.length} subject{slices.length !== 1 ? 's' : ''}</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6366F1' }}>{questions.length} questions total</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Cover Image Section (moved from Step 2) ──────────────────────────────────

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

  // Fetch logo once on mount and cache it
  useEffect(() => {
    fetchLogoDataUrl().then(url => {
      logoRef.current = url;
      setLogoReady(true);
    });
  }, []);

  // Rebuild preview synchronously on every change.
  useEffect(() => {
    if (!logoReady || questions.length === 0 || !iframeRef.current) return;
    const html = buildHTMLTemplate({
      questions: [questions[0]],
      coverSettings,
      logoDataUrl: logoRef.current,
      settings,
      previewMode: true,
      previewQuestionIndex: 0,
    });
    iframeRef.current.srcdoc = html;
  }, [settings, questions, coverSettings, logoReady]);

  // A4 aspect ratio
  const A4_RATIO = 297 / 210;
  const PREVIEW_W = 380;
  const PREVIEW_H = Math.round(PREVIEW_W * A4_RATIO);
  const SCALE = PREVIEW_W / (210 * 3.7795); // mm → px at 96dpi

  return (
    <div className="sticky top-20 space-y-2">
      <div className="flex items-center justify-between mb-2">
        <h3 className="section-heading text-base">
          <svg className="w-4 h-4 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Live Preview
        </h3>
        {!logoReady && (
          <span className="text-xs text-[var(--primary)] flex items-center gap-1">
            <span className="w-3 h-3 rounded-full border-2 border-[var(--primary)]/30 border-t-[var(--primary)] animate-spin" />
            Loading…
          </span>
        )}
      </div>

      <div
        className="preview-pane overflow-hidden shadow-xl rounded-2xl"
        style={{ width: PREVIEW_W, height: PREVIEW_H + 32 }}
      >
        {questions.length === 0 ? (
          <div className="p-4 text-xs text-gray-400 text-center">Select questions to preview</div>
        ) : (
          <div className="relative w-full h-full bg-white overflow-hidden">
            <iframe
              ref={iframeRef}
              title="PDF Preview"
              sandbox="allow-same-origin"
              className="absolute top-0 left-0 border-0"
              style={{
                width: '210mm',
                height: '297mm',
                transformOrigin: 'top left',
                transform: `scale(${SCALE})`,
                pointerEvents: 'none',
              }}
            />
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400 text-center">One sample page · Updates instantly</p>
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
  }, [selectedQuestions, coverSettings, pdfSettings]);

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
          <AnalyticsSection questions={selectedQuestions} />

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
            <ToggleRow id="toggle-watermark" label="Background Logo Watermark" description="Centered, 7% opacity, behind all text" value={pdfSettings.watermarkEnabled} onChange={v => update('watermarkEnabled', v)} />
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
