// lib/parser.ts
// Section 2 — Exact state-machine parser for the question-bank .docx format
// Pure function — no I/O, fully testable without a file system

import type { Question, ValidationError, ParseResult } from './types';

// ─── Regex patterns (from spec §2.2) ─────────────────────────────────────────

const RE_QUESTION  = /^(?:\*\*|\*|__|_)?Q(\d+)\.(?:\*\*|\*|__|_)?(.*)$/;
const RE_OPT_A     = /^(?:\*\*|\*|__|_)?A\.(?:\*\*|\*|__|_)?(.*)$/;
const RE_OPT_B     = /^(?:\*\*|\*|__|_)?B\.(?:\*\*|\*|__|_)?(.*)$/;
const RE_OPT_C     = /^(?:\*\*|\*|__|_)?C\.(?:\*\*|\*|__|_)?(.*)$/;
const RE_OPT_D     = /^(?:\*\*|\*|__|_)?D\.(?:\*\*|\*|__|_)?(.*)$/;
const RE_OPT_E     = /^(?:\*\*|\*|__|_)?E\./;           // detect unexpected 5th option
const RE_ANY_OPT   = /^(?:\*\*|\*|__|_)?[A-E]\./;       // generic option-like line
// Accept: Ans:A  |  Ans: A  |  Answer: A  |  Ans.A  |  Answer.A  (case-insensitive)
const RE_ANSWER    = /^(?:\*\*|\*|__|_)?(?:Ans(?:wer)?)[:.\s]\s*(?:\*\*|\*|__|_)?([A-D])(?:\*\*|\*|__|_)?\s*$/i;
const RE_EXPLANATION = /^(?:\*\*|\*|__|_)?Exp:(?:\*\*|\*|__|_)?(.*)$/i;
const RE_SUBJECT   = /^(?:\*\*|\*|__|_)?Subject:(?:\*\*|\*|__|_)?(.*)$/i;
const RE_DIFFICULTY = /^(?:\*\*|\*|__|_)?Difficulty:\s*(?:\*\*|\*|__|_)?(Easy|Medium|Hard)(?:\*\*|\*|__|_)?\s*$/i;

// ─── Topic normalisation (spec §2.4) ─────────────────────────────────────────

function normalizeSegment(s: string): string {
  // Trim whitespace, then title-case
  return s.trim().replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function parseSubjectPath(raw: string): string[] {
  return raw
    .split('>')
    .map(normalizeSegment)
    .filter((s) => s.length > 0);
}

function normalizeDifficulty(raw: string): 'Easy' | 'Medium' | 'Hard' {
  const map: Record<string, 'Easy' | 'Medium' | 'Hard'> = {
    easy: 'Easy', medium: 'Medium', hard: 'Hard',
  };
  return map[raw.toLowerCase()];
}

// ─── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse an array of non-empty paragraph strings (extracted from a .docx)
 * into validated Question objects.
 *
 * @param paragraphs  All non-empty strings from the document, in order.
 */
export function parseQuestions(paragraphs: string[]): ParseResult {
  const questions: Question[] = [];
  const errors: ValidationError[] = [];

  let i = 0;
  let expectedNumber = 1;

  while (i < paragraphs.length) {
    const para = paragraphs[i];

    // Skip blank / whitespace-only lines (already filtered, but belt+suspenders)
    if (!para.trim()) { i++; continue; }

    // ── Look for a question start ────────────────────────────────────────────
    const qMatch = para.match(RE_QUESTION);
    if (!qMatch) {
      // Unexpected non-question content at top level — skip gracefully
      i++;
      continue;
    }

    const qNumber = parseInt(qMatch[1], 10);
    let questionText = qMatch[2].trim();
    i++;

    // ── Collect multi-paragraph question text until first option ─────────────
    while (i < paragraphs.length) {
      const next = paragraphs[i];
      if (RE_OPT_A.test(next)) break;    // Found option A — stop
      if (RE_ANY_OPT.test(next)) break;  // Found some other option — stop
      if (RE_QUESTION.test(next)) break; // Next question started — malformed
      questionText += '\n' + next.trim();
      i++;
    }

    // ── Validate Q number sequence ───────────────────────────────────────────
    if (qNumber !== expectedNumber) {
      errors.push({
        questionNumber: qNumber,
        message: `Question number out of sequence: expected Q${expectedNumber}, found Q${qNumber}`,
      });
      // Still process this block so we collect further errors
    }
    expectedNumber = qNumber + 1; // advance regardless, to not cascade errors

    // ── Parse options A, B, C, D ─────────────────────────────────────────────
    type OptionKey = 'A' | 'B' | 'C' | 'D';
    const optionPatterns: [OptionKey, RegExp][] = [
      ['A', RE_OPT_A], ['B', RE_OPT_B], ['C', RE_OPT_C], ['D', RE_OPT_D],
    ];
    const options: Partial<{ A: string; B: string; C: string; D: string }> = {};
    let blockInvalid = false;
    let blockInvalidReason = '';

    for (const [letter, re] of optionPatterns) {
      if (i >= paragraphs.length) {
        blockInvalid = true;
        blockInvalidReason = `Question ${qNumber} is missing option ${letter} (unexpected end of document)`;
        break;
      }
      const line = paragraphs[i];

      // Check for unexpected 5th option
      if (RE_OPT_E.test(line)) {
        blockInvalid = true;
        blockInvalidReason = `Question ${qNumber} has an unexpected 5th option (E) — only A–D are allowed`;
        i++;
        break;
      }

      if (!re.test(line)) {
        blockInvalid = true;
        const got = line.substring(0, 30).replace(/\n/g, ' ');
        blockInvalidReason = `Question ${qNumber} — expected option ${letter}, got: "${got}..."`;
        break;
      }

      const m = line.match(re)!;
      let optionText = m[1].trim();
      i++;

      // Collect multi-line option text
      while (i < paragraphs.length) {
        const next = paragraphs[i];
        if (RE_ANY_OPT.test(next)) break;
        if (RE_ANSWER.test(next)) break;
        if (RE_QUESTION.test(next)) break;
        optionText += '\n' + next.trim();
        i++;
      }

      options[letter] = optionText;
    }

    if (blockInvalid) {
      errors.push({ questionNumber: qNumber, message: blockInvalidReason });
      // Skip ahead to next Q<n>. line
      while (i < paragraphs.length && !RE_QUESTION.test(paragraphs[i])) i++;
      continue;
    }

    // ── Parse Ans: ────────────────────────────────────────────────────────────
    let answer: 'A' | 'B' | 'C' | 'D' | null = null;
    if (i >= paragraphs.length || !RE_ANSWER.test(paragraphs[i])) {
      const got = i < paragraphs.length ? paragraphs[i].substring(0, 40) : '(end of document)';
      errors.push({
        questionNumber: qNumber,
        message: `Question ${qNumber} is missing a valid "Ans:" line (A/B/C/D). Got: "${got}"`,
      });
      while (i < paragraphs.length && !RE_QUESTION.test(paragraphs[i])) i++;
      continue;
    } else {
      const m = paragraphs[i].match(RE_ANSWER)!;
      answer = m[1].toUpperCase() as 'A' | 'B' | 'C' | 'D';
      i++;
    }

    // ── Parse Exp: ────────────────────────────────────────────────────────────
    let explanation = '';
    if (i >= paragraphs.length || !RE_EXPLANATION.test(paragraphs[i])) {
      const got = i < paragraphs.length ? paragraphs[i].substring(0, 40) : '(end of document)';
      errors.push({
        questionNumber: qNumber,
        message: `Question ${qNumber} is missing "Exp:" line. Got: "${got}"`,
      });
      while (i < paragraphs.length && !RE_QUESTION.test(paragraphs[i])) i++;
      continue;
    } else {
      const m = paragraphs[i].match(RE_EXPLANATION)!;
      explanation = m[1].trim();
      i++;

      // Collect multi-line explanation text until Subject
      while (i < paragraphs.length) {
        const next = paragraphs[i];
        if (RE_SUBJECT.test(next)) break;
        if (RE_QUESTION.test(next)) break;
        explanation += '\n' + next.trim();
        i++;
      }

      explanation = explanation.trim();

      if (!explanation) {
        // Allow empty explanation — use a fallback so the question still appears in PDF
        explanation = 'Refer to the standard solution for this question.';
        errors.push({
          questionNumber: qNumber,
          message: `Q${qNumber}: Exp: field is empty — a placeholder explanation was used. Add content after "Exp:" in your document.`,
        });
      }
    }

    // ── Parse Subject: ────────────────────────────────────────────────────────
    let subjectPath: string[] = [];
    if (i >= paragraphs.length || !RE_SUBJECT.test(paragraphs[i])) {
      const got = i < paragraphs.length ? paragraphs[i].substring(0, 40) : '(end of document)';
      errors.push({
        questionNumber: qNumber,
        message: `Question ${qNumber} is missing "Subject:" line. Got: "${got}"`,
      });
      while (i < paragraphs.length && !RE_QUESTION.test(paragraphs[i])) i++;
      continue;
    } else {
      const m = paragraphs[i].match(RE_SUBJECT)!;
      subjectPath = parseSubjectPath(m[1]);
      i++;
      if (subjectPath.length === 0) {
        errors.push({
          questionNumber: qNumber,
          message: `Question ${qNumber} has an empty or unparseable Subject: value`,
        });
        while (i < paragraphs.length && !RE_QUESTION.test(paragraphs[i])) i++;
        continue;
      }
    }

    // ── Parse Difficulty: ─────────────────────────────────────────────────────
    let difficulty: 'Easy' | 'Medium' | 'Hard' | null = null;
    if (i >= paragraphs.length || !RE_DIFFICULTY.test(paragraphs[i])) {
      const got = i < paragraphs.length ? paragraphs[i].substring(0, 40) : '(end of document)';
      errors.push({
        questionNumber: qNumber,
        message: `Question ${qNumber} is missing a valid "Difficulty:" line (Easy/Medium/Hard). Got: "${got}"`,
      });
      while (i < paragraphs.length && !RE_QUESTION.test(paragraphs[i])) i++;
      continue;
    } else {
      const m = paragraphs[i].match(RE_DIFFICULTY)!;
      difficulty = normalizeDifficulty(m[1]);
      i++;
    }

    // ── Check for unexpected content after this block ─────────────────────────
    if (
      i < paragraphs.length &&
      !RE_QUESTION.test(paragraphs[i])
    ) {
      // There might be multi-line explanation text accidentally on separate paras
      // Collect them into explanation (graceful extension)
      const unexpectedLine = paragraphs[i];
      // If it looks like the start of another structural field, flag it
      if (
        RE_OPT_A.test(unexpectedLine) ||
        RE_ANSWER.test(unexpectedLine) ||
        RE_SUBJECT.test(unexpectedLine) ||
        RE_DIFFICULTY.test(unexpectedLine)
      ) {
        errors.push({
          questionNumber: qNumber,
          message: `Unexpected content after Question ${qNumber}: "${unexpectedLine.substring(0, 40)}"`,
        });
        while (i < paragraphs.length && !RE_QUESTION.test(paragraphs[i])) i++;
        continue;
      }
      // Otherwise silently skip (blank lines between questions)
    }

    // ── All fields valid — emit question ──────────────────────────────────────
    questions.push({
      number: qNumber,
      text: questionText,
      options: options as { A: string; B: string; C: string; D: string },
      answer: answer!,
      explanation,
      subjectPath,
      difficulty: difficulty!,
    });
  }

  // ── Document-level checks ──────────────────────────────────────────────────
  if (questions.length === 0 && errors.length === 0) {
    errors.push({
      questionNumber: null,
      message:
        'No questions detected in this document — please check the format. ' +
        'Questions must start with Q1., Q2., etc. followed by A., B., C., D. options.',
    });
  }

  return { questions, errors };
}

// ─── Helper: extract paragraphs from mammoth raw text output ─────────────────

/**
 * Given the raw text output from mammoth (preserves paragraph breaks as \n\n),
 * split into individual non-empty paragraph strings.
 */
export function extractParagraphs(rawText: string): string[] {
  return rawText
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
