// lib/pdfTemplate.ts — v3 (Correct Architecture)
//
// ARCHITECTURE CHANGE FROM v2:
// ✗ OLD: Fixed-height page boxes with overflow:hidden (clips content, breaks links)
// ✓ NEW: Single natural-flow document + position:fixed running elements
//
// How it works:
// - @page { size: 210mm 297mm; margin: 0; } — no browser margin
// - body has padding computed from safe-area to push content away from fixed elements
// - position:fixed header/footer/border/watermark repeat on EVERY page (Chrome print behaviour)
// - Puppeteer breaks pages naturally at break-inside:avoid boundaries
// - All anchors (#q-N, #exp-N, #topic-SLUG) are in document flow → internal links work
// - Ads are full-height flex containers with forced page breaks around them

import type { Question, PDFSettings, CoverSettings } from './types';
import {
  PAGE_WIDTH_MM, PAGE_HEIGHT_MM,
  BORDER_INSET_MM, CONTENT_PADDING_MM, CORNER_ICON_SIZE_MM,
  DEFAULT_PRIMARY_DARK,
  DIFFICULTY_COLORS, TOPIC_BADGE,
  NEUTRAL_TEXT,
  WATERMARK_OPACITY, WATERMARK_SIZE_PERCENT,
} from './constants';

// ─── HTML escape ──────────────────────────────────────────────────────────────

export function escHtml(s: string): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\u2014/g, '&mdash;')
    .replace(/\u2013/g, '&ndash;');
}

// ─── Slug helper ──────────────────────────────────────────────────────────────

export function slugify(path: string[]): string {
  return path
    .join('-').toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─── Layout measurements ──────────────────────────────────────────────────────

interface Layout {
  /** Body padding (mm) — pushes content away from fixed running elements */
  padTop: number; padRight: number; padBottom: number; padLeft: number;
  /** Fixed header top position (mm from page top) */
  headerTop: number; headerHeight: number;
  /** Fixed footer bottom position (mm from page bottom) */
  footerBottom: number; footerHeight: number;
  /** Fixed border inset (mm from each page edge), 0 = disabled */
  borderInset: number;
  /** Approx height of one content page in mm (for cover sizing) */
  contentPageH: number;
}

function computeLayout(settings: PDFSettings): Layout {
  const headerHeight = 10; // mm — the dark brand header bar
  const footerHeight = 9;  // mm — page number + social icons

  if (settings.borderEnabled) {
    const bw    = settings.borderWidthMm;
    const inset = BORDER_INSET_MM;          // 10
    const cHalf = CORNER_ICON_SIZE_MM / 2;  // 9  (corner icon 18mm, half straddles border)
    const gap   = CONTENT_PADDING_MM;       // 6

    // Border edge is at (inset + bw) from page edge
    // Corner's inner edge is at (inset + bw + cHalf) from page edge
    // Content zone starts at (inset + bw + cHalf + gap) from page edge
    const sideBase = inset + bw + cHalf + gap; // ~27mm

    // Header sits inside border zone, just above content
    const headerTop = inset + bw + 1; // 13mm from top

    // Content start must be below header
    const padTop    = Math.max(sideBase, headerTop + headerHeight + 3);
    const padBottom = sideBase + footerHeight + 2;
    const padSide   = sideBase;

    return {
      padTop, padRight: padSide, padBottom, padLeft: padSide,
      headerTop, headerHeight,
      footerBottom: inset + bw + 1,
      footerHeight,
      borderInset: inset,
      contentPageH: PAGE_HEIGHT_MM - padTop - padBottom,
    };
  } else {
    const base = CONTENT_PADDING_MM + 4; // 10
    return {
      padTop:    headerHeight + base + 4,
      padRight:  base + 4,
      padBottom: footerHeight + base + 2,
      padLeft:   base + 4,
      headerTop: 4, headerHeight,
      footerBottom: 4, footerHeight,
      borderInset: 0,
      contentPageH: PAGE_HEIGHT_MM - (headerHeight + base + 4) - (footerHeight + base + 2),
    };
  }
}

// ─── Social footer bar ────────────────────────────────────────────────────────

const SOCIAL_ICONS: Record<string, string> = {
  instagram: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14"><defs><linearGradient id="iggrad" x1="0" x2="1" y1="1" y2="0"><stop offset="0%" stop-color="#f09433"/><stop offset="25%" stop-color="#e6683c"/><stop offset="50%" stop-color="#dc2743"/><stop offset="75%" stop-color="#cc2366"/><stop offset="100%" stop-color="#bc1888"/></linearGradient></defs><rect x="2" y="2" width="20" height="20" rx="5" fill="url(#iggrad)"/><path d="M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zm0 7.4a2.9 2.9 0 1 1 0-5.8 2.9 2.9 0 0 1 0 5.8zm4.3-7.5a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0z" fill="#FFF"/></svg>`,
  youtube:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14"><path fill="#FF0000" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/><path fill="#FFFFFF" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
  telegram:  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="12" r="12" fill="#24A1DE"/><path fill="#FFFFFF" d="M5.4 11.5L18.4 6.5C18.9 6.3 19.3 6.7 19.1 7.2L16.2 19C16.1 19.5 15.5 19.7 15.1 19.4L11.5 16.5 9 18V14.5L17.5 7.5C17.7 7.3 17.4 7.1 17.2 7.3L7 13.5 4.1 12.6C3.6 12.4 3.6 11.7 4.1 11.5Z"/></svg>`,
  playStore: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14"><path fill="#00E676" d="M3.2 23.8c.3.1.6.2 1 .2L15.5 12 4.2.1a1.5 1.5 0 0 0-1 .2C2.8.5 2.6 1 2.6 1.5v21c0 .5.2.9.6 1.3z"/><path fill="#FF3D00" d="M13.8 10.2L16 8l-9.5-5.4 7.3 7.6z"/><path fill="#FFC400" d="M16.7 13.1L21.2 12l-4.5-2.9-2.2 2.2 2.2 2.2z"/><path fill="#29B6F6" d="M6.3 4.4L15.8 9.9 13.6 12 6.3 4.4z"/></svg>`,
};

function buildSocialItems(links: PDFSettings['socialLinks'], accentColor: string): string {
  const items: string[] = [];
  if (links.telegram)  items.push(`<a href="${escHtml(links.telegram)}"  style="color:${accentColor};text-decoration:none;display:inline-flex;">${SOCIAL_ICONS.telegram}</a>`);
  if (links.instagram) items.push(`<a href="${escHtml(links.instagram)}" style="color:${accentColor};text-decoration:none;display:inline-flex;">${SOCIAL_ICONS.instagram}</a>`);
  if (links.youtube)   items.push(`<a href="${escHtml(links.youtube)}"   style="color:${accentColor};text-decoration:none;display:inline-flex;">${SOCIAL_ICONS.youtube}</a>`);
  if (links.playStore) items.push(`<a href="${escHtml(links.playStore)}" style="color:${accentColor};text-decoration:none;display:inline-flex;">${SOCIAL_ICONS.playStore}</a>`);
  return items.join('');
}

// ─── Running elements (position:fixed — repeat on every page) ─────────────────

function renderFixedElements(settings: PDFSettings, logoDataUrl: string | null, layout: Layout): string {
  const { primaryColor, accentColor } = settings;
  const parts: string[] = [];

  // ── Header bar ──────────────────────────────────────────────────────────────
  const logoImg = logoDataUrl
    ? `<img src="${logoDataUrl}" style="height:${layout.headerHeight - 2}mm;width:${layout.headerHeight - 2}mm;object-fit:cover;border-radius:50%;flex-shrink:0;background:white;" />`
    : '';
  parts.push(`
    <div class="running-header" style="
      position:fixed;
      top:${layout.headerTop}mm;
      left:${layout.borderInset ? layout.borderInset + settings.borderWidthMm + 1 : 6}mm;
      right:${layout.borderInset ? layout.borderInset + settings.borderWidthMm + 1 : 6}mm;
      height:${layout.headerHeight}mm;
      background:${DEFAULT_PRIMARY_DARK};
      color:white;
      display:flex;align-items:center;gap:8px;
      padding:0 10px;
      font-family:'Inter',sans-serif;
      font-size:9.5pt;font-weight:700;
      letter-spacing:0.3px;
      border-radius:2px;
      z-index:100;
      -webkit-print-color-adjust:exact;
      print-color-adjust:exact;
    ">
      ${logoImg}
      <span style="font-family:Georgia,serif;font-style:italic;font-size:11pt;">Siddhi</span>
      <span style="flex:1;"></span>
      <span style="font-size:6.5pt;opacity:0.75;font-weight:600;letter-spacing:1.5px;">QUESTION BANK</span>
    </div>`);

  // ── Footer bar ──────────────────────────────────────────────────────────────
  const socialItems = buildSocialItems(settings.socialLinks, accentColor);
  parts.push(`
    <div class="running-footer" style="
      position:fixed;
      bottom:${layout.footerBottom}mm;
      left:${layout.borderInset ? layout.borderInset + settings.borderWidthMm : 6}mm;
      right:${layout.borderInset ? layout.borderInset + settings.borderWidthMm : 6}mm;
      height:${layout.footerHeight}mm;
      display:flex;align-items:center;justify-content:center;gap:8px;
      z-index:100;
    ">
      ${socialItems ? `<span style="display:flex;gap:8px;">${socialItems}</span><span style="color:#CBD5E1;font-size:8pt;">|</span>` : ''}
      <span style="font-size:7.5pt;color:#64748B;font-family:'Inter',sans-serif;font-weight:500;">
        Page <span class="pg-num"></span>
      </span>
    </div>`);

  // ── Border ──────────────────────────────────────────────────────────────────
  if (settings.borderEnabled) {
    const { borderColor, borderStyle, borderWidthMm } = settings;
    const bi = BORDER_INSET_MM;
    const cs = CORNER_ICON_SIZE_MM;
    const logoEl = logoDataUrl
      ? `<div style="
          width:${cs}mm;height:${cs}mm;
          border-radius:50%;
          background:white;
          border:1.5px solid ${borderColor};
          display:flex;align-items:center;justify-content:center;
          overflow:hidden;
          box-sizing:border-box;
          box-shadow:0 1px 3px rgba(0,0,0,0.12);
        ">
          <img src="${logoDataUrl}" style="width:100%;height:100%;object-fit:cover;display:block;" />
        </div>`
      : `<div style="width:${cs}mm;height:${cs}mm;border-radius:50%;background:white;border:1.5px solid ${borderColor};"></div>`;

    parts.push(`
      <div class="running-border" style="
        position:fixed;top:${bi}mm;left:${bi}mm;right:${bi}mm;bottom:${bi}mm;
        border:${borderWidthMm}mm ${borderStyle} ${borderColor};
        box-sizing:border-box;pointer-events:none;z-index:10;
        -webkit-print-color-adjust:exact;print-color-adjust:exact;
      ">
        <div style="position:absolute;top:-${cs/2}mm;left:-${cs/2}mm;z-index:15;">${logoEl}</div>
        <div style="position:absolute;top:-${cs/2}mm;right:-${cs/2}mm;z-index:15;">${logoEl}</div>
        <div style="position:absolute;bottom:-${cs/2}mm;left:-${cs/2}mm;z-index:15;">${logoEl}</div>
        <div style="position:absolute;bottom:-${cs/2}mm;right:-${cs/2}mm;z-index:15;">${logoEl}</div>
      </div>`);
  }

  // ── Watermark ───────────────────────────────────────────────────────────────
  if (settings.watermarkEnabled && logoDataUrl) {
    const size = (Math.min(PAGE_WIDTH_MM, PAGE_HEIGHT_MM) * WATERMARK_SIZE_PERCENT) / 100;
    parts.push(`
      <img class="running-watermark" src="${logoDataUrl}" style="
        position:fixed;top:50%;left:50%;
        transform:translate(-50%,-50%);
        width:${size}mm;height:${size}mm;
        object-fit:contain;opacity:${WATERMARK_OPACITY};
        pointer-events:none;z-index:1;
        -webkit-print-color-adjust:exact;print-color-adjust:exact;
      " />`);
  }

  return parts.join('\n');
}

// ─── Question block ───────────────────────────────────────────────────────────

function renderQuestionBlock(q: Question, settings: PDFSettings): string {
  const { primaryColor, accentColor } = settings;
  const maxOptLen = Math.max(...Object.values(q.options).map(o => o.length));
  const useHorizontal = maxOptLen <= 40;

  const optionsHtml = useHorizontal
    ? `<div style="display:flex;flex-wrap:wrap;gap:3px 18px;margin:4px 0 5px 0;">
        ${(['A','B','C','D'] as const).map(l =>
          `<span style="display:inline-flex;gap:3px;align-items:flex-start;">
            <strong style="color:${primaryColor};flex-shrink:0;font-size:8.5pt;">${l})</strong>
            <span style="font-size:8.5pt;">${escHtml(q.options[l])}</span>
           </span>`).join('')}
       </div>`
    : `<div style="margin:4px 0 5px 0;">
        ${(['A','B','C','D'] as const).map(l =>
          `<div style="display:flex;gap:5px;align-items:flex-start;margin-bottom:1px;">
            <strong style="color:${primaryColor};flex-shrink:0;min-width:16px;font-size:8.5pt;">${l})</strong>
            <span style="font-size:8.5pt;word-break:break-word;flex:1;">${escHtml(q.options[l])}</span>
           </div>`).join('')}
       </div>`;

  const answerBadge = `<span style="background:${primaryColor};color:white;padding:1px 7px;border-radius:8px;font-size:7pt;font-weight:700;white-space:nowrap;flex-shrink:0;">Ans: ${q.answer}</span>`;

  const diffBadge = settings.difficultyBadgeEnabled
    ? (() => { const c = DIFFICULTY_COLORS[q.difficulty]; return `<span style="background:${c.bg};color:${c.text};padding:1px 6px;border-radius:8px;font-size:7pt;font-weight:700;white-space:nowrap;">${q.difficulty}</span>`; })()
    : '';

  const topicBadge = (settings.topicBadgeEnabled && q.subjectPath.length > 0)
    ? `<span style="background:${TOPIC_BADGE.bg};color:${TOPIC_BADGE.text};padding:1px 6px;border-radius:8px;font-size:7pt;font-weight:500;white-space:nowrap;max-width:100px;overflow:hidden;text-overflow:ellipsis;display:inline-block;">${escHtml(q.subjectPath[q.subjectPath.length - 1])}</span>`
    : '';

  const badgeRow = (diffBadge || topicBadge)
    ? `<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">${diffBadge}${topicBadge}</div>`
    : '';

  // The explanation link — targets #exp-N which is in document flow
  const expLink = `<a href="#exp-${q.number}" style="color:${accentColor};font-size:7.5pt;text-decoration:none;font-weight:600;white-space:nowrap;">View Explanation ↓</a>`;

  return `<div id="q-${q.number}" style="
    break-inside:avoid;
    page-break-inside:avoid;
    border-bottom:0.5px solid #E0E0E0;
    padding:6px 0 5px 0;
    position:relative;z-index:2;
  ">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
      <div style="flex:1;min-width:0;">
        <span style="font-weight:700;color:${primaryColor};font-size:8.5pt;">Q${q.number}. </span><span style="color:${NEUTRAL_TEXT};font-size:8.5pt;word-break:break-word;">${escHtml(q.text)}</span>
      </div>
      ${answerBadge}
    </div>
    ${optionsHtml}
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:nowrap;gap:4px;margin-top:2px;">
      ${badgeRow || '<span></span>'}
      ${expLink}
    </div>
  </div>`;
}

// ─── Topic heading ────────────────────────────────────────────────────────────

function renderTopicHeading(path: string[], primaryColor: string): string {
  const slug = slugify(path);
  const label = path[path.length - 1];
  const parent = path.length > 1 ? path.slice(0, -1).join(' › ') : '';
  return `<div id="topic-${slug}" style="
    break-after:avoid;page-break-after:avoid;
    background:${primaryColor}15;
    border-left:3px solid ${primaryColor};
    padding:4px 8px;margin:10px 0 4px 0;
    position:relative;z-index:2;
  ">
    ${parent ? `<div style="font-size:6.5pt;color:#888;margin-bottom:1px;">${escHtml(parent)}</div>` : ''}
    <div style="font-weight:700;font-size:9.5pt;color:${primaryColor};">${escHtml(label)}</div>
  </div>`;
}

// ─── Explanation entry ────────────────────────────────────────────────────────

function renderExplanationEntry(q: Question, primaryColor: string, accentColor: string): string {
  return `<div id="exp-${q.number}" style="
    break-inside:avoid;page-break-inside:avoid;
    border:1px solid #E0E5EA;border-radius:6px;
    padding:9px 11px;margin-bottom:9px;
    background:#FAFBFC;
    position:relative;z-index:2;
  ">
    <div style="font-weight:700;color:${primaryColor};font-size:9pt;margin-bottom:4px;">Q${q.number} — Explanation</div>
    <div style="color:${NEUTRAL_TEXT};font-size:8.5pt;line-height:1.55;margin-bottom:6px;word-break:break-word;">${escHtml(q.explanation)}</div>
    <div style="background:${primaryColor}10;border-left:2px solid ${primaryColor};padding:3px 7px;margin-bottom:5px;font-size:8pt;">
      <strong>Correct Answer:</strong> ${q.answer}) ${escHtml(q.options[q.answer])}
    </div>
    <a href="#q-${q.number}" style="color:${accentColor};font-size:7.5pt;text-decoration:none;font-weight:600;">← Back to Question ${q.number}</a>
  </div>`;
}

// ─── Table of contents ────────────────────────────────────────────────────────

interface FlatEntry { path: string[]; slug: string; count: number; depth: number; }

function buildFlatTopicList(questions: Question[]): FlatEntry[] {
  const map = new Map<string, { path: string[]; count: number }>();
  for (const q of questions) {
    for (let d = 1; d <= q.subjectPath.length; d++) {
      const slice = q.subjectPath.slice(0, d);
      const key = slice.join('|||');
      if (!map.has(key)) map.set(key, { path: slice, count: 0 });
      map.get(key)!.count++;
    }
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, { path, count }]) => ({ path, count, slug: slugify(path), depth: path.length - 1 }));
}

function renderTOC(entries: FlatEntry[], primaryColor: string, accentColor: string): string {
  const rows = entries.map(({ path, slug, count, depth }) => {
    const label = path[path.length - 1];
    return `<div style="
      break-inside:avoid;page-break-inside:avoid;
      display:flex;align-items:center;gap:6px;
      padding:4px ${depth * 14}px 4px ${depth * 14 + 4}px;
      border-bottom:0.5px dotted #D1D5DB;
    ">
      <a href="#topic-${slug}" style="color:${primaryColor};text-decoration:none;font-size:8.5pt;flex:1;min-width:0;word-break:break-word;">${escHtml(label)}</a>
      <span style="font-size:7pt;color:#9CA3AF;white-space:nowrap;">${count}Q</span>
      <a href="#topic-${slug}" style="color:${accentColor};font-size:9pt;text-decoration:none;font-weight:700;flex-shrink:0;">→</a>
    </div>`;
  }).join('');

  return `
    <h2 style="font-size:13pt;font-weight:700;color:${primaryColor};margin:0 0 10px 0;padding-bottom:6px;border-bottom:2.5px solid ${primaryColor};position:relative;z-index:2;">
      Contents
    </h2>
    ${rows}
  `;
}

// ─── Cover page ───────────────────────────────────────────────────────────────

function renderCoverSection(coverSettings: CoverSettings | null, layout: Layout): string {
  // z-index:500 puts the overlay in the ROOT stacking context (its ancestor chain
  // has no stacking context nodes), guaranteeing it paints above fixed elements
  // (header z-index:100, border z-index:10, watermark z-index:1).
  const overlayStyle = `
    position: absolute;
    top: -${layout.padTop}mm;
    left: -${layout.padLeft}mm;
    width: ${PAGE_WIDTH_MM}mm;
    height: ${PAGE_HEIGHT_MM}mm;
    z-index: 500;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  `;

  let inner = '';
  if (!coverSettings) {
    inner = `<div style="${overlayStyle}background:linear-gradient(150deg,#0F3D6E 0%,#1B5EA7 55%,#14B89A 100%);display:flex;align-items:center;justify-content:center;">
      <div style="text-align:center;color:white;">
        <div style="font-size:30pt;font-weight:700;font-family:Georgia,serif;font-style:italic;margin-bottom:8px;text-shadow:0 2px 12px rgba(0,0,0,0.3);">Siddhi</div>
        <div style="font-size:13pt;opacity:0.8;letter-spacing:3px;text-transform:uppercase;">Question Bank</div>
      </div>
    </div>`;
  } else {
    const posX = `${Math.round(coverSettings.focalX * 100)}%`;
    const posY = `${Math.round(coverSettings.focalY * 100)}%`;
    inner = `<div style="${overlayStyle}">
      <img src="${coverSettings.dataUrl}" style="
        width:100%;height:100%;
        object-fit:cover;
        object-position:${posX} ${posY};
        display:block;
      " />
    </div>`;
  }

  // The wrapper is position:relative WITHOUT a z-index → no new stacking context.
  // This is essential: without a stacking context on the wrapper, the absolute child
  // (z-index:500) participates in the ROOT stacking context directly.
  return `
    <div style="position:relative;height:${layout.contentPageH}mm;break-after:page;page-break-after:always;">
      ${inner}
    </div>
  `;
}

// ─── Ad block ─────────────────────────────────────────────────────────────────

function renderAdBlock(dataUrl: string, linkUrl: string | undefined, layout: Layout): string {
  // Use absolute positioning for the link/wrapper to ensure the entire page is clickable
  // and Chromium's PDF generator correctly registers the bounding box for the hyperlink.
  const inner = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:contain;display:block;margin:auto;" />`;
  const content = linkUrl
    ? `<a href="${escHtml(linkUrl.startsWith('http') ? linkUrl : 'https://' + linkUrl)}" style="display:block;position:absolute;inset:0;width:100%;height:100%;">${inner}</a>`
    : `<div style="display:block;position:absolute;inset:0;width:100%;height:100%;">${inner}</div>`;

  // Same stacking context strategy as cover: wrapper has position:relative but NO z-index
  // → no stacking context → absolute child (z-index:500) is in the ROOT context.
  return `
    <div style="position:relative;height:${layout.contentPageH}mm;break-before:page;page-break-before:always;break-after:page;page-break-after:always;">
      <div style="
        position:absolute;
        top:-${layout.padTop}mm;
        left:-${layout.padLeft}mm;
        width:${PAGE_WIDTH_MM}mm;
        height:${PAGE_HEIGHT_MM}mm;
        background:#0A0A0A;
        z-index:500;
        -webkit-print-color-adjust:exact;
        print-color-adjust:exact;
      ">
        ${content}
      </div>
    </div>
  `;
}

// ─── Main template builder ────────────────────────────────────────────────────

export interface TemplateOptions {
  questions: Question[];
  coverSettings: CoverSettings | null;
  logoDataUrl: string | null;
  settings: PDFSettings;
  previewMode?: boolean;
  previewQuestionIndex?: number;
}

export function buildHTMLTemplate(opts: TemplateOptions): string {
  const { questions, coverSettings, logoDataUrl, settings,
          previewMode = false, previewQuestionIndex = 0 } = opts;

  const layout = computeLayout(settings);
  const flatTopics = buildFlatTopicList(questions);
  const { primaryColor, accentColor } = settings;

  // ── PREVIEW MODE ────────────────────────────────────────────────────────────
  if (previewMode) {
    const sampleQ = questions[previewQuestionIndex] ?? questions[0];
    const previewHtml = sampleQ
      ? renderTopicHeading(sampleQ.subjectPath, primaryColor) + renderQuestionBlock(sampleQ, settings)
      : '<p style="color:#888;font-size:9pt;padding:20px;">No question to preview.</p>';

    return wrapHtml({
      body: previewHtml,
      fixedElements: renderFixedElements(settings, logoDataUrl, layout),
      layout,
      previewMode: true,
    });
  }

  // ── FULL DOCUMENT ───────────────────────────────────────────────────────────
  const sections: string[] = [];

  // 1. Cover page
  sections.push(renderCoverSection(coverSettings, layout));

  // 2. Table of Contents
  sections.push(`<div style="break-before:page;page-break-before:always;">
    ${renderTOC(flatTopics, primaryColor, accentColor)}
  </div>`);

  // 3. Question sections — natural flow, grouped by topic
  sections.push(`<div style="break-before:page;page-break-before:always;">`);

  let contentPageCount = 0;
  let adIndex = 0;
  let prevTopicKey = '';

  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi];
    const topicKey = q.subjectPath.join('|||');

    if (topicKey !== prevTopicKey) {
      sections.push(renderTopicHeading(q.subjectPath, primaryColor));
      prevTopicKey = topicKey;
    }
    sections.push(renderQuestionBlock(q, settings));

    // Ad insertion: every N questions we estimate a new page was used
    // We use a rough estimate: every 7 questions ≈ 1 content page
    if (settings.adsEnabled && settings.adImages.length > 0) {
      const pagesUsed = Math.floor((qi + 1) / 7);
      if (pagesUsed > contentPageCount && pagesUsed % settings.adIntervalPages === 0) {
        contentPageCount = pagesUsed;
        const ad = settings.adImages[adIndex % settings.adImages.length];
        sections.push('</div>'); // close current section
        sections.push(renderAdBlock(ad.dataUrl, ad.linkUrl, layout));
        sections.push(`<div style="break-before:page;page-break-before:always;">`); // reopen
        adIndex++;
      }
    }
  }

  sections.push(`</div>`); // close question section

  // 4. Explanations section
  const explanations = questions
    .map(q => renderExplanationEntry(q, primaryColor, accentColor))
    .join('');

  sections.push(`<div style="break-before:page;page-break-before:always;">
    <h2 style="font-size:13pt;font-weight:700;color:${primaryColor};margin:0 0 10px 0;padding-bottom:6px;border-bottom:2.5px solid ${primaryColor};position:relative;z-index:2;">
      Explanations
    </h2>
    ${explanations}
  </div>`);

  return wrapHtml({
    body: sections.join('\n'),
    fixedElements: renderFixedElements(settings, logoDataUrl, layout),
    layout,
    previewMode: false,
  });
}

// ─── HTML wrapper ─────────────────────────────────────────────────────────────

interface WrapOpts {
  body: string;
  fixedElements: string;
  layout: Layout;
  previewMode: boolean;
}

function wrapHtml({ body, fixedElements, layout, previewMode }: WrapOpts): string {
  // In preview mode: scale the A4 page down to fit the iframe
  const previewStyle = previewMode ? `
    body { transform-origin: top left; }
  ` : '';

  // Skip Google Fonts in preview mode for speed — use system font stack instead
  const fontLink = previewMode ? '' : `
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Siddhi Question Bank</title>
  ${fontLink}
  <style>
    /* ── Reset ── */
    *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }

    /* ── Page setup — zero margins, we control all spacing ── */
    @page {
      size: ${PAGE_WIDTH_MM}mm ${PAGE_HEIGHT_MM}mm;
      margin: 0;
    }

    /* ── Base typography ── */
    html, body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 9pt;
      color: #1F1F1F;
      background: white;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      color-adjust: exact;
    }

    /* ── Body padding creates the safe content zone ── */
    body {
      padding: ${layout.padTop}mm ${layout.padRight}mm ${layout.padBottom}mm ${layout.padLeft}mm;
    }

    /* ── CSS page counter for footer ── */
    .pg-num::after { content: counter(page); }

    /* NOTE: We do NOT add z-index to body > * here.
       Question blocks, topic headings, and explanation entries each carry
       position:relative; z-index:2 as inline styles — sufficient to place
       content above the watermark (z-index:1) while staying in the root
       stacking context.
       Cover/ad page overlays use z-index:500 in the root stacking context,
       which correctly beats fixed header/footer/border (z-index:10-100). */

    /* ── Force page breaks ── */
    .break-before { break-before: page; page-break-before: always; }

    /* ── Question and explanation blocks must not split across pages ── */
    [id^="q-"], [id^="exp-"] {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    /* ── Topic headings must not be separated from the question below ── */
    [id^="topic-"] {
      break-after: avoid;
      page-break-after: avoid;
    }

    ${previewStyle}

    /* ── Print reset for screen preview ── */
    @media screen {
      body {
        padding: 0;
        margin: 0;
        background: ${previewMode ? 'white' : '#D1D5DB'};
        display: flex;
        justify-content: center;
        align-items: flex-start;
      }
      .page-content-container {
        position: relative;
        background: white;
        width: ${PAGE_WIDTH_MM}mm;
        box-shadow: ${previewMode ? 'none' : '0 8px 32px rgba(0,0,0,0.25)'};
        padding: ${layout.padTop}mm ${layout.padRight}mm ${layout.padBottom}mm ${layout.padLeft}mm;
      }
      .running-header, .running-footer, .running-border, .running-watermark {
        position: absolute !important;
      }
      .pg-num::after {
        content: "1";
      }
    }
  </style>
</head>
<body>
  ${fixedElements}
  <div class="page-content-container">
    ${body}
  </div>
</body>
</html>`;
}
