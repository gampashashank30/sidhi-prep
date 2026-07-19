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

  updatePdfSettings: (partial) => set((state) => ({
    pdfSettings: { ...state.pdfSettings, ...partial },
  })),

  resetPdfSettings: () => set({ pdfSettings: { ...DEFAULT_PDF_SETTINGS } }),

  // ── Derived ──────────────────────────────────────────────────────────────

  getSelectedQuestions: () => {
    const { parseResult, selectedQuestionNumbers } = get();
    if (!parseResult) return [];
    const sel = new Set(selectedQuestionNumbers);
    return parseResult.questions.filter(q => sel.has(q.number));
  },
}));
