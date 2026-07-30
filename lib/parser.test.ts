// lib/parser.test.ts
// Jest unit tests for the question-bank parser
// Run with: npm test

import { parseQuestions, extractParagraphs } from './parser';
import { normalizeMathEquations } from './text';
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

  // ── TEST 3: Missing Exp line — question still emitted with soft warning ────────
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

    // Question is KEPT (not rejected) — Exp: is now fully optional
    expect(questions).toHaveLength(1);
    expect(questions[0].explanation).toBe('');
    expect(questions[0].difficulty).toBe('Easy');
    // Soft warning is still emitted
    expect(errors.length).toBeGreaterThan(0);
    const err = errors.find(e => e.questionNumber === 1);
    expect(err).toBeDefined();
    expect(err!.message).toMatch(/Exp:|explanation/i);
  });

  // ── TEST 4: Empty explanation — question still emitted ───────────────────────
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
    // Empty exp — question is KEPT (not rejected) but a soft warning is emitted
    expect(questions).toHaveLength(1);
    expect(questions[0].explanation).toBe('');
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

  // ── TEST 10: Invalid difficulty value — question still emitted with null difficulty ─────
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
    // Invalid difficulty — question is KEPT (not rejected) but a soft warning is emitted
    expect(questions).toHaveLength(1);
    expect(questions[0].difficulty).toBeNull();
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

  // ── TEST 13: Direction block — passage attached to all Qs in range ──────────
  it('attaches passage text to all questions in a D.x-y) range', () => {
    const block = `D.1-2)Read the passage and answer the questions.
The quick brown fox jumps over the lazy dog.
Q1.What does the fox jump over?
A.A cat
B.A fence
C.The lazy dog
D.A river
Ans:C
Exp:The passage states the fox jumps over the lazy dog.
Subject:English > Reading
Difficulty:Easy
Q2.What adjective describes the fox?
A.Lazy
B.Quick
C.Brown
D.Both B and C
Ans:D
Exp:The fox is described as quick and brown.
Subject:English > Reading
Difficulty:Easy`;

    const { questions, errors } = parseQuestions(makeParas(block));
    expect(errors).toHaveLength(0);
    expect(questions).toHaveLength(2);

    // Passage attached to both Qs
    expect(questions[0].passageText).toContain('quick brown fox');
    expect(questions[1].passageText).toContain('quick brown fox');

    // isFirstInGroup only on Q1
    expect(questions[0].isFirstInGroup).toBe(true);
    expect(questions[1].isFirstInGroup).toBeFalsy();

    // groupRange correct
    expect(questions[0].groupRange).toEqual([1, 2]);
    expect(questions[1].groupRange).toEqual([1, 2]);
  });

  // ── TEST 14: Multi-paragraph passage ───────────────────────────────────────
  it('collects multi-paragraph passage text into a single passageText field', () => {
    const block = `D.1-2)In the given passage, some words have been deleted.
Postcolonial infrastructures often inhabit a schizophonic condition.
Flyovers half-finished, railway stations calcified mid-renovation.
Q1.What does the passage primarily discuss?
A.Engineering problems
B.Postcolonial infrastructure
C.Railway economics
D.Architecture
Ans:B
Exp:The passage is about postcolonial infrastructures.
Subject:English > Cloze Test
Difficulty:Hard
Q2.What does the term schizophonic condition imply?
A.A mental disorder
B.Simultaneous obsolescence and futurity
C.A type of engineering failure
D.None of the above
Ans:B
Exp:Schizophonic means a simultaneity of two states.
Subject:English > Cloze Test
Difficulty:Hard`;

    const { questions, errors } = parseQuestions(makeParas(block));
    expect(errors).toHaveLength(0);
    expect(questions).toHaveLength(2);

    // All passage paragraphs collected
    const passage = questions[0].passageText ?? '';
    expect(passage).toContain('In the given passage');
    expect(passage).toContain('Postcolonial infrastructures');
    expect(passage).toContain('Flyovers half-finished');
  });

  // ── TEST 15: Mixed document — standalone Qs before and after direction block
  it('correctly handles a mixed document with standalone and passage-linked Qs', () => {
    const standalone1 = `Q1.What is the capital of India?
A.Mumbai
B.Delhi
C.Chennai
D.Kolkata
Ans:B
Exp:New Delhi is the capital of India.
Subject:GS > Geography
Difficulty:Easy`;

    const direction = `D.2-3)Read this passage carefully.
This is the passage text.
Q2.What should be read carefully?
A.The question
B.The passage
C.The options
D.The explanation
Ans:B
Exp:The direction says to read the passage.
Subject:English > Reading
Difficulty:Medium
Q3.How many paragraphs does this passage have?
A.One
B.Two
C.Three
D.Four
Ans:A
Exp:There is one paragraph in the passage.
Subject:English > Reading
Difficulty:Medium`;

    const standalone2 = `Q4.What is 2 + 2?
A.3
B.4
C.5
D.6
Ans:B
Exp:Basic arithmetic.
Subject:GS > Maths
Difficulty:Easy`;

    const { questions, errors } = parseQuestions(makeParas([standalone1, direction, standalone2].join('\n')));
    expect(errors).toHaveLength(0);
    expect(questions).toHaveLength(4);

    // Q1 and Q4 are standalone — no passage fields
    expect(questions[0].passageText).toBeUndefined();
    expect(questions[3].passageText).toBeUndefined();

    // Q2 and Q3 have passage fields
    expect(questions[1].passageText).toContain('This is the passage text');
    expect(questions[2].passageText).toContain('This is the passage text');
    expect(questions[1].isFirstInGroup).toBe(true);
    expect(questions[2].isFirstInGroup).toBeFalsy();
  });

  // ── TEST 16: All direction syntax variants ─────────────────────────────────
  it('parses direction headers in all supported syntax variants', () => {
    const makeBlock = (header: string) => `${header}Passage text here.
Q1.Sample question?
A.Option A
B.Option B
C.Option C
D.Option D
Ans:A
Exp:Explanation.
Subject:GS > Test
Difficulty:Easy`;

    const variants = [
      'D.1-1)',         // D dot
      'Direc.1-1)',     // Direc dot
      'Directions.1-1)',// Directions dot
      'Dir.1-1)',       // Dir dot
      'Direction.1-1)', // Direction dot
      'd.1-1)',         // lowercase d dot
      'D 1-1)',         // D space (no dot)
      'DIRECTION.1-1)', // all caps
      'Direction (Q1-1)', // with Q prefix
    ];

    for (const variant of variants) {
      const { questions, errors } = parseQuestions(makeParas(makeBlock(variant)));
      expect(errors).toHaveLength(0);
      expect(questions).toHaveLength(1);
      expect(questions[0].passageText).toContain('Passage text here');
    }
  });

  // ── TEST 17: Empty Exp: heading — question parsed with empty explanation ─────
  it('parses a question with Exp: heading present but no text (empty explanation)', () => {
    const block = `Q1.What is the largest planet?
A.Earth
B.Saturn
C.Jupiter
D.Neptune
Ans:C
Exp:
Subject:GS > Science > Astronomy
Difficulty:Easy`;

    const { questions, errors } = parseQuestions(makeParas(block));
    // Question MUST be emitted even though explanation is empty
    expect(questions).toHaveLength(1);
    expect(questions[0].answer).toBe('C');
    expect(questions[0].explanation).toBe('');  // stored as empty string
    // A soft warning is pushed but the question is not rejected
    const warn = errors.find(e => e.questionNumber === 1);
    expect(warn).toBeDefined();
    expect(warn!.message).toMatch(/empty/i);
  });

  // ── TEST 18: Missing Subject — question parsed with empty subjectPath ────────
  it('parses a question with no Subject: line (empty subjectPath)', () => {
    const block = `Q1.What is photosynthesis?
A.A chemical reaction
B.A physical process
C.A biological process converting light to energy
D.None of the above
Ans:C
Exp:Photosynthesis is the biological process by which plants convert light energy into chemical energy.
Difficulty:Medium`;

    const { questions, errors } = parseQuestions(makeParas(block));
    // Question MUST be emitted even though Subject is missing
    expect(questions).toHaveLength(1);
    expect(questions[0].subjectPath).toEqual([]);
    expect(questions[0].difficulty).toBe('Medium');
    // A soft warning is pushed but the question is not rejected
    const warn = errors.find(e => e.questionNumber === 1);
    expect(warn).toBeDefined();
    expect(warn!.message).toMatch(/Subject/i);
  });

  // ── TEST 19: Missing Difficulty — question parsed with null difficulty ────────
  it('parses a question with no Difficulty: line (null difficulty)', () => {
    const block = `Q1.Name the first Prime Minister of India.
A.Rajendra Prasad
B.Jawaharlal Nehru
C.Lal Bahadur Shastri
D.Indira Gandhi
Ans:B
Exp:Jawaharlal Nehru was the first Prime Minister of India.
Subject:GS > History > Modern India`;

    const { questions, errors } = parseQuestions(makeParas(block));
    // Question MUST be emitted even though Difficulty is missing
    expect(questions).toHaveLength(1);
    expect(questions[0].difficulty).toBeNull();
    expect(questions[0].subjectPath).toEqual(['Gs', 'History', 'Modern India']);
    // A soft warning is pushed but the question is not rejected
    const warn = errors.find(e => e.questionNumber === 1);
    expect(warn).toBeDefined();
    expect(warn!.message).toMatch(/Difficulty/i);
  });

  // ── TEST 20: All three missing (Exp empty + no Subject + no Difficulty) ───────
  it('parses a question with empty Exp, missing Subject, and missing Difficulty', () => {
    const block = `Q1.Who wrote the Indian national anthem?
A.Rabindranath Tagore
B.Bankim Chandra Chatterjee
C.Subramanya Bharati
D.Sarojini Naidu
Ans:A
Exp:`;

    const { questions, errors } = parseQuestions(makeParas(block));
    // Question MUST be emitted despite all three missing
    expect(questions).toHaveLength(1);
    expect(questions[0].answer).toBe('A');
    expect(questions[0].explanation).toBe('');
    expect(questions[0].subjectPath).toEqual([]);
    expect(questions[0].difficulty).toBeNull();
    // Three soft warnings pushed (empty exp, missing subject, missing difficulty)
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  // ── TEST 21: Real-world SSC GD 2026 format — Exp empty, Subject filled, Difficulty empty ──
  it('parses real SSC GD 2026 document format (empty Exp + empty Difficulty, Subject present)', () => {
    // This mirrors the exact format the user provided:
    //   Exp:          ← heading present, no text
    //   Subject:...   ← filled
    //   Difficulty:   ← heading present, no text (not Easy/Medium/Hard)
    const block = `Q1.Carbon is incorporated into living organisms through ______. (SSC GD 2026)
A.Respiration
B.Photosynthesis
C.Fermentation
D.Decomposition
Ans:B
Exp:
Subject:GS > Science > Basic Science > Biology
Difficulty:
Q2.Kalbelia dance is inspired by the movements of which animal? (SSC GD 2026)
A.Peacock
B.Snake
C.Horse
D.Elephant
Ans:B
Exp:
Subject:GS > History > Art and Culture > Folk Dance
Difficulty:
Q3.Which of the following shots are played in a tennis match? (SSC GD 2026)
I. Forehand
II. Backhand
A.Only I
B.Only II
C.Both I and II
D.Neither I nor II
Ans:C
Exp:
Subject:GS > Static GK > Sports Rules
Difficulty:`;

    const { questions, errors } = parseQuestions(makeParas(block));

    // All 3 questions must be parsed — none rejected
    expect(questions).toHaveLength(3);

    // Q1 checks
    expect(questions[0].answer).toBe('B');
    expect(questions[0].explanation).toBe('');           // empty Exp stored as ''
    expect(questions[0].subjectPath).toEqual(['Gs', 'Science', 'Basic Science', 'Biology']);
    expect(questions[0].difficulty).toBeNull();          // empty Difficulty → null

    // Q2 checks
    expect(questions[1].answer).toBe('B');
    expect(questions[1].subjectPath[0]).toBe('Gs');

    // Q3 — roman numerals (I. II.) in stem must NOT be parsed as options
    expect(questions[2].text).toContain('Forehand');     // I. Forehand in stem
    expect(questions[2].text).toContain('Backhand');     // II. Backhand in stem
    expect(questions[2].answer).toBe('C');
    expect(questions[2].options.A).toBe('Only I');
    expect(questions[2].options.C).toBe('Both I and II');

    // Soft warnings exist (empty Exp × 3, empty Difficulty × 3) but no fatal errors
    // Every question emits 2 warnings (empty exp + empty/missing difficulty)
    expect(errors.length).toBeGreaterThanOrEqual(6);
    // No question should be missing from the output
    expect(questions.map(q => q.number)).toEqual([1, 2, 3]);
  });

});

describe('normalizeMathEquations', () => {
  it('auto-wraps bare LaTeX commands like \\sqrt{3} : \\sqrt{2}', () => {
    const raw = 'If the ratio of corresponding sides of two similar triangles is \\sqrt{3} : \\sqrt{2} then what is the ratio...';
    const norm = normalizeMathEquations(raw);
    expect(norm).toContain('$\\sqrt{3}$ : $\\sqrt{2}$');
  });

  it('fixes corrupted \\sqrt{3}2} from docx conversion', () => {
    const raw = 'If the ratio of corresponding sides of two similar triangles is \\sqrt{3}2} then...';
    const norm = normalizeMathEquations(raw);
    expect(norm).toContain('$\\sqrt{3}$ : $\\sqrt{2}$');
  });

  it('converts Unicode exponents x² and hyp² into LaTeX x^2 and hyp^2', () => {
    const raw = 'hyp² = (24)² + (7)² = √625';
    const norm = normalizeMathEquations(raw);
    expect(norm).toContain('hyp^2');
    expect(norm).toContain('\\sqrt{625}');
    expect(norm).toContain('$');
  });

  it('preserves existing $...$ math blocks without double wrapping', () => {
    const raw = 'The value of $x^2 + y^2$ is 25.';
    const norm = normalizeMathEquations(raw);
    expect(norm).toBe('The value of $x^2 + y^2$ is 25.');
  });
});

