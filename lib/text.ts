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

/**
 * Helper: Balance curly braces in a LaTeX fragment to prevent syntax errors.
 */
export function fixUnbalancedBraces(s: string): string {
  if (!s) return s;

  let open = 0;
  let result = '';

  for (let i = 0; i < s.length; i++) {
    const char = s[i];
    if (char === '{') {
      open++;
      result += char;
    } else if (char === '}') {
      if (open > 0) {
        open--;
        result += char;
      }
      // If open === 0, skip extra closing brace
    } else {
      result += char;
    }
  }

  // Append any missing closing braces
  while (open > 0) {
    result += '}';
    open--;
  }

  return result;
}

/**
 * Helper: Protect existing math blocks ($...$, $$...$$, \[...\], \(...\))
 * and auto-wrap bare LaTeX commands or plain-text math equations in $...$.
 * Processes line-by-line to preserve multiline explanation layouts!
 */
function autoWrapBareMath(text: string): string {
  if (!text) return text;

  // 1. Protect all existing delimited math blocks ($...$, $$...$$, \[...\], \(...\)) multiline-safe
  const placeholders: string[] = [];
  const mathRe = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|\\\[([\s\S]+?)\\\]|\\\(([^)]+?)\\\)/g;

  let protectedText = text.replace(mathRe, (match) => {
    placeholders.push(match);
    return `___MATH_TOKEN_${placeholders.length - 1}___`;
  });

  // 2. Un-escape stray brackets from docx converter: \[361-6pq\] -> [361-6pq] (outside math blocks)
  protectedText = protectedText.replace(/\\\[/g, '[').replace(/\\\]/g, ']');

  // 3. Process line-by-line for bare LaTeX commands and bare equations
  const processedText = protectedText
    .split('\n')
    .map((line) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return line;

      // Wrap bare LaTeX commands (e.g. \sqrt{3}, \frac{1}{2}, \times, \div, \pm, \le, \ge, \neq, \therefore, \Delta)
      const bareCmdRe = /\\(?:sqrt|frac|vec|overline|begin|end|alpha|beta|theta|pi|pm|infty|le|ge|neq|times|div|cdot|sum|int|therefore|because|Delta)(?:\{[^{}]*\}|\[[^[\]]*\])*/g;
      let l = line.replace(bareCmdRe, (match) => {
        const trimmed = fixUnbalancedBraces(match.trim());
        return `$${trimmed}$`;
      });

      // Wrap standalone math equations (e.g. x^2 + 17x - 168 = 0, (x - 7)(x + 24) = 0, 84 = 1/2 * (17+x) * x)
      const bareEqRe = /(?:^|\s)((?:[a-zA-Z0-9()]+(?:\^[0-9a-zA-Z]+|\/[0-9a-zA-Z]+)?\s*[-+*=:\/]\s*)+[a-zA-Z0-9().]+)(?=\s|$)/g;
      l = l.replace(bareEqRe, (match, eqGroup) => {
        const trimmed = eqGroup.trim();
        // Only wrap if it contains explicit math operators (^, =, +, -, \sqrt, etc.) and isn't plain words
        if (/[\^=]/.test(trimmed) || (/\/|\*/.test(trimmed) && /\d/.test(trimmed))) {
          return match.replace(trimmed, `$${trimmed}$`);
        }
        return match;
      });

      return l;
    })
    .join('\n');

  // 4. Restore protected math blocks
  return processedText.replace(/___MATH_TOKEN_(\d+)___/g, (_, idx) => {
    return placeholders[Number(idx)];
  });
}

/**
 * Clean up Word linear OMML equation remnants and normalize math content.
 * Handles artifacts from Word equation editor (like █, 〖, 〗, &@&, @&, ■)
 * and auto-wraps bare LaTeX/Unicode equations in $...$.
 */
export function normalizeMathEquations(raw: string): string {
  if (!raw) return '';

  let s = raw;

  // 1. Remove Word OMML grouping brackets
  s = s.replace(/[〖〗]/g, '');

  // 2. Clean up OMML linear block/matrix markers: █(...) or ■(...)
  // e.g. █(eq1@&eq2@&eq3) -> eq1\neq2\neq3
  s = s.replace(/[█■]\(([\s\S]+?)\)/g, (_, body: string) => {
    return body
      .replace(/&@&|@&|&@/g, '\n')
      .replace(/@/g, '\n')
      .replace(/&/g, ' ');
  });

  // 3. Clean up loose OMML markers & alignment ampersands left outside matrix blocks
  s = s.replace(/[█■]/g, '');
  s = s.replace(/&@&|@&|&@/g, ' ');
  // Remove loose alignment ampersands from Word equations (e.g. "& \frac{4}{7}", "& x^4", "&=54")
  s = s.replace(/(?:^|\s)&+\s*=/g, ' =');
  s = s.replace(/(?:^|\s)&+/g, ' ');

  // 4. Normalize double-escaped LaTeX commands (e.g. \\frac -> \frac, \\sqrt -> \sqrt)
  s = s.replace(/\\\\([a-zA-Z]+)/g, '\\$1');

  // 5. Fix common corrupted LaTeX patterns from docx conversion
  s = s.replace(/\\sqrt\{(\d+)\}(\d+)\}/g, '\\sqrt{$1} : \\sqrt{$2}');
  s = s.replace(/\\frac\{1\}\{x\}7\}\{5\}/g, '\\frac{1}{x} = -\\frac{7}{5}');

  // 6. Convert Unicode math symbols to LaTeX equivalents
  // Superscripts ² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹ ⁰ ⁺ ⁻ ⁿ
  s = s.replace(/([a-zA-Z0-9()]+)²/g, '$1^2');
  s = s.replace(/([a-zA-Z0-9()]+)³/g, '$1^3');
  s = s.replace(/([a-zA-Z0-9()]+)⁴/g, '$1^4');
  s = s.replace(/([a-zA-Z0-9()]+)⁵/g, '$1^5');
  s = s.replace(/([a-zA-Z0-9()]+)ⁿ/g, '$1^n');

  // Radicals √625 -> \sqrt{625}, √3 -> \sqrt{3}, √(16+2) -> \sqrt{16+2}
  s = s.replace(/√\(([^\)]+)\)/g, '\\sqrt{$1}');
  s = s.replace(/√([0-9a-zA-Z]+)/g, '\\sqrt{$1}');

  // Math operators
  s = s.replace(/×/g, '\\times ');
  s = s.replace(/÷/g, '\\div ');
  s = s.replace(/±/g, '\\pm ');
  s = s.replace(/≤/g, '\\le ');
  s = s.replace(/≥/g, '\\ge ');
  s = s.replace(/≠/g, '\\neq ');
  s = s.replace(/∴/g, '\\therefore ');
  s = s.replace(/∵/g, '\\because ');
  s = s.replace(/Δ/g, '\\Delta ');

  // 7. Balance braces in any raw fractions/LaTeX commands
  s = fixUnbalancedBraces(s);

  // 8. Auto-wrap bare LaTeX commands & plain math expressions in $...$
  s = autoWrapBareMath(s);

  return s;
}

