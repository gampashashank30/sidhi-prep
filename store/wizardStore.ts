// store/wizardStore.ts
// Zustand multi-step wizard state — persists across all 3 steps

import { create } from 'zustand';
import type { ParseResult, CoverSettings, PDFSettings, Question } from '@/lib/types';
import { DEFAULT_PDF_SETTINGS } from '@/lib/constants';

interface WizardState {
  currentStep: 1 | 2 | 3;

  // Step 1
  parseResult: ParseResult | null;
  uploadedFileName: string | null;

  // Step 2
  coverSettings: CoverSettings | null;
  selectedQuestionNumbers: number[];
  /** When true, selected questions are shuffled randomly in the output PDF.
   *  When false (default), they appear in their original topic-wise order. */
  randomSegregation: boolean;

  // Step 3
  pdfSettings: PDFSettings;

  // Actions
  setStep: (step: 1 | 2 | 3) => void;
  setParseResult: (result: ParseResult, fileName: string) => void;
  clearParseResult: () => void;
  setCoverSettings: (settings: CoverSettings | null) => void;
  setSelectedQuestions: (numbers: number[]) => void;
  toggleQuestion: (number: number) => void;
  selectAllQuestions: () => void;
  deselectAllQuestions: () => void;
  setRandomSegregation: (value: boolean) => void;
  updatePdfSettings: (partial: Partial<PDFSettings>) => void;
  resetPdfSettings: () => void;

  // Derived
  getSelectedQuestions: () => Question[];
}

export const useWizardStore = create<WizardState>((set, get) => ({
  currentStep: 1,

  // Step 1
  parseResult: null,
  uploadedFileName: null,

  // Step 2
  coverSettings: null,
  selectedQuestionNumbers: [],
  randomSegregation: false,

  // Step 3
  pdfSettings: { ...DEFAULT_PDF_SETTINGS },

  // ── Actions ──────────────────────────────────────────────────────────────

  setStep: (step) => set({ currentStep: step }),

  setParseResult: (result, fileName) => {
    // Atomically replace — no stale state from previous upload
    set({
      parseResult: result,
      uploadedFileName: fileName,
      // Pre-select all valid questions
      selectedQuestionNumbers: result.questions.map(q => q.number),
      // Reset downstream state
      coverSettings: null,
    });
  },

  clearParseResult: () => set({
    parseResult: null,
    uploadedFileName: null,
    selectedQuestionNumbers: [],
    coverSettings: null,
  }),

  setCoverSettings: (settings) => set({ coverSettings: settings }),

  setSelectedQuestions: (numbers) => set({ selectedQuestionNumbers: numbers }),

  toggleQuestion: (number) => set((state) => {
    const sel = new Set(state.selectedQuestionNumbers);
    if (sel.has(number)) {
      sel.delete(number);
    } else {
      sel.add(number);
    }
    return { selectedQuestionNumbers: Array.from(sel) };
  }),

  selectAllQuestions: () => set((state) => ({
    selectedQuestionNumbers: state.parseResult?.questions.map(q => q.number) ?? [],
  })),

  deselectAllQuestions: () => set({ selectedQuestionNumbers: [] }),

  setRandomSegregation: (value) => set({ randomSegregation: value }),

  updatePdfSettings: (partial) => set((state) => ({
    pdfSettings: { ...state.pdfSettings, ...partial },
  })),

  resetPdfSettings: () => set({ pdfSettings: { ...DEFAULT_PDF_SETTINGS } }),

  // ── Derived ──────────────────────────────────────────────────────────────

  getSelectedQuestions: () => {
    const { parseResult, selectedQuestionNumbers, randomSegregation } = get();
    if (!parseResult) return [];
    const sel = new Set(selectedQuestionNumbers);
    const filtered = parseResult.questions.filter(q => sel.has(q.number));

    if (!randomSegregation) {
      // Topic-wise order: sort by the full subjectPath so all questions
      // belonging to the same topic are adjacent. This ensures that topic
      // headings in the PDF are contiguous and that index-page anchor links
      // (e.g. clicking "Humanity") land on a single grouped block.
      return [...filtered].sort((a, b) => {
        const aKey = a.subjectPath.join('\x00');
        const bKey = b.subjectPath.join('\x00');
        if (aKey < bKey) return -1;
        if (aKey > bKey) return 1;
        // Within the same topic, preserve original document order
        return a.number - b.number;
      });
    }

    // Random Segregation ON — group-aware Fisher-Yates shuffle.
    //
    // A comprehension / direction group must move as ONE atomic unit:
    // all questions in the group stay together in original relative order,
    // but the group as a whole can land anywhere among the shuffled output.
    // Standalone questions each move individually.
    //
    // Algorithm:
    //   1. Build "units": each unit is either [singleQuestion] or [q1, q2, q3 …]
    //      for a passage group (identified by a unique groupRange key).
    //   2. Fisher-Yates shuffle the units array.
    //   3. Flatten back to a flat question array.
    //
    // The groupRange key uses the globally-offset numbers that route.ts produces
    // (e.g. "6-10" for Doc2's group), so units from different documents
    // can never accidentally merge into the same slot.

    // Step 1 — partition into units, preserving order within each group.
    type Unit = Question[];
    const unitMap = new Map<string, Unit>(); // groupKey → ordered questions
    const unitOrder: (string | '__standalone__')[] = []; // insertion order of unit keys

    for (const q of filtered) {
      if (q.groupRange) {
        const gk = `${q.groupRange[0]}-${q.groupRange[1]}`;
        if (!unitMap.has(gk)) {
          unitMap.set(gk, []);
          unitOrder.push(gk);
        }
        unitMap.get(gk)!.push(q);
      } else {
        // Each standalone question is its own unit; use a unique key.
        const sk = `__standalone__${q.number}`;
        unitMap.set(sk, [q]);
        unitOrder.push(sk);
      }
    }

    // Step 2 — collect units in insertion order, then Fisher-Yates on units.
    const units: Unit[] = unitOrder.map((key) => unitMap.get(key)!);
    for (let i = units.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [units[i], units[j]] = [units[j], units[i]];
    }

    // Step 3 — flatten.
    return units.flat();
  },

}));
