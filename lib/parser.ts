// lib/parser.ts
// Section 2 — Exact state-machine parser for the question-bank .docx format
// Pure function — no I/O, fully testable without a file system

import type { Question, ValidationError, ParseResult } from './types';
import { normaliseTopicSegment } from './text';

// ─── Image token helpers ──────────────────────────────────────────────────────

/** Regex to match [IMG:rIdXX] tokens emitted by ommlParser */
const RE_IMG_TOKEN = /\[IMG:(rId\d+)\]/g;

/**
 * Extract all [IMG:rIdXX] tokens from a string and return their resolved base64 data URLs.
 * If a token's rId is not in the imageMap (image failed to extract), it is silently skipped.
 */
function extractImages(text: string, imageMap: Record<string, string>): string[] {
  const found: string[] = [];
  let m: RegExpExecArray | null;
  RE_IMG_TOKEN.lastIndex = 0;
  while ((m = RE_IMG_TOKEN.exec(text)) !== null) {
    const dataUrl = imageMap[m[1]];
    if (dataUrl) found.push(dataUrl);
  }
  return found;
}

/**
 * Strip all [IMG:rIdXX] tokens from a string, returning clean text.
 */
function stripImageTokens(text: string): string {
  return text.replace(/\[IMG:rId\d+\]/g, '').replace(/\s{2,}/g, ' ').trim();
}


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
const RE_DIFFICULTY = /^(?:\*\*|\*|__|_)?Difficulty:\s*(?:\*\*|\*|__|_)?([A-Za-z\s]+)(?:\*\*|\*|__|_)?\s*$/i;

// Direction / passage block header — all syntax variants (case-insensitive):
//   D.1-5) | Direc.1-5) | Directions.1-5) | Dir.1-5) | Direction (Q1-5) | D 1-5)
// Captures: group 1 = startQ, group 2 = endQ
const RE_DIRECTION = /^(?:\*\*|\*|__|_)?[Dd](?:ir(?:ection)?s?|irec(?:t)?)?\s*\(?\s*\.?\s*(?:Q\.?\s*)?(\d+)\s*[-\u2013]\s*(\d+)\s*\)/i;

// ─── Topic normalisation (spec §2.4) ─────────────────────────────────────────

function parseSubjectPath(raw: string): string[] {
  return raw
    // Unescape \> first so the ">" separator is unambiguous
    .replace(/\\>/g, '>')
    .split('>')
    .map(normaliseTopicSegment)
    .filter((s) => s.length > 0);
}

function normalizeDifficulty(raw: string): 'Easy' | 'Medium' | 'Hard' | null {
  if (!raw) return null;
  const clean = raw.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (['easy', 'eazy', 'ez', 'eas'].includes(clean)) {
    return 'Easy';
  }
  if (['medium', 'meidum', 'medum', 'med', 'mod', 'moderate'].includes(clean)) {
    return 'Medium';
  }
  if (['hard', 'difficult', 'tough'].includes(clean)) {
    return 'Hard';
  }
  return null;
}

// ─── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse an array of non-empty paragraph strings (extracted from a .docx)
 * into validated Question objects.
 *
 * @param paragraphs  All non-empty strings from the document, in order.
 * @param imageMap    Map of rId → base64 data URL from ommlParser. Pass {} if no images.
 */
export function parseQuestions(
  paragraphs: string[],
  imageMap: Record<string, string> = {},
): ParseResult {
  const questions: Question[] = [];
  const errors: ValidationError[] = [];

  let i = 0;
  let expectedNumber = 1;

  // ── Pending direction/passage state ─────────────────────────────────────────
  // Populated when we encounter a "D.9-13)" header. Cleared after the last Q
  // in the declared range is emitted.
  let pendingDirection: {
    startQ: number;
    endQ: number;
    passageText: string;
  } | null = null;

  while (i < paragraphs.length) {
    const para = paragraphs[i];

    // Skip blank / whitespace-only lines (already filtered, but belt+suspenders)
    if (!para.trim()) { i++; continue; }

    // ── Look for a direction/passage block header ──────────────────────────────
    const dirMatch = para.match(RE_DIRECTION);
    if (dirMatch) {
      const startQ = parseInt(dirMatch[1], 10);
      const endQ   = parseInt(dirMatch[2], 10);

      // Passage text starts on the same line after the closing ')'
      // e.g. "D.9-13)In the given passage..." → the part after ')' is first line
      const afterParen = para.replace(RE_DIRECTION, '').trim();
      let passageText = afterParen;
      i++;

      // Collect all following non-Q, non-direction lines as passage body
      while (i < paragraphs.length) {
        const next = paragraphs[i];
        if (RE_QUESTION.test(next))  break; // first Q of the group starts
        if (RE_DIRECTION.test(next)) break; // another direction block (shouldn't happen)
        passageText += (passageText ? '\n' : '') + next.trim();
        i++;
      }

      pendingDirection = { startQ, endQ, passageText: passageText.trim() };
      continue; // go back to top of loop to parse the first Q
    }

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

    // ── Extract images from question text ─────────────────────────────────────
    const questionImages = extractImages(questionText, imageMap);
    questionText = stripImageTokens(questionText);

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
    const optionImages: Partial<{ A: string[]; B: string[]; C: string[]; D: string[] }> = {};
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

      // Extract any images from this option text
      optionImages[letter] = extractImages(optionText, imageMap);
      options[letter] = stripImageTokens(optionText);
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

    // ── Metadata variables for this question ─────────────────────────────────
    let explanation = '';
    let explanationImages: string[] = [];
    let subjectPath: string[] = [];
    let difficulty: 'Easy' | 'Medium' | 'Hard' | null = null;

    if (i < paragraphs.length && RE_EXPLANATION.test(paragraphs[i])) {
      // Exp: heading found — collect text
      const m = paragraphs[i].match(RE_EXPLANATION)!;
      explanation = m[1].trim();
      i++;

      // Collect multi-line explanation text until Subject / Difficulty / next Q
      while (i < paragraphs.length) {
        const next = paragraphs[i];
        if (RE_SUBJECT.test(next)) break;
        if (RE_QUESTION.test(next)) break;
        if (RE_DIFFICULTY.test(next)) break;
        explanation += '\n' + next.trim();
        i++;
      }

      // Extract images from explanation
      explanationImages = extractImages(explanation, imageMap);
      explanation = stripImageTokens(explanation);
      explanation = explanation.trim();

      // Check if Subject: was appended inline inside the explanation (e.g. without a newline)
      if (/(?:^|\s)Subject:/i.test(explanation)) {
        const subjectIndex = explanation.search(/(?:^|\s)Subject:/i);
        const afterSubject = explanation.substring(subjectIndex).replace(/^(?:\s*)Subject:\s*/i, '');
        explanation = explanation.substring(0, subjectIndex).trim();

        // Also check if Difficulty: was appended after Subject on that same line
        if (/(?:^|\s)Difficulty:/i.test(afterSubject)) {
          const diffIndex = afterSubject.search(/(?:^|\s)Difficulty:/i);
          const rawSubj = afterSubject.substring(0, diffIndex).trim();
          const rawDiff = afterSubject.substring(diffIndex).replace(/^(?:\s*)Difficulty:\s*/i, '').trim();
          subjectPath = parseSubjectPath(rawSubj);
          if (!difficulty) {
            difficulty = normalizeDifficulty(rawDiff);
          }
        } else {
          subjectPath = parseSubjectPath(afterSubject.trim());
        }
      }

      // Empty explanation stored as '' — PDF renders "No explanation available"
      if (!explanation) {
        errors.push({
          questionNumber: qNumber,
          message: `Q${qNumber}: Exp: field is empty — "No explanation available" will be shown in the PDF.`,
        });
      }
    } else {
      // No Exp: heading at all — soft warning, question still emitted without explanation
      errors.push({
        questionNumber: qNumber,
        message: `Q${qNumber}: Exp: line is missing — "No explanation available" will be shown in the PDF.`,
      });
    }


    // ── Parse Subject: (optional — missing/empty subject keeps question in PDF without topic grouping)
    if (i < paragraphs.length && RE_SUBJECT.test(paragraphs[i])) {
      const m = paragraphs[i].match(RE_SUBJECT)!;
      let rawSubj = m[1];
      // Check if Difficulty: is attached to the same Subject: line
      if (/(?:^|\s)Difficulty:/i.test(rawSubj)) {
        const diffIndex = rawSubj.search(/(?:^|\s)Difficulty:/i);
        const rawDiff = rawSubj.substring(diffIndex).replace(/^(?:\s*)Difficulty:\s*/i, '').trim();
        rawSubj = rawSubj.substring(0, diffIndex).trim();
        if (!difficulty) {
          difficulty = normalizeDifficulty(rawDiff);
        }
      }
      subjectPath = parseSubjectPath(rawSubj);
      i++;
      if (subjectPath.length === 0) {
        // Subject line present but empty/unparseable — soft warning, question still emitted
        errors.push({
          questionNumber: qNumber,
          message: `Q${qNumber}: Subject: field is empty — question will appear without a topic heading or badge.`,
        });
      }
    } else if (subjectPath.length === 0) {
      // No Subject: line at all and not extracted inline — soft warning
      errors.push({
        questionNumber: qNumber,
        message: `Q${qNumber}: Subject: line is missing — question will appear without a topic heading or badge.`,
      });
    }

    // ── Parse Difficulty: (optional — missing difficulty keeps question in PDF without a badge)
    if (i < paragraphs.length && RE_DIFFICULTY.test(paragraphs[i])) {
      const m = paragraphs[i].match(RE_DIFFICULTY)!;
      const parsedDiff = normalizeDifficulty(m[1]);
      if (parsedDiff) {
        difficulty = parsedDiff;
      }
      i++;
    }

    if (!difficulty) {
      // No valid Difficulty: line — soft warning, question still emitted without difficulty badge
      errors.push({
        questionNumber: qNumber,
        message: `Q${qNumber}: Difficulty: line is missing or invalid — question will appear without a difficulty badge.`,
      });
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
    const emittedQ: Question = {
      number: qNumber,
      text: questionText,
      options: options as { A: string; B: string; C: string; D: string },
      answer: answer!,
      explanation,
      subjectPath,
      difficulty: difficulty!,
      // Image fields — only set when present to keep JSON lean
      ...(questionImages.length > 0 && { images: questionImages }),
      ...(Object.values(optionImages).some(imgs => imgs && imgs.length > 0) && {
        optionImages: {
          ...(optionImages.A?.length && { A: optionImages.A[0] }),
          ...(optionImages.B?.length && { B: optionImages.B[0] }),
          ...(optionImages.C?.length && { C: optionImages.C[0] }),
          ...(optionImages.D?.length && { D: optionImages.D[0] }),
        },
      }),
      ...(explanationImages.length > 0 && { explanationImages }),
    };

    // Attach passage/direction group fields if this Q falls in the active range
    if (pendingDirection && qNumber >= pendingDirection.startQ && qNumber <= pendingDirection.endQ) {
      emittedQ.passageText  = pendingDirection.passageText;
      emittedQ.groupRange   = [pendingDirection.startQ, pendingDirection.endQ];
      emittedQ.isFirstInGroup = (qNumber === pendingDirection.startQ);

      // Clear once the last Q in the range is processed
      if (qNumber === pendingDirection.endQ) {
        pendingDirection = null;
      }
    }

    questions.push(emittedQ);
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
