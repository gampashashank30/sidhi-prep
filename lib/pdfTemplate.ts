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
import katex from 'katex';
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

// ─── Math-aware renderer (SERVER-SIDE via KaTeX) ──────────────────────────────────────
// Detects all LaTeX delimiter styles, normalises double-backslash escaping
// (markdown converters output \\frac instead of \frac), and renders each
// math fragment server-side with katex.renderToString() so Puppeteer gets
// fully-rendered HTML with no browser-side JS required.

export function renderMath(raw: string): string {
  if (!raw) return '';

  // Strip markdown bold/italic/heading remnants from the docx converter
  const text = raw
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/\*(.+?)\*/gs,    '$1')
    .replace(/^\s*#{1,6}\s*/gm, '');

  const out: string[] = [];

  // One-pass regex: match all four LaTeX delimiter styles in priority order
  //   $$...$$ → block    (group 1)
  //   $...$   → inline   (group 2)
  //   \[...\] → block    (group 3)
  //   \(...\) → inline   (group 4)
  const mathRe = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|\\\[([\s\S]+?)\\\]|\\\(([^)]+?)\\\)/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;

  while ((m = mathRe.exec(text)) !== null) {
    // Emit preceding plain text
    if (m.index > lastIdx) {
      out.push(escHtml(text.slice(lastIdx, m.index)).replace(/\n/g, '<br/>'));
    }

    const isBlock     = m[1] !== undefined || m[3] !== undefined;
    // Normalise \\frac → \frac etc. (markdown escapes backslashes as \\)
    let mathContent = (m[1] ?? m[2] ?? m[3] ?? m[4]).replace(/\\\\/g, '\\');

    // Force display style for inline math to prevent squished fractions
    if (!isBlock) {
      mathContent = '\\displaystyle ' + mathContent;
    }

    try {
      out.push(katex.renderToString(mathContent, {
        throwOnError: false,
        displayMode:  isBlock,
        output:       'html',
        strict:       false,
      }));
    } catch {
      // Fallback: show raw math without crashing
      out.push(`<code style="font-size:0.85em;color:#555;">${escHtml(mathContent)}</code>`);
    }

    lastIdx = m.index + m[0].length;
  }

  // Remaining plain text
  if (lastIdx < text.length) {
    out.push(escHtml(text.slice(lastIdx)).replace(/\n/g, '<br/>'));
  }

  return out.join('');
}

// stripMarkdown is now handled inside renderMath above.
// Kept as a no-op alias so existing call-sites don't break.
export function stripMarkdown(s: string): string { return s; }

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
  const headerHeight = 9;  // mm
  const footerHeight = 10; // mm

  if (settings.borderEnabled) {
    const bw    = settings.borderWidthMm;
    const inset = BORDER_INSET_MM;          // 10mm
    const cHalf = CORNER_ICON_SIZE_MM / 2;  // 8mm
    const gap   = CONTENT_PADDING_MM;       // 6mm

    // Corner icon bottom from page top: inset + cHalf = 10 + 8 = 18mm
    // Header must start BELOW corner icons to avoid overlap.
    const headerTop = inset + cHalf + 2; // 20mm — safely below corner icon bottom (18mm)

    // Content must start below the header
    const padTop    = headerTop + headerHeight + 3; // 32mm

    // Content must end above bottom corner icons (bottom from page: inset + cHalf = 18mm)
    // Footer is OUTSIDE border (below page edge), so padBottom only needs to clear corners.
    const padBottom = inset + cHalf + 2; // 20mm

    // Sides: clear border line + corner icon horizontal extent + gap
    const padSide   = inset + bw + cHalf + gap; // 26mm

    // Footer outside border (between page edge and border outer edge, 0-10mm zone)
    const fBottom = 1;  // mm from page edge
    const fHeight = footerHeight;

    return {
      padTop, padRight: padSide, padBottom, padLeft: padSide,
      headerTop, headerHeight,
      footerBottom: fBottom,
      footerHeight: fHeight,
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

// Social icon SVGs — sized via wrapper div (7mm × 7mm), no fixed px width/height on SVG
const SOCIAL_ICONS: Record<string, string> = {
  // Proper Instagram brand icon — radial gradient (yellow→orange→red→purple→blue)
  instagram: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="display:block;width:100%;height:100%;"><defs><radialGradient id="ig_rg" cx="30%" cy="110%" r="130%"><stop offset="0%" stop-color="#fdf497"/><stop offset="10%" stop-color="#fdf497"/><stop offset="40%" stop-color="#fd5949"/><stop offset="65%" stop-color="#d6249f"/><stop offset="100%" stop-color="#285AEB"/></radialGradient></defs><rect x="1.5" y="1.5" width="21" height="21" rx="5.5" fill="url(#ig_rg)"/><circle cx="12" cy="12" r="4.8" fill="none" stroke="white" stroke-width="2"/><circle cx="17.6" cy="6.4" r="1.4" fill="white"/></svg>`,
  youtube:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="display:block;width:100%;height:100%;"><rect x="0" y="3" width="24" height="18" rx="4" fill="#FF0000"/><polygon points="9.5,8 9.5,16 17,12" fill="white"/></svg>`,
  telegram:  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="display:block;width:100%;height:100%;"><circle cx="12" cy="12" r="12" fill="#24A1DE"/><path fill="white" d="M5.4 11.5L18.4 6.5C18.9 6.3 19.3 6.7 19.1 7.2L16.2 19C16.1 19.5 15.5 19.7 15.1 19.4L11.5 16.5 9 18V14.5L17.5 7.5C17.7 7.3 17.4 7.1 17.2 7.3L7 13.5 4.1 12.6C3.6 12.4 3.6 11.7 4.1 11.5Z"/></svg>`,
  playStore: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="display:block;width:100%;height:100%;"><path fill="#00C853" d="M3 23.5c.3.2.7.3 1.1.1L16.5 12 4.1.4C3.7.2 3.3.3 3 .5 2.7.8 2.5 1.2 2.5 1.6v20.8c0 .4.2.8.5 1.1z"/><path fill="#FF3D00" d="M14.2 10.2L17 7.8 5.4 1.3l8.8 8.9z"/><path fill="#FFC400" d="M17.8 13.1L21.5 12l-4.5-2.2-2.2 2.2 2.2 2.2 0.8-1.1z"/><path fill="#29B6F6" d="M5.4 22.7L17 16.2 14.2 13.8 5.4 22.7z"/></svg>`,
};

// Each icon is wrapped in a 7mm × 7mm div for consistent, large display in the footer
function buildSocialItems(links: PDFSettings['socialLinks'], accentColor: string): string {
  const wrap = (icon: string, href: string) =>
    `<a href="${escHtml(href)}" style="display:inline-flex;width:7mm;height:7mm;flex-shrink:0;text-decoration:none;" title="">${icon}</a>`;
  const items: string[] = [];
  if (links.telegram)  items.push(wrap(SOCIAL_ICONS.telegram,  links.telegram));
  if (links.instagram) items.push(wrap(SOCIAL_ICONS.instagram, links.instagram));
  if (links.youtube)   items.push(wrap(SOCIAL_ICONS.youtube,   links.youtube));
  if (links.playStore) items.push(wrap(SOCIAL_ICONS.playStore, links.playStore));
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

  // ── Footer bar — placed OUTSIDE the border (below border frame) ─────────────
  // When border is enabled, footer is between page edge and border outer edge
  // (0–10mm zone). When border is disabled, footer is inside page normally.
  const socialItems = buildSocialItems(settings.socialLinks, accentColor);
  const fLeft  = layout.borderInset ? '3mm' : '6mm';
  const fRight = layout.borderInset ? '3mm' : '6mm';
  parts.push(`
    <div class="running-footer" style="
      position:fixed;
      bottom:${layout.footerBottom}mm;
      left:${fLeft};
      right:${fRight};
      height:${layout.footerHeight}mm;
      display:flex;align-items:center;justify-content:center;
      gap:4mm;
      z-index:150;
      -webkit-print-color-adjust:exact;
      print-color-adjust:exact;
    ">
      ${socialItems
        ? `<span style="display:flex;align-items:center;gap:3.5mm;">${socialItems}</span>
           <span style="width:0.5px;height:5mm;background:#CBD5E1;flex-shrink:0;"></span>`
        : ''}
      <span style="font-size:7pt;color:#64748B;font-family:'Inter',sans-serif;font-weight:600;white-space:nowrap;">
        Page <span class="pg-num"></span>
      </span>
    </div>`);

  // ── Border + Corner icons ─────────────────────────────────────────────────────
  if (settings.borderEnabled) {
    const { borderColor, borderStyle, borderWidthMm } = settings;
    const bi = BORDER_INSET_MM; // 10mm from page edges
    const cs = CORNER_ICON_SIZE_MM; // 16mm diameter
    const half = cs / 2; // 8mm

    const logoEl = logoDataUrl
      ? `<div style="
          width:${cs}mm;height:${cs}mm;
          border-radius:50%;
          background:${primaryColor};
          border:2px solid ${borderColor};
          display:flex;align-items:center;justify-content:center;
          overflow:hidden;
          box-shadow:0 1px 4px rgba(0,0,0,0.2);
          -webkit-print-color-adjust:exact;print-color-adjust:exact;
        ">
          <img src="${logoDataUrl}" style="width:82%;height:82%;object-fit:contain;" />
        </div>`
      : `<div style="
          width:${cs}mm;height:${cs}mm;
          border-radius:50%;
          background:${primaryColor};
          border:2px solid ${borderColor};
          display:flex;align-items:center;justify-content:center;
          color:white;font-weight:700;font-size:9pt;
          -webkit-print-color-adjust:exact;print-color-adjust:exact;
        ">S</div>`;

    // Border frame (z:10)
    parts.push(`
      <div class="running-border" style="
        position:fixed;
        top:${bi}mm;
        left:${bi}mm;
        right:${bi}mm;
        bottom:${bi}mm;
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
            <span style="font-size:8.5pt;">${renderMath(stripMarkdown(q.options[l]))}</span>
           </span>`).join('')}
       </div>`
    : `<div style="margin:4px 0 5px 0;">
        ${(['A','B','C','D'] as const).map(l =>
          `<div style="display:flex;gap:5px;align-items:flex-start;margin-bottom:1px;">
            <strong style="color:${primaryColor};flex-shrink:0;min-width:16px;font-size:8.5pt;">${l})</strong>
            <span style="font-size:8.5pt;word-break:break-word;flex:1;">${renderMath(stripMarkdown(q.options[l]))}</span>
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
        <span style="font-weight:700;color:${primaryColor};font-size:8.5pt;">Q${q.number}. </span><span style="color:${NEUTRAL_TEXT};font-size:8.5pt;word-break:break-word;">${renderMath(stripMarkdown(q.text))}</span>
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
    <div style="color:${NEUTRAL_TEXT};font-size:8.5pt;line-height:1.55;margin-bottom:6px;word-break:break-word;">${renderMath(stripMarkdown(q.explanation))}</div>
    <div style="background:${primaryColor}10;border-left:2px solid ${primaryColor};padding:3px 7px;margin-bottom:5px;font-size:8pt;">
      <strong>Correct Answer:</strong> ${q.answer}) ${renderMath(stripMarkdown(q.options[q.answer]))}
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
// Ad fills only the content area so the fixed border/header/footer show through,
// giving the ad page the same template/branding as content pages.

function renderAdBlock(dataUrl: string, linkUrl: string | undefined, layout: Layout): string {
  const img = `<img src="${dataUrl}" style="max-width:100%;max-height:${layout.contentPageH}mm;width:auto;height:auto;object-fit:contain;display:block;" />`;
  const content = linkUrl
    ? `<a href="${escHtml(linkUrl.startsWith('http') ? linkUrl : 'https://' + linkUrl)}" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;">${img}</a>`
    : `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;">${img}</div>`;

  return `
    <div style="
      height:${layout.contentPageH}mm;
      break-before:page;page-break-before:always;
      break-after:page;page-break-after:always;
      display:flex;align-items:center;justify-content:center;
      background:#F8FAFC;
      border:1px solid #E2E8F0;
      border-radius:4px;
      position:relative;z-index:2;
      overflow:hidden;
      -webkit-print-color-adjust:exact;print-color-adjust:exact;
    ">
      ${content}
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

  // KaTeX CSS only — math HTML is rendered server-side, no JS needed
  const katexCss = `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" />`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Siddhi Question Bank</title>
  ${fontLink}
  ${katexCss}
  <style>
    /* ── Reset ── */
    *, *::before, *::after { box-sizing:border-box; }
    body, h1, h2, h3, h4, h5, h6, p, ul, ol, li, figure, figcaption, blockquote, dl, dd { margin:0; padding:0; }

    /* ── Math Rendering Fixes ── */
    .katex { line-height: normal; }
    .katex * { line-height: normal; }

    /* ── Page setup: 0 margins, the table handles clearance ── */
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


    /* ── Body: no padding — @page margins handle per-page spacing ── */
    body {
      margin: 0;
      padding: 0;
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
      }
      .running-header, .running-footer, .running-border, .running-watermark {
        position: absolute !important;
      }
      .pg-num::after {
        content: "1";
      }
    }
    @media print {
      .page-content-container {
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="page-content-container">
    ${fixedElements}
    <table style="width: 100%; border-collapse: collapse; border: none; table-layout: fixed; margin: 0; padding: 0;">
      <thead>
        <tr><td style="height: ${layout.padTop}mm; border: none; padding: 0;"></td></tr>
      </thead>
      <tbody>
        <tr><td style="border: none; padding: 0 ${layout.padRight}mm 0 ${layout.padLeft}mm; vertical-align: top;">
          ${body}
        </td></tr>
      </tbody>
      <tfoot>
        <tr><td style="height: ${layout.padBottom}mm; border: none; padding: 0;"></td></tr>
      </tfoot>
    </table>
  </div>
</body>
</html>`;
}
