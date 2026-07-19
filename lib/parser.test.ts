// lib/parser.test.ts
// Jest unit tests for the question-bank parser
// Run with: npm test

import { parseQuestions, extractParagraphs } from './parser';
import type { Question } from './types';

// ─── Test fixture: valid question from spec §2.1 ──────────────────────────────

const VALID_BLOCK_RAW = `Q3.Fill in the blank: In Carnatic music, a laghu with five beats is known as _____ jaati.
A.Tishra
B.Chaturasra
C.Khanda
D.Mishra
Ans:C
Exp:In Carnatic music, a laghu with five beats is known as the Khanda jaati. The jaati (classification) determines the variable number of beats within the laghu component of a tala.
Subject:GS > History > Art and Culture > Classical Music
Difficulty:Hard`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeParas(raw: string): string[] {
  return extractParagraphs(raw);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('parseQuestions', () => {

  // ── TEST 1: Valid single block from spec ────────────────────────────────────
  it('parses a valid question block exactly (spec §2.1 sample)', () => {
    // Prepend Q1 and Q2 so that Q3 is encountered in-sequence
    const q1 = `Q1.What is 1+1?
A.1
B.2
C.3
D.4
Ans:B
Exp:Basic arithmetic.
Subject:GS > Math
Difficulty:Easy`;

    const q2 = `Q2.Capital of France?
A.Berlin
B.Madrid
C.Paris
D.Rome
Ans:C
Exp:Paris is the capital of France.
Subject:GS > Geography > Europe
Difficulty:Easy`;

    const combined = [q1, q2, VALID_BLOCK_RAW].join('\n');
    const paras = makeParas(combined);
    const { questions, errors } = parseQuestions(paras);

    expect(errors).toHaveLength(0);
    expect(questions).toHaveLength(3);

    const q3 = questions[2];
    expect(q3.number).toBe(3);
    expect(q3.text).toBe('Fill in the blank: In Carnatic music, a laghu with five beats is known as _____ jaati.');
    expect(q3.options.A).toBe('Tishra');
    expect(q3.options.B).toBe('Chaturasra');
    expect(q3.options.C).toBe('Khanda');
    expect(q3.options.D).toBe('Mishra');
    expect(q3.answer).toBe('C');
    expect(q3.explanation).toContain('Khanda jaati');
    expect(q3.subjectPath).toEqual(['Gs', 'History', 'Art And Culture', 'Classical Music']);
    expect(q3.difficulty).toBe('Hard');
  });

  // ── TEST 2: Missing Ans line ────────────────────────────────────────────────
  it('flags a question with a missing Ans: line as invalid with a specific reason', () => {
    const block = `Q1.Which planet is closest to the sun?
A.Venus
B.Mercury
C.Mars
D.Earth
Exp:Mercury is the closest planet to the Sun.
Subject:GS > Science > Astronomy
Difficulty:Medium`;

    const { questions, errors } = parseQuestions(makeParas(block));

    expect(questions).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
    const err = errors.find(e => e.questionNumber === 1);
    expect(err).toBeDefined();
    expect(err!.message).toContain('Ans:');
  });

  // ── TEST 3: Missing Exp line ────────────────────────────────────────────────
  it('flags a question with a missing Exp: line as invalid', () => {
    const block = `Q1.Which gas do plants absorb?
A.Oxygen
B.Nitrogen
C.Carbon Dioxide
D.Hydrogen
Ans:C
Subject:GS > Science > Biology
Difficulty:Easy`;

    const { questions, errors } = parseQuestions(makeParas(block));

    expect(questions).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
    const err = errors.find(e => e.questionNumber === 1);
    expect(err).toBeDefined();
    expect(err!.message).toMatch(/Exp:|explanation/i);
  });

  // ── TEST 4: Empty explanation ───────────────────────────────────────────────
  it('flags a question with an empty Exp: field as invalid', () => {
    const block = `Q1.Test question.
A.Option A
B.Option B
C.Option C
D.Option D
Ans:A
Exp:
Subject:GS > Test
Difficulty:Easy`;

    const { questions, errors } = parseQuestions(makeParas(block));
    // Empty exp after trim → should be flagged
    expect(errors.length).toBeGreaterThan(0);
    const err = errors.find(e => e.questionNumber === 1);
    expect(err).toBeDefined();
    expect(err!.message).toMatch(/empty/i);
  });

  // ── TEST 5: Unexpected 5th option ──────────────────────────────────────────
  it('flags a question with an unexpected E option as invalid', () => {
    const block = `Q1.Test question.
A.Option A
B.Option B
C.Option C
D.Option D
E.Option E
Ans:A
Exp:Some explanation.
Subject:GS > Test
Difficulty:Easy`;

    const { questions, errors } = parseQuestions(makeParas(block));
    expect(errors.length).toBeGreaterThan(0);
    const err = errors.find(e => e.questionNumber === 1);
    expect(err!.message).toMatch(/5th option|option E/i);
  });

  // ── TEST 6: Out-of-sequence Q number ───────────────────────────────────────
  it('flags a question that breaks the sequential numbering', () => {
    const q1 = `Q1.Test Q1.
A.A
B.B
C.C
D.D
Ans:A
Exp:Exp one.
Subject:GS > Test
Difficulty:Easy`;

    const q3 = `Q3.Skipped Q2, jumped to Q3.
A.A
B.B
C.C
D.D
Ans:B
Exp:Exp three.
Subject:GS > Test
Difficulty:Medium`;

    const { errors } = parseQuestions(makeParas([q1, q3].join('\n')));
    expect(errors.length).toBeGreaterThan(0);
    const seqErr = errors.find(e => e.message.includes('sequence'));
    expect(seqErr).toBeDefined();
    expect(seqErr!.message).toMatch(/Q3|Q2/);
  });

  // ── TEST 7: Special characters in question text ────────────────────────────
  it('parses questions containing special characters without errors', () => {
    const block = `Q1.Which operator means "less than or equal" in HTML contexts: & < > "?
A.<= and &lt;
B.>= and &gt;
C.Only &amp;
D.None of the above
Ans:A
Exp:In HTML, & becomes &amp; and < becomes &lt;. These characters must be escaped.
Subject:GS > Technology > Web
Difficulty:Hard`;

    const { questions, errors } = parseQuestions(makeParas(block));
    expect(errors).toHaveLength(0);
    expect(questions).toHaveLength(1);
    expect(questions[0].text).toContain('&');
    expect(questions[0].text).toContain('<');
  });

  // ── TEST 8: Multi-paragraph question text ──────────────────────────────────
  it('collects multi-paragraph question stems into a single text field', () => {
    const block = `Q1.Consider the following statements:
I. Statement one about Indian history.
II. Statement two about Indian geography.
III. Statement three about Indian culture.
Which of the above are correct?
A.I and II only
B.II and III only
C.I and III only
D.All of the above
Ans:D
Exp:All three statements are factually correct.
Subject:GS > General Studies
Difficulty:Medium`;

    const { questions, errors } = parseQuestions(makeParas(block));
    expect(errors).toHaveLength(0);
    expect(questions).toHaveLength(1);
    expect(questions[0].text).toContain('Statement one');
    expect(questions[0].text).toContain('Statement two');
    expect(questions[0].text).toContain('Which of the above');
  });

  // ── TEST 9: Empty document ─────────────────────────────────────────────────
  it('returns a document-level error for an empty file', () => {
    const { questions, errors } = parseQuestions([]);
    expect(questions).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].questionNumber).toBeNull();
    expect(errors[0].message).toMatch(/no questions detected/i);
  });

  // ── TEST 10: Invalid difficulty value ──────────────────────────────────────
  it('flags an invalid Difficulty value', () => {
    const block = `Q1.Test difficulty.
A.Option A
B.Option B
C.Option C
D.Option D
Ans:A
Exp:Some explanation here.
Subject:GS > Test
Difficulty:VeryHard`;

    const { questions, errors } = parseQuestions(makeParas(block));
    expect(errors.length).toBeGreaterThan(0);
    const err = errors.find(e => e.questionNumber === 1);
    expect(err!.message).toMatch(/Difficulty/i);
  });

  // ── TEST 11: Subject path normalization ────────────────────────────────────
  it('normalizes subject path segments (trim + consistent casing)', () => {
    const block = `Q1.Test normalization.
A.A
B.B
C.C
D.D
Ans:A
Exp:Explanation here.
Subject:GS >  art and culture  > Classical Music
Difficulty:Easy`;

    const { questions, errors } = parseQuestions(makeParas(block));
    expect(errors).toHaveLength(0);
    expect(questions[0].subjectPath[1]).toBe('Art And Culture');
    expect(questions[0].subjectPath[2]).toBe('Classical Music');
  });

  // ── TEST 12: Valid answer letter case-insensitive ──────────────────────────
  it('accepts lowercase answer letter in Ans: field', () => {
    const block = `Q1.Case test.
A.Option A
B.Option B
C.Option C
D.Option D
Ans:c
Exp:Answer is C.
Subject:GS > Test
Difficulty:Easy`;

    const { questions, errors } = parseQuestions(makeParas(block));
    expect(errors).toHaveLength(0);
    expect(questions[0].answer).toBe('C');
  });

});
