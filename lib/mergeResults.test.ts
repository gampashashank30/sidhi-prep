// lib/mergeResults.test.ts
// Tests for the multi-doc merge logic — verifying that two docs
// both containing D.1-5) get correctly renumbered and independently-keyed groupRanges.

import { parseQuestions, extractParagraphs } from './parser';
import type { ParseResult, Question } from './types';

// Inline mergeResults (mirrors Step1Upload/index.tsx exactly)
function mergeResults(results: { name: string; result: ParseResult }[]): ParseResult {
  let offset = 0;
  const mergedQuestions = results.flatMap(({ result }) => {
    const renumbered = result.questions.map((q, idx) => ({
      ...q,
      number: offset + idx + 1,
      ...(q.groupRange && {
        groupRange: [q.groupRange[0] + offset, q.groupRange[1] + offset] as [number, number],
      }),
    }));
    offset += result.questions.length;
    return renumbered;
  });
  let errOffset = 0;
  const mergedErrors = results.flatMap(({ name, result }) => {
    const adjusted = result.errors.map((e) => ({
      questionNumber: e.questionNumber != null ? e.questionNumber + errOffset : null,
      message: results.length > 1 ? '[' + name + '] ' + e.message : e.message,
    }));
    errOffset += result.questions.length;
    return adjusted;
  });
  return { questions: mergedQuestions, errors: mergedErrors };
}

function makeDocWithDirection(passage: string, startQ: number): string {
  const end = startQ + 2;
  const lines: string[] = ['D.' + startQ + '-' + end + ') ' + passage];
  for (let n = startQ; n <= end; n++) {
    lines.push(
      'Q' + n + '. Direction Q' + n + '?',
      'A. Opt A', 'B. Opt B', 'C. Opt C', 'D. Opt D',
      'Ans: A',
      'Exp: Exp for Q' + n + '.',
      'Subject: GS > History',
      'Difficulty: Easy',
    );
  }
  return lines.join('\n');
}

function makeDoc(startQ: number, count: number): string {
  const lines: string[] = [];
  for (let n = startQ; n < startQ + count; n++) {
    lines.push(
      'Q' + n + '. Standalone Q' + n + '?',
      'A. Opt A', 'B. Opt B', 'C. Opt C', 'D. Opt D',
      'Ans: B',
      'Exp: Exp ' + n + '.',
      'Subject: GS > Geography',
      'Difficulty: Medium',
    );
  }
  return lines.join('\n');
}

function parse(raw: string): ParseResult { return parseQuestions(extractParagraphs(raw)); }

describe('mergeResults - groupRange offset fix', () => {
  it('offsets groupRange for second doc so keys never collide', () => {
    const doc1 = parse(makeDocWithDirection('Passage from Doc1.', 1));
    const doc2 = parse(makeDocWithDirection('Passage from Doc2.', 1));
    const { questions } = mergeResults([{ name: 'doc1.docx', result: doc1 }, { name: 'doc2.docx', result: doc2 }]);
    expect(questions).toHaveLength(6);
    for (let i = 0; i < 3; i++) { expect(questions[i].number).toBe(i + 1); expect(questions[i].groupRange).toEqual([1, 3]); expect(questions[i].passageText).toBe('Passage from Doc1.'); }
    for (let i = 3; i < 6; i++) { expect(questions[i].number).toBe(i + 1); expect(questions[i].groupRange).toEqual([4, 6]); expect(questions[i].passageText).toBe('Passage from Doc2.'); }
    expect(questions[0].groupRange![0] + '-' + questions[0].groupRange![1]).toBe('1-3');
    expect(questions[3].groupRange![0] + '-' + questions[3].groupRange![1]).toBe('4-6');
  });

  it('renumbers all questions sequentially 1..N across all docs', () => {
    const { questions } = mergeResults([{ name: 'a.docx', result: parse(makeDoc(1, 5)) }, { name: 'b.docx', result: parse(makeDoc(1, 4)) }]);
    expect(questions).toHaveLength(9);
    questions.forEach((q, i) => expect(q.number).toBe(i + 1));
  });

  it('all direction questions in each group share the same unique groupRange key', () => {
    const { questions } = mergeResults([{ name: 'a.docx', result: parse(makeDocWithDirection('Passage A.', 1)) }, { name: 'b.docx', result: parse(makeDocWithDirection('Passage B.', 1)) }]);
    const gk = (q: Question) => q.groupRange ? q.groupRange[0] + '-' + q.groupRange[1] : null;
    [0,1,2].forEach(i => expect(gk(questions[i])).toBe('1-3'));
    [3,4,5].forEach(i => expect(gk(questions[i])).toBe('4-6'));
  });

  it('preserves isFirstInGroup=true only for the first Q in each group', () => {
    const { questions } = mergeResults([{ name: 'a.docx', result: parse(makeDocWithDirection('Passage A.', 1)) }, { name: 'b.docx', result: parse(makeDocWithDirection('Passage B.', 1)) }]);
    expect(questions[0].isFirstInGroup).toBe(true); expect(questions[1].isFirstInGroup).toBeFalsy(); expect(questions[2].isFirstInGroup).toBeFalsy();
    expect(questions[3].isFirstInGroup).toBe(true); expect(questions[4].isFirstInGroup).toBeFalsy(); expect(questions[5].isFirstInGroup).toBeFalsy();
  });

  it('does not change groupRange when only one doc is merged (offset=0)', () => {
    const { questions } = mergeResults([{ name: 'only.docx', result: parse(makeDocWithDirection('Only passage.', 1)) }]);
    expect(questions).toHaveLength(3);
    questions.forEach(q => expect(q.groupRange).toEqual([1, 3]));
  });

  it('handles mixed standalone + passage: standalone has no groupRange, passage gets offset', () => {
    const raw2 = ['D.1-2) Passage text here.', 'Q1. P Q1?', 'A. Opt A', 'B. Opt B', 'C. Opt C', 'D. Opt D', 'Ans: A', 'Exp: Exp1.', 'Subject: GS > History', 'Difficulty: Easy', 'Q2. P Q2?', 'A. Opt A', 'B. Opt B', 'C. Opt C', 'D. Opt D', 'Ans: B', 'Exp: Exp2.', 'Subject: GS > History', 'Difficulty: Easy'].join('\n');
    const { questions } = mergeResults([{ name: 'doc1.docx', result: parse(makeDoc(1, 2)) }, { name: 'doc2.docx', result: parse(raw2) }]);
    expect(questions).toHaveLength(4);
    expect(questions[0].groupRange).toBeUndefined(); expect(questions[1].groupRange).toBeUndefined();
    expect(questions[2].groupRange).toEqual([3, 4]); expect(questions[2].passageText).toBe('Passage text here.');
    expect(questions[3].groupRange).toEqual([3, 4]);
  });

  it('correctly offsets groupRange across three docs all starting with D.1-3)', () => {
    const make = (p: string) => parse(makeDocWithDirection(p, 1));
    const { questions } = mergeResults([{ name: 'a.docx', result: make('Passage A.') }, { name: 'b.docx', result: make('Passage B.') }, { name: 'c.docx', result: make('Passage C.') }]);
    expect(questions).toHaveLength(9);
    expect(questions[0].groupRange).toEqual([1, 3]); expect(questions[0].passageText).toBe('Passage A.');
    expect(questions[3].groupRange).toEqual([4, 6]); expect(questions[3].passageText).toBe('Passage B.');
    expect(questions[6].groupRange).toEqual([7, 9]); expect(questions[6].passageText).toBe('Passage C.');
    const keys = new Set(questions.filter(q => q.groupRange).map(q => q.groupRange![0] + '-' + q.groupRange![1]));
    expect(keys.size).toBe(3);
  });
});
