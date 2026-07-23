// lib/text.ts — Shared text-processing utilities
//
// These helpers are used by both the parser (server-side) and the PDF template
// to ensure every character in question text, options, and explanations is
// faithfully represented regardless of how the .docx-to-markdown converter
// chose to escape it.

/**
 * Unescape all Markdown backslash-escape sequences from a plain-text string.
 *
 * The @aidalinfo/office-to-markdown converter escapes characters that have
 * special meaning in Markdown (underscores, brackets, dashes, etc.) by
 * prefixing them with a backslash. For example:
 *
 *   "___"  →  "\_\_\_"
 *   "[A]"  →  "\[A\]"
 *   "x–y"  →  "x\-y"   (or the literal en-dash Unicode, depending on version)
 *
 * ⚠️  CRITICAL: Call this ONLY on plain text, NEVER on LaTeX math content.
 *    Inside $...$, $$...$$, \(...\), or \[...\] blocks, backslash sequences
 *    like \frac, \_, \{ carry LaTeX meaning and must not be stripped.
 *    The renderMath() function already splits text into plain/math segments
 *    before calling this helper.
 */
export function unescapeMarkdown(s: string): string {
  if (!s) return s;

  return (
    s
      // ── 1. Markdown backslash escapes (CommonMark spec §6.1) ──────────────
      // Characters that Markdown treats as special and converters therefore escape.
      // Order: process \\ first so we don't double-process subsequent replacements.
      .replace(/\\([\\`*_{}[\]()#+\-.!|~<>])/g, '$1')

      // ── 2. HTML entities the converter may embed ──────────────────────────
      // Numeric / named entities that arrive as literal &xxx; strings
      // (NOT from escHtml — those are added later in the render pipeline).
      .replace(/&amp;/g,   '&')
      .replace(/&lt;/g,    '<')
      .replace(/&gt;/g,    '>')
      .replace(/&quot;/g,  '"')
      .replace(/&apos;/g,  "'")
      .replace(/&mdash;/g, '\u2014')   // — em dash
      .replace(/&ndash;/g, '\u2013')   // – en dash
      .replace(/&nbsp;/g,  ' ')
      // Generic numeric HTML entities  &#65; or &#x41;
      .replace(/&#(\d+);/g,            (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-fA-F]+);/g,  (_, h) => String.fromCodePoint(parseInt(h, 16)))

      // ── 3. Unicode normalization quirks ───────────────────────────────────
      .replace(/\u00A0/g, ' ')   // non-breaking space  → regular space
      .replace(/\u00AD/g, '')    // soft hyphen          → remove
      .replace(/\u200B/g, '')    // zero-width space     → remove
      .replace(/\uFEFF/g, '')    // BOM / zero-width NBS → remove
  );
}

/**
 * Normalise a single topic-path segment from a Subject: line.
 *
 * 1. Unescapes markdown escapes  (e.g. Fill\_In\_The\_Blanks → Fill_In_The_Blanks)
 * 2. Trims surrounding whitespace
 * 3. Title-cases every word      (e.g. fill in the blanks → Fill In The Blanks)
 */
export function normaliseTopicSegment(s: string): string {
  const unescaped = unescapeMarkdown(s.trim());
  return unescaped.replace(/\w\S*/g, (w) =>
    w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  );
}
