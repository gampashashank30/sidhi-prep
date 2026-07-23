// lib/types.ts — Single source of truth for all types used across validation, topic tree, and PDF render

// ─── Core Question type ──────────────────────────────────────────────────────

export type Question = {
  number: number;
  text: string;
  options: { A: string; B: string; C: string; D: string };
  answer: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  subjectPath: string[]; // e.g. ["GS", "History", "Art and Culture", "Classical Music"]
  difficulty: 'Easy' | 'Medium' | 'Hard';
};

// ─── Validation error type ───────────────────────────────────────────────────

export type ValidationError = {
  questionNumber: number | null; // null only if document-level error (e.g. empty file)
  message: string; // Human-readable, specific
};

// ─── Parse result ────────────────────────────────────────────────────────────

export type ParseResult = {
  questions: Question[];
  errors: ValidationError[];
};

// ─── Topic tree (for Step 2 checkbox UI) ────────────────────────────────────

export type TopicNode = {
  label: string;         // Display label for this node
  path: string[];        // Full path from root, e.g. ["GS", "History"]
  slug: string;          // URL-safe slug for PDF anchors
  questionCount: number; // Total questions at or below this node
  children: TopicNode[];
};

// ─── Customization settings (Step 3) ─────────────────────────────────────────

export type BorderStyle = 'solid' | 'double' | 'dashed';

export type PDFSettings = {
  // 5.1 Watermark
  watermarkEnabled: boolean;

  // 5.2 Border
  borderEnabled: boolean;
  borderColor: string;    // hex e.g. "#1B5EA7"
  borderStyle: BorderStyle;
  borderWidthMm: number;  // 1–6

  // 5.3 Badges
  difficultyBadgeEnabled: boolean;
  topicBadgeEnabled: boolean;
  showAnswer: boolean;           // show/hide the "Ans: X" badge on each question
  includeExplanations: boolean;  // include the full explanations section in the PDF

  // 5.5 Social links
  socialLinks: {
    instagram: string;
    youtube: string;
    telegram: string;
    playStore: string;
    appStore: string;
    microsoftStore: string;
  };

  // 5.6 Ads
  adsEnabled: boolean;
  adImages: AdImage[];           // max 2 images; both shown together on each ad page
  adIntervalQuestions: number;   // insert ad page after every N questions (default 15)

  // 5.7 Colors
  primaryColor: string;   // hex
  accentColor: string;    // hex
};

export type AdImage = {
  dataUrl: string;    // base64 data URL (already compressed by client-side canvas)
  linkUrl?: string;   // optional clickable URL (each image independently linked)
};

// ─── Cover image settings ─────────────────────────────────────────────────────

export type CoverSettings = {
  dataUrl: string;          // compressed base64 data URL
  focalX: number;           // 0.0–1.0 horizontal focal point
  focalY: number;           // 0.0–1.0 vertical focal point
};

// ─── Full wizard state ────────────────────────────────────────────────────────

export type WizardStep = 1 | 2 | 3;

export type WizardState = {
  currentStep: WizardStep;

  // Step 1
  parseResult: ParseResult | null;
  uploadedFileName: string | null;

  // Step 2
  coverSettings: CoverSettings | null;
  selectedQuestionNumbers: Set<number>; // question numbers the user checked

  // Step 3
  pdfSettings: PDFSettings;

  // Derived (computed from parseResult + selectedQuestionNumbers)
  selectedQuestions: () => Question[];
};

// ─── PDF generation request ───────────────────────────────────────────────────

export type GeneratePDFRequest = {
  questions: Question[];           // Already filtered to selected only
  coverSettings: CoverSettings | null;
  logoDataUrl: string | null;       // server-side public logo, pre-loaded
  pdfSettings: PDFSettings;
};
