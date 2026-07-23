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
import { unescapeMarkdown } from './text';

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
    // Emit preceding plain text — unescape markdown before HTML-escaping
    if (m.index > lastIdx) {
      out.push(escHtml(unescapeMarkdown(text.slice(lastIdx, m.index))).replace(/\n/g, '<br/>'));
    }

    const isBlock     = m[1] !== undefined || m[3] !== undefined;
    // Unescape commands like \\frac to \frac, but LEAVE \\ line breaks intact!
    let mathContent = (m[1] ?? m[2] ?? m[3] ?? m[4]).replace(/\\\\(?=[a-zA-Z])/g, '\\');

    // Force display style for inline math to prevent squished fractions
    if (!isBlock) {
      mathContent = '\\displaystyle ' + mathContent;
    }

    const katexOpts = {
      throwOnError: true,
      displayMode:  isBlock,
      output:       'html' as const,
      strict:       false,
    };

    try {
      out.push(katex.renderToString(mathContent, katexOpts));
    } catch (e: any) {
      const msg = e.message || '';
      // If KaTeX fails due to alignment chars (& or \\), wrap in aligned and retry
      if (msg.includes('Misplaced') || msg.includes('\\\\') || mathContent.includes('&') || mathContent.includes('\\\\')) {
        try {
          const alignedContent = '\\begin{aligned}\n' + mathContent + '\n\\end{aligned}';
          out.push(katex.renderToString(alignedContent, katexOpts));
          continue; // Success on retry
        } catch (e2) {
          // Fall through
        }
      }
      // If still failing, output raw math gracefully
      out.push(`<span style="color:#1F1F1F;font-family:monospace;font-size:8.5pt;">${escHtml(mathContent)}</span>`);
    }

    lastIdx = m.index + m[0].length;
  }

  // Remaining plain text — unescape markdown before HTML-escaping
  if (lastIdx < text.length) {
    out.push(escHtml(unescapeMarkdown(text.slice(lastIdx))).replace(/\n/g, '<br/>'));
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
  playStore: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="display:block;width:100%;height:100%;"><defs><linearGradient id="ps_a" x1="7.5" y1="12" x2="24" y2="12" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#00aeff"/><stop offset="1" stop-color="#0076ff"/></linearGradient><linearGradient id="ps_b" x1="1.5" y1="4.5" x2="13.24" y2="16.24" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#00e979"/><stop offset="1" stop-color="#00c16e"/></linearGradient><linearGradient id="ps_c" x1="2.5" y1="14.5" x2="10.5" y2="22.5" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffcc00"/><stop offset="1" stop-color="#ff9800"/></linearGradient><linearGradient id="ps_d" x1="2" y1="2" x2="10" y2="10" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ff3a44"/><stop offset="1" stop-color="#b11162"/></linearGradient></defs><path d="M2.3 1.2C2 1.6 1.9 2.1 1.9 2.7v18.6c0 .6.1 1.1.4 1.5l.1.1 10.4-10.4v-.2L2.3 1.2z" fill="url(#ps_b)"/><path d="M16.3 15.9l-3.5-3.5V12l3.5-3.5.1.1 4.1 2.4c1.2.7 1.2 1.8 0 2.4l-4.2 2.5z" fill="url(#ps_a)"/><path d="M16.4 15.8L12.8 12 2.3 22.5c.4.4 1 .4 1.8 0l12.3-6.7" fill="url(#ps_c)"/><path d="M16.4 8.2L4.1 1.5C3.3 1.1 2.7 1.1 2.3 1.5L12.8 12l3.6-3.8z" fill="url(#ps_d)"/></svg>`,
  // Apple App Store — black apple silhouette on white rounded square
  appStore: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="display:block;width:100%;height:100%;"><rect width="24" height="24" rx="5.5" fill="#000"/><path fill="white" d="M16.05 12.86c-.02-1.9 1.55-2.82 1.62-2.87-0.88-1.29-2.26-1.47-2.75-1.49-1.17-.12-2.29.69-2.88.69-.6 0-1.52-.67-2.5-.65-1.28.02-2.47.75-3.13 1.9-1.34 2.33-.34 5.77.96 7.66.64.92 1.4 1.96 2.4 1.92.96-.04 1.33-.62 2.49-.62 1.17 0 1.5.62 2.52.6 1.03-.02 1.68-.94 2.31-1.87.73-1.07 1.03-2.11 1.05-2.17-.02-.01-2.07-.8-2.09-3.1zm-1.96-5.7c.53-.65.89-1.55.79-2.45-.77.03-1.7.51-2.25 1.15-.49.57-.93 1.48-.81 2.36.86.07 1.73-.44 2.27-1.06z"/></svg>`,
  // Microsoft Store — four-colour Windows logo on white rounded square
  microsoftStore: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="display:block;width:100%;height:100%;"><rect width="24" height="24" rx="5.5" fill="#fff" stroke="#E2E8F0" stroke-width="1"/><rect x="3.5" y="3.5" width="7.5" height="7.5" fill="#F35325"/><rect x="13" y="3.5" width="7.5" height="7.5" fill="#81BC06"/><rect x="3.5" y="13" width="7.5" height="7.5" fill="#05A6F0"/><rect x="13" y="13" width="7.5" height="7.5" fill="#FFBA08"/></svg>`,
};

// Each icon is wrapped in a 7mm × 7mm div for consistent, large display in the footer
function buildSocialItems(links: PDFSettings['socialLinks'], accentColor: string): string {
  const wrap = (icon: string, href: string) =>
    `<a href="${escHtml(href)}" style="display:inline-flex;width:7mm;height:7mm;flex-shrink:0;text-decoration:none;" title="">${icon}</a>`;
  const items: string[] = [];
  if (links.telegram)       items.push(wrap(SOCIAL_ICONS.telegram,       links.telegram));
  if (links.instagram)      items.push(wrap(SOCIAL_ICONS.instagram,      links.instagram));
  if (links.youtube)        items.push(wrap(SOCIAL_ICONS.youtube,        links.youtube));
  if (links.playStore)      items.push(wrap(SOCIAL_ICONS.playStore,      links.playStore));
  if (links.appStore)       items.push(wrap(SOCIAL_ICONS.appStore,       links.appStore));
  if (links.microsoftStore) items.push(wrap(SOCIAL_ICONS.microsoftStore, links.microsoftStore));
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

  // ── Footer bar — social icons centered, page number in bottom-right ──────────
  // When border is enabled, footer zone is between page edge and border outer edge
  // (0–10mm zone). When border is disabled, footer is inside page normally.
  const socialItems = buildSocialItems(settings.socialLinks, accentColor);
  const fLeft  = layout.borderInset ? '3mm' : '6mm';
  const fRight = layout.borderInset ? '3mm' : '6mm';
  const fBottom = `${layout.footerBottom}mm`;
  const fHeight = `${layout.footerHeight}mm`;

  // Social icons — centered in the footer zone
  parts.push(`
    <div class="running-footer" style="
      position:fixed;
      bottom:${fBottom};
      left:${fLeft};
      right:${fRight};
      height:${fHeight};
      display:flex;align-items:center;justify-content:center;
      gap:4mm;
      z-index:150;
      -webkit-print-color-adjust:exact;
      print-color-adjust:exact;
    ">
      ${socialItems
        ? `<span style="display:flex;align-items:center;gap:3.5mm;">${socialItems}</span>`
        : ''}
    </div>`);

  // Page number is rendered by Puppeteer's displayHeaderFooter footer template
  // (see pdfRenderer.ts). Using CSS counter(page) in position:fixed is unreliable
  // in Chromium and always shows 0. Puppeteer's <span class="pageNumber"> is the
  // only guaranteed-correct approach.

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
  // Use custom watermark image when provided, otherwise fall back to app logo
  const wmSrc = settings.watermarkDataUrl ?? logoDataUrl;
  if (settings.watermarkEnabled && wmSrc) {
    const size = (Math.min(PAGE_WIDTH_MM, PAGE_HEIGHT_MM) * WATERMARK_SIZE_PERCENT) / 100;
    parts.push(`
      <img class="running-watermark" src="${wmSrc}" style="
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

function renderQuestionBlock(q: Question, settings: PDFSettings, displayNumber: number): string {
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
          `<div style="display:flex;gap:4px;align-items:flex-start;margin-bottom:2px;">
            <strong style="color:${primaryColor};flex-shrink:0;font-size:8.5pt;min-width:14px;">${l})</strong>
            <span style="font-size:8.5pt;word-break:break-word;">${renderMath(stripMarkdown(q.options[l]))}</span>
           </div>`).join('')}
       </div>`;

  const answerBadge = settings.showAnswer
    ? `<span style="background:${primaryColor};color:white;padding:1px 7px;border-radius:8px;font-size:7pt;font-weight:700;white-space:nowrap;flex-shrink:0;">Ans: ${q.answer}</span>`
    : '';

  const diffBadge = (settings.difficultyBadgeEnabled && q.difficulty)
    ? (() => { const c = DIFFICULTY_COLORS[q.difficulty]; return `<span style="background:${c.bg};color:${c.text};padding:1px 6px;border-radius:8px;font-size:7pt;font-weight:700;white-space:nowrap;">${q.difficulty}</span>`; })()
    : '';

  const topicBadge = (settings.topicBadgeEnabled && q.subjectPath.length > 0)
    ? `<span style="background:${TOPIC_BADGE.bg};color:${TOPIC_BADGE.text};padding:1px 7px;border-radius:8px;font-size:7pt;font-weight:500;white-space:nowrap;">${escHtml(q.subjectPath.join(' \u203a '))}</span>`
    : '';


  const badgeRow = (diffBadge || topicBadge)
    ? `<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">${diffBadge}${topicBadge}</div>`
    : '';

  // The explanation link — only shown when explanations are included
  const expLink = settings.includeExplanations
    ? `<a href="#exp-${q.number}" style="color:${accentColor};font-size:7.5pt;text-decoration:none;font-weight:600;white-space:nowrap;">View Explanation ↓</a>`
    : '';

  return `<a id="q-${q.number}" name="q-${q.number}"></a>
  <div id="q-${q.number}" style="
    break-inside:avoid;
    page-break-inside:avoid;
    border-bottom:0.5px solid #E0E0E0;
    padding:6px 0 5px 0;
    position:relative;z-index:2;
  ">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
      <div style="flex:1;min-width:0;">
        <span style="font-weight:700;color:${primaryColor};font-size:8.5pt;">Q${displayNumber}. </span><span style="color:${NEUTRAL_TEXT};font-size:8.5pt;word-break:break-word;">${renderMath(stripMarkdown(q.text))}</span>
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

function renderTopicHeading(path: string[], primaryColor: string, emittedSlugs: Set<string>): string {
  const fullSlug = slugify(path);
  const label = path[path.length - 1];
  const parent = path.length > 1 ? path.slice(0, -1).join(' › ') : '';

  // Generate explicit anchor tags for all topic path prefixes so TOC items redirect correctly
  const anchorTags: string[] = [];
  for (let d = 1; d <= path.length; d++) {
    const prefixPath = path.slice(0, d);
    const prefixSlug = slugify(prefixPath);
    if (!emittedSlugs.has(prefixSlug)) {
      emittedSlugs.add(prefixSlug);
      anchorTags.push(`<a id="topic-${prefixSlug}" name="topic-${prefixSlug}"></a>`);
    }
  }

  return `${anchorTags.join('')}<div id="topic-${fullSlug}" style="
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

function renderExplanationEntry(q: Question, primaryColor: string, accentColor: string, displayNumber: number): string {
  return `<a id="exp-${q.number}" name="exp-${q.number}"></a>
  <div id="exp-${q.number}" style="
    break-inside:avoid;page-break-inside:avoid;
    border:1px solid #E0E5EA;border-radius:6px;
    padding:9px 11px;margin-bottom:9px;
    background:#FAFBFC;
    position:relative;z-index:2;
  ">
    <div style="font-weight:700;color:${primaryColor};font-size:9pt;margin-bottom:4px;">Q${displayNumber} — Explanation</div>
    <div style="color:${NEUTRAL_TEXT};font-size:8.5pt;line-height:1.55;margin-bottom:6px;word-break:break-word;">${renderMath(stripMarkdown(q.explanation))}</div>
    <div style="background:${primaryColor}10;border-left:2px solid ${primaryColor};padding:3px 7px;margin-bottom:5px;font-size:8pt;">
      <strong>Correct Answer:</strong> ${q.answer}) ${renderMath(stripMarkdown(q.options[q.answer]))}
    </div>
    <a href="#q-${q.number}" style="color:${accentColor};font-size:7.5pt;text-decoration:none;font-weight:600;">← Back to Question ${displayNumber}</a>
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
    const isTop = depth === 0;
    const paddingLeft = isTop ? 10 : 10 + depth * 14;
    return `<a href="#topic-${slug}" style="
      display:block;
      text-decoration:none;
      break-inside:avoid;page-break-inside:avoid;
      padding:${isTop ? 6 : 4}px 10px ${isTop ? 6 : 4}px ${paddingLeft}px;
      border-bottom:0.5px solid ${isTop ? primaryColor + '25' : '#E5E7EB'};
      background:${isTop ? primaryColor + '08' : 'transparent'};
    ">
      <div style="display:flex;align-items:center;gap:7px;">
        ${isTop
          ? `<span style="width:3px;height:16px;background:${primaryColor};border-radius:2px;flex-shrink:0;"></span>`
          : `<span style="width:5px;height:5px;border-radius:50%;background:${accentColor};flex-shrink:0;margin-left:4px;opacity:0.7;"></span>`}
        <span style="font-size:${isTop ? 9 : 8}pt;font-weight:${isTop ? 700 : 500};color:${isTop ? primaryColor : '#374151'};flex:1;line-height:1.4;">${escHtml(label)}</span>
        <span style="font-size:7pt;font-weight:700;color:${isTop ? 'white' : '#6B7280'};background:${isTop ? primaryColor : '#F3F4F6'};padding:1px 6px;border-radius:9999px;white-space:nowrap;flex-shrink:0;">${count}Q</span>
      </div>
    </a>`;
  }).join('');

  return `
    <div style="display:flex;align-items:center;gap:8pt;margin-bottom:14pt;padding-bottom:8pt;border-bottom:2.5px solid ${primaryColor};position:relative;z-index:2;">
      <div style="width:24pt;height:24pt;border-radius:6pt;background:${primaryColor};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="15" y2="18"/></svg>
      </div>
      <h2 style="font-size:13pt;font-weight:700;color:${primaryColor};margin:0;line-height:1.2;">Contents</h2>
    </div>
    <div style="border:1px solid ${primaryColor}22;border-radius:6pt;overflow:hidden;position:relative;z-index:2;">
      ${rows}
    </div>
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
// Renders a single dedicated ad page containing ALL uploaded ad images (1 or 2).
// - 1 image: full content-area height, centered
// - 2 images: stacked vertically in equal halves, each independently clickable
// Strict page-break-before:always + break-after:always ensures the ad never
// merges with surrounding question/explanation content.

function renderAdPage(adImages: import('./types').AdImage[], layout: Layout): string {
  const pageH = layout.contentPageH;
  const imgCount = Math.min(adImages.length, 2); // safety cap

  const slots = adImages.slice(0, imgCount).map((ad) => {
    const imgEl = `<img src="${ad.dataUrl}" style="
      display:block;
      max-width:100%;
      max-height:100%;
      width:auto;
      height:auto;
      object-fit:contain;
      -webkit-print-color-adjust:exact;
      print-color-adjust:exact;
    " />`;

    const inner = ad.linkUrl
      ? `<a href="${escHtml(ad.linkUrl.startsWith('http') ? ad.linkUrl : 'https://' + ad.linkUrl)}" style="
          display:flex;
          align-items:center;
          justify-content:center;
          width:100%;
          height:100%;
          text-decoration:none;
        ">${imgEl}</a>`
      : `<div style="
          display:flex;
          align-items:center;
          justify-content:center;
          width:100%;
          height:100%;
        ">${imgEl}</div>`;

    // Each slot takes equal share of the total ad page height
    const slotH = Math.floor(pageH / imgCount);
    return `<div style="
      width:100%;
      height:${slotH}mm;
      display:flex;
      align-items:center;
      justify-content:center;
      overflow:hidden;
      box-sizing:border-box;
      ${imgCount === 2 ? 'border-bottom:1px solid #E2E8F0;' : ''}
    ">${inner}</div>`;
  });

  return `
    <div style="
      height:${pageH}mm;
      break-before:page;
      page-break-before:always;
      break-after:page;
      page-break-after:always;
      break-inside:avoid;
      page-break-inside:avoid;
      display:flex;
      flex-direction:column;
      align-items:stretch;
      justify-content:center;
      background:#F8FAFC;
      border:1px solid #E2E8F0;
      border-radius:4px;
      position:relative;
      z-index:2;
      overflow:hidden;
      box-sizing:border-box;
      -webkit-print-color-adjust:exact;
      print-color-adjust:exact;
    ">
      ${slots.join('\n')}
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
  analyticsCharts?: { donut: boolean; pie: boolean; column: boolean };
}

// ─── Analytics page builder (pure SVG, static — no JS needed) ─────────────────

function buildAnalyticsSlices(questions: Question[]): Array<{ label: string; count: number; pct: number; color: string }> {
  const COLORS = ['#6366F1','#14B89A','#F59E0B','#EF4444','#10B981','#8B5CF6','#3B82F6','#EC4899','#F97316','#06B6D4'];
  const map = new Map<string, number>();
  for (const q of questions) {
    const key = q.subjectPath[0] ?? 'Uncategorised';
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  const total = questions.length;
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, count], i) => ({
      label, count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
      color: COLORS[i % COLORS.length],
    }));
}

function buildSvgArcPath(cx: number, cy: number, rOut: number, rIn: number, startDeg: number, endDeg: number, type: 'donut' | 'pie'): string {
  const sweep = Math.min(endDeg - startDeg, 359.999);
  const large = sweep > 180 ? 1 : 0;
  const toXY = (r: number, deg: number) => ({
    x: cx + r * Math.cos((deg * Math.PI) / 180),
    y: cy + r * Math.sin((deg * Math.PI) / 180),
  });
  const s = toXY(rOut, startDeg); const e = toXY(rOut, startDeg + sweep);
  if (type === 'pie') return `M ${cx} ${cy} L ${s.x} ${s.y} A ${rOut} ${rOut} 0 ${large} 1 ${e.x} ${e.y} Z`;
  const si = toXY(rIn, startDeg); const ei = toXY(rIn, startDeg + sweep);
  return `M ${s.x} ${s.y} A ${rOut} ${rOut} 0 ${large} 1 ${e.x} ${e.y} L ${ei.x} ${ei.y} A ${rIn} ${rIn} 0 ${large} 0 ${si.x} ${si.y} Z`;
}

function renderAnalyticsPage(
  questions: Question[],
  charts: { donut: boolean; pie: boolean; column: boolean },
  primaryColor: string,
): string {
  if (questions.length === 0) return '';
  const slices = buildAnalyticsSlices(questions);
  const total = questions.length;
  const any = charts.donut || charts.pie || charts.column;
  if (!any) return '';

  // ── Donut SVG (static) ──────────────────────────────────────────────────────
  function buildDonutSvg(): string {
    const SIZE = 180; const CX = 90; const CY = 90;
    let paths = ''; let angle = -90;
    for (const sl of slices) {
      const sweep = (sl.count / total) * 360;
      const d = buildSvgArcPath(CX, CY, 78, 44, angle, angle + sweep, 'donut');
      paths += `<path d="${d}" fill="${sl.color}" stroke="white" stroke-width="2"/>`;
      angle += sweep;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
      ${paths}
      <text x="${CX}" y="${CY - 7}" text-anchor="middle" dominant-baseline="auto" font-size="22" font-weight="700" fill="#0F172A" font-family="Inter,sans-serif">${total}</text>
      <text x="${CX}" y="${CY + 14}" text-anchor="middle" dominant-baseline="auto" font-size="9" fill="#94A3B8" font-family="Inter,sans-serif">questions</text>
    </svg>`;
  }

  // ── Pie SVG (static) ────────────────────────────────────────────────────────
  function buildPieSvg(): string {
    const SIZE = 180; const CX = 90; const CY = 90;
    let paths = ''; let angle = -90;
    for (const sl of slices) {
      const sweep = (sl.count / total) * 360;
      const d = buildSvgArcPath(CX, CY, 82, 0, angle, angle + sweep, 'pie');
      paths += `<path d="${d}" fill="${sl.color}" stroke="white" stroke-width="2"/>`;
      angle += sweep;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">${paths}</svg>`;
  }

  // ── Column SVG (static) ─────────────────────────────────────────────────────
  function buildColumnSvg(): string {
    const W = 380; const H = 150; const PL = 30; const PT = 10; const PB = 50; const PR = 8;
    const iW = W - PL - PR; const iH = H - PT - PB;
    const maxC = Math.max(...slices.map((s) => s.count));
    const barW = Math.max(14, Math.min(42, (iW / slices.length) * 0.6));
    const gap = iW / slices.length;
    let bars = '';
    // Gridlines
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      const y = PT + iH * (1 - p);
      bars += `<line x1="${PL}" x2="${W - PR}" y1="${y}" y2="${y}" stroke="#E2E8F0" stroke-width="1" stroke-dasharray="${p === 0 ? '' : '3,3'}"/>`;
      bars += `<text x="${PL - 4}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="8" fill="#94A3B8" font-family="Inter,sans-serif">${Math.round(maxC * p)}</text>`;
    }
    for (let i = 0; i < slices.length; i++) {
      const sl = slices[i];
      const bH = maxC > 0 ? (sl.count / maxC) * iH : 0;
      const x = PL + gap * i + (gap - barW) / 2;
      const y = PT + iH - bH;
      const lbl = sl.label.length > 10 ? sl.label.slice(0, 9) + '\u2026' : sl.label;
      bars += `<rect x="${x}" y="${y}" width="${barW}" height="${bH}" rx="4" fill="${sl.color}"/>`;
      bars += `<text x="${x + barW / 2}" y="${y - 3}" text-anchor="middle" font-size="8" font-weight="700" fill="${sl.color}" font-family="Inter,sans-serif">${sl.count}</text>`;
      bars += `<text x="${x + barW / 2}" y="${PT + iH + 9}" text-anchor="middle" dominant-baseline="hanging" font-size="8" fill="#64748B" font-family="Inter,sans-serif">${lbl}</text>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${bars}</svg>`;
  }

  // ── Legend HTML ─────────────────────────────────────────────────────────────
  const legendItems = slices.map((s) =>
    `<div style="display:flex;align-items:center;gap:6pt;min-width:0;">
      <span style="width:8pt;height:8pt;border-radius:2pt;background:${s.color};flex-shrink:0;"></span>
      <span style="font-size:7.5pt;color:#475569;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;">${escHtml(s.label)}</span>
      <span style="font-size:7.5pt;font-weight:700;color:#0F172A;flex-shrink:0;">${s.count}</span>
      <span style="font-size:7pt;color:white;font-weight:600;background:${s.color};border-radius:9999pt;padding:1pt 4pt;flex-shrink:0;">${s.pct}%</span>
    </div>`
  ).join('');

  const legendCols = slices.length > 6 ? 3 : slices.length > 3 ? 2 : 1;

  // ── Chart blocks HTML ────────────────────────────────────────────────────────
  let chartBlocks = '';

  if (charts.donut) {
    chartBlocks += `
      <div style="display:flex;flex-direction:column;align-items:center;gap:8pt;padding:14pt 16pt 12pt;background:linear-gradient(135deg,rgba(99,102,241,0.05),rgba(139,92,246,0.04));border:1px solid rgba(99,102,241,0.15);border-radius:10pt;break-inside:avoid;page-break-inside:avoid;">
        <p style="font-size:7.5pt;font-weight:700;color:#6366F1;text-transform:uppercase;letter-spacing:0.06em;margin:0;">Donut Chart</p>
        ${buildDonutSvg()}
        <div style="display:grid;grid-template-columns:repeat(${legendCols},1fr);gap:4pt 12pt;width:100%;">${legendItems}</div>
      </div>`;
  }

  if (charts.pie) {
    chartBlocks += `
      <div style="display:flex;flex-direction:column;align-items:center;gap:8pt;padding:14pt 16pt 12pt;background:linear-gradient(135deg,rgba(20,184,154,0.05),rgba(6,182,212,0.04));border:1px solid rgba(20,184,154,0.15);border-radius:10pt;break-inside:avoid;page-break-inside:avoid;">
        <p style="font-size:7.5pt;font-weight:700;color:#14B89A;text-transform:uppercase;letter-spacing:0.06em;margin:0;">Pie Chart</p>
        ${buildPieSvg()}
        <div style="display:grid;grid-template-columns:repeat(${legendCols},1fr);gap:4pt 12pt;width:100%;">${legendItems}</div>
      </div>`;
  }

  if (charts.column) {
    chartBlocks += `
      <div style="display:flex;flex-direction:column;align-items:center;gap:8pt;padding:14pt 16pt 12pt;background:linear-gradient(135deg,rgba(245,158,11,0.05),rgba(249,115,22,0.04));border:1px solid rgba(245,158,11,0.15);border-radius:10pt;break-inside:avoid;page-break-inside:avoid;">
        <p style="font-size:7.5pt;font-weight:700;color:#D97706;text-transform:uppercase;letter-spacing:0.06em;margin:0;">Column Chart</p>
        ${buildColumnSvg()}
        <div style="display:grid;grid-template-columns:repeat(${legendCols},1fr);gap:4pt 12pt;width:100%;">${legendItems}</div>
      </div>`;
  }

  return `
    <div style="break-before:page;page-break-before:always;position:relative;z-index:2;">
      <!-- Analytics Page Header -->
      <div style="display:flex;align-items:center;gap:8pt;margin-bottom:16pt;padding-bottom:8pt;border-bottom:2.5px solid ${escHtml(primaryColor)};">
        <div style="width:28pt;height:28pt;border-radius:8pt;background:linear-gradient(135deg,#6366F1,#8B5CF6);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
            <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
            <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
          </svg>
        </div>
        <div>
          <h2 style="font-size:13pt;font-weight:700;color:${escHtml(primaryColor)};margin:0;line-height:1.2;">Topic Analytics</h2>
          <p style="font-size:8pt;color:#64748B;margin:2pt 0 0 0;">Question distribution by subject — ${total} questions across ${slices.length} subject${slices.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <!-- Summary stat pills -->
      <div style="display:flex;gap:8pt;flex-wrap:wrap;margin-bottom:16pt;">
        ${slices.slice(0, 5).map((s) =>
          `<div style="display:inline-flex;align-items:center;gap:5pt;padding:4pt 9pt;border-radius:9999pt;background:${s.color}1A;border:1.2px solid ${s.color}40;">
            <span style="width:7pt;height:7pt;border-radius:50%;background:${s.color};"></span>
            <span style="font-size:7.5pt;font-weight:600;color:#0F172A;">${escHtml(s.label)}</span>
            <span style="font-size:7.5pt;font-weight:700;color:${s.color};">${s.count}</span>
          </div>`
        ).join('')}
        ${slices.length > 5 ? `<div style="display:inline-flex;align-items:center;padding:4pt 9pt;border-radius:9999pt;background:#F1F5F9;border:1.2px solid #E2E8F0;"><span style="font-size:7.5pt;font-weight:600;color:#64748B;">+${slices.length - 5} more</span></div>` : ''}
      </div>

      <!-- Chart blocks grid -->
      <div style="display:grid;grid-template-columns:${charts.donut && charts.pie && !charts.column ? '1fr 1fr' : charts.donut && charts.pie && charts.column ? '1fr 1fr' : '1fr'};gap:14pt;">
        ${chartBlocks}
      </div>
    </div>`;
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
      ? renderTopicHeading(sampleQ.subjectPath, primaryColor, new Set<string>()) + renderQuestionBlock(sampleQ, settings, 1)
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

  // 2b. Analytics page (if any charts enabled)
  const analyticsCharts = opts.analyticsCharts;
  if (analyticsCharts && (analyticsCharts.donut || analyticsCharts.pie || analyticsCharts.column)) {
    const analyticsHtml = renderAnalyticsPage(questions, analyticsCharts, primaryColor);
    if (analyticsHtml) sections.push(analyticsHtml);
  }

  // 3. Question sections — natural flow, grouped by topic
  sections.push(`<div style="break-before:page;page-break-before:always;">`);

  const emittedTopicSlugs = new Set<string>();
  let prevTopicKey = '';

  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi];
    const displayNumber = qi + 1; // Sequential 1-based display number regardless of original q.number
    const topicKey = q.subjectPath.join('|||');

    if (topicKey !== prevTopicKey) {
      sections.push(renderTopicHeading(q.subjectPath, primaryColor, emittedTopicSlugs));
      prevTopicKey = topicKey;
    }
    sections.push(renderQuestionBlock(q, settings, displayNumber));

    // Ad insertion: after every N questions, inject a full ad page.
    // (qi+1) is question count processed so far. We insert AFTER the Nth question
    // so the ad always appears between complete question blocks — never mid-question.
    if (
      settings.adsEnabled &&
      settings.adImages.length > 0 &&
      (qi + 1) % settings.adIntervalQuestions === 0 &&
      qi + 1 < questions.length // don't add a trailing ad after the very last question
    ) {
      sections.push('</div>'); // close current question section cleanly
      sections.push(renderAdPage(settings.adImages, layout));
      sections.push(`<div style="break-before:page;page-break-before:always;">`); // reopen
    }
  }

  sections.push(`</div>`); // close question section

  // 4. Explanations section — only rendered when settings.includeExplanations is true
  if (settings.includeExplanations) {
    sections.push(`<div style="break-before:page;page-break-before:always;">
      <h2 style="font-size:13pt;font-weight:700;color:${primaryColor};margin:0 0 10px 0;padding-bottom:6px;border-bottom:2.5px solid ${primaryColor};position:relative;z-index:2;">
        Explanations
      </h2>`);

    for (let qi = 0; qi < questions.length; qi++) {
      const q = questions[qi];
      const displayNumber = qi + 1; // Sequential 1-based display number
      sections.push(renderExplanationEntry(q, primaryColor, accentColor, displayNumber));

      // Same exact-count ad insertion in the explanations section
      if (
        settings.adsEnabled &&
        settings.adImages.length > 0 &&
        (qi + 1) % settings.adIntervalQuestions === 0 &&
        qi + 1 < questions.length
      ) {
        sections.push('</div>'); // close current explanation section cleanly
        sections.push(renderAdPage(settings.adImages, layout));
        sections.push(`<div style="break-before:page;page-break-before:always;">`); // reopen
      }
    }

    sections.push(`</div>`);
  }
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

  // Inline KaTeX CSS from local node_modules to eliminate network requests during PDF render
  let katexCss = `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" />`;
  try {
    const fs = require('fs');
    const path = require('path');
    const cssPath = path.join(process.cwd(), 'node_modules', 'katex', 'dist', 'katex.min.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    katexCss = `<style>${cssContent}</style>`;
  } catch {
    // fallback if file read fails
  }

  // Preconnect Google Fonts with font-display swap for fast fallback rendering
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
