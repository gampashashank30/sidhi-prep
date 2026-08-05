// lib/mathRenderer.ts — Client-safe math renderer
//
// This module exposes ONLY the renderMath() function so client components
// (e.g. Step 2 preview cards) can render KaTeX math without bundling the
// entire PDF-generation code from pdfTemplate.ts.
//
// pdfTemplate.ts re-exports this same function so there is a single source
// of truth for the rendering logic.

import katex from 'katex';
import { unescapeMarkdown, normalizeMathEquations, fixUnbalancedBraces } from './text';

// ─── HTML escape ──────────────────────────────────────────────────────────────

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Math-aware renderer (KaTeX) ─────────────────────────────────────────────
// Detects all LaTeX delimiter styles, normalises double-backslash escaping,
// cleans up Word OMML remnants, and renders each math fragment with KaTeX.

export function renderMath(raw: string): string {
  if (!raw) return '';

  // 1. Normalize Word OMML linear math markers (█, 〖, 〗, &@&)
  const normalized = normalizeMathEquations(raw);

  // 2. Strip markdown headings safely while preserving math delimiters
  const text = normalized
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/gs, '$1');

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

    const isBlock = m[1] !== undefined || m[3] !== undefined;
    let mathContent = (m[1] ?? m[2] ?? m[3] ?? m[4]).replace(/\\\\(?=[a-zA-Z])/g, '\\');

    const katexOpts = {
      throwOnError: true,
      displayMode: isBlock,
      output: 'html' as const,
      strict: false,
    };

    // Pre-clean math content: balance braces & strip loose alignment ampersands
    let mathContentCleaned = fixUnbalancedBraces(mathContent.replace(/(?:^|\s)&+/g, ' ').trim());

    try {
      out.push(katex.renderToString(mathContentCleaned, katexOpts));
    } catch (e: any) {
      // Retry 1: If mathContent contains alignment chars (& or \\), try wrapping in \begin{aligned}
      if (mathContent.includes('&') || mathContent.includes('\\\\')) {
        try {
          const alignedContent = '\\begin{aligned}\n' + mathContent + '\n\\end{aligned}';
          out.push(katex.renderToString(alignedContent, { ...katexOpts, displayMode: true }));
          lastIdx = m.index + m[0].length;
          continue;
        } catch (e2) {
          // Fall through
        }
      }

      // Retry 2: Strip all ampersands entirely and retry
      try {
        const noAmp = mathContentCleaned.replace(/&/g, ' ');
        out.push(katex.renderToString(noAmp, katexOpts));
        lastIdx = m.index + m[0].length;
        continue;
      } catch (e3) {
        // Fall through
      }

      // Final fallback: render as plain monospace text (NEVER RED!)
      out.push(`<span style="color:#1F1F1F;font-family:monospace;font-size:0.875em;">${escHtml(mathContentCleaned)}</span>`);
    }

    lastIdx = m.index + m[0].length;
  }

  // Remaining plain text — unescape markdown before HTML-escaping
  if (lastIdx < text.length) {
    out.push(escHtml(unescapeMarkdown(text.slice(lastIdx))).replace(/\n/g, '<br/>'));
  }

  return out.join('');
}
