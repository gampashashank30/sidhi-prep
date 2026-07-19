'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useWizardStore } from '@/store/wizardStore';
import type { PDFSettings, AdImage } from '@/lib/types';

// ─── Debounce hook ────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
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

function LivePreview({
  settings,
  coverSettings,
  questions,
}: {
  settings: PDFSettings;
  coverSettings: import('@/lib/types').CoverSettings | null;
  questions: import('@/lib/types').Question[];
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedSettings = useDebounce(settings, 800);
  const debouncedQuestions = useDebounce(questions, 400);

  useEffect(() => {
    if (debouncedQuestions.length === 0) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/preview-html', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            questions: debouncedQuestions.slice(0, 10), // limit for preview speed
            coverSettings,
            settings: debouncedSettings,
            previewQuestionIndex: 0,
          }),
        });
        if (!res.ok) throw new Error('Preview failed');
        const html = await res.text();
        if (!cancelled && iframeRef.current) {
          iframeRef.current.srcdoc = html;
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [debouncedSettings, debouncedQuestions, coverSettings]);

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
        {loading && (
          <span className="text-xs text-[var(--primary)] flex items-center gap-1">
            <span className="w-3 h-3 rounded-full border-2 border-[var(--primary)]/30 border-t-[var(--primary)] animate-spin" />
            Updating…
          </span>
        )}
      </div>

      <div
        className="preview-pane overflow-hidden shadow-xl rounded-2xl"
        style={{ width: PREVIEW_W, height: PREVIEW_H + 32 }}
      >
        {error ? (
          <div className="p-4 text-xs text-red-500 text-center">{error}</div>
        ) : questions.length === 0 ? (
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
            {loading && (
              <div className="absolute inset-0 bg-white/70 flex items-center justify-center backdrop-blur-sm">
                <div className="w-8 h-8 rounded-full border-4 border-[var(--primary)]/20 border-t-[var(--primary)] animate-spin" />
              </div>
            )}
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400 text-center">One sample page · Updates automatically</p>
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

  // ── Ad image upload ────────────────────────────────────────────────────────
  const handleAdUpload = useCallback(async (files: FileList) => {
    const uploaded: AdImage[] = [];
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'ad');
      const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.dataUrl) uploaded.push({ dataUrl: data.dataUrl });
    }
    update('adImages', [...pdfSettings.adImages, ...uploaded]);
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

      // Get PDF as blob with explicit MIME type
      const blob = await res.blob();
      const pdfBlob = new Blob([blob], { type: 'application/pdf' });
      const url = URL.createObjectURL(pdfBlob);

      // Must append to DOM and body.click() — bare a.click() can be blocked
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = 'siddhi-question-bank.pdf';
      document.body.appendChild(a);
      a.click();

      // Revoke AFTER a generous delay so browser has time to start download
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
    { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/...' },
    { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/...' },
    { key: 'telegram', label: 'Telegram', placeholder: 'https://t.me/...' },
    { key: 'playStore', label: 'Play Store', placeholder: 'https://play.google.com/...' },
  ];

  return (
    <div className="max-w-7xl mx-auto animate-slide-up">
      {/* ── Page title ─────────────────────────────────────────────── */}
      <div className="mb-6">
        <h2 className="section-heading">
          <span className="w-8 h-8 rounded-lg bg-[var(--primary)] text-white flex items-center justify-center text-sm font-bold">3</span>
          Customise &amp; Export
        </h2>
        <p className="text-sm text-gray-500 mt-1 ml-10">
          Configure your PDF appearance — preview updates automatically.
        </p>
      </div>

      <div className="grid-step3-layout">
        {/* ── Settings sidebar ─────────────────────────────────────── */}
        <div className="space-y-4">

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
            <ToggleRow id="toggle-ads" label="Insert Advertisement Pages" description="Cycle round-robin through uploaded images" value={pdfSettings.adsEnabled} onChange={v => update('adsEnabled', v)} />
            {pdfSettings.adsEnabled && (
              <div className="mt-3 pl-4 border-l-2 border-gray-100 space-y-3">
                <div>
                  <label className="form-label" htmlFor="ad-interval">
                    Insert ad after every{' '}
                    <input
                      id="ad-interval"
                      type="number"
                      min={1}
                      value={pdfSettings.adIntervalPages}
                      onChange={e => update('adIntervalPages', Math.max(1, parseInt(e.target.value) || 1))}
                      className="form-input inline-block w-16 mx-1 text-center"
                    />
                    {' '}content pages
                  </label>
                </div>
                <div>
                  <label className="form-label">Ad Images (16:9 recommended)</label>
                  <div className="flex flex-col gap-3 mt-1">
                    {pdfSettings.adImages.map((ad, i) => (
                      <div key={i} className="flex items-start gap-3 p-2 border border-gray-100 bg-gray-50 rounded-lg">
                        <div className="relative flex-shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={ad.dataUrl} alt={`Ad ${i+1}`} className="w-24 h-[54px] object-cover rounded border border-gray-200" />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs font-semibold text-gray-600 block mb-1">Ad Link URL</label>
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
                    <div>
                      <label className="btn-ghost text-xs px-3 py-2 cursor-pointer inline-flex items-center gap-2">
                        <span className="text-lg leading-none">+</span> Add Ad Image(s)
                        <input type="file" accept="image/*" multiple className="hidden"
                          onChange={e => { if (e.target.files) handleAdUpload(e.target.files); e.target.value = ''; }} />
                      </label>
                    </div>
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
