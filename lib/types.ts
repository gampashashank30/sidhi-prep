// lib/types.ts — Single source of truth for all types used across validation, topic tree, and PDF render

// ─── Core Question type ──────────────────────────────────────────────────────

export type Question = {
  number: number;
  text: string;
  options: { A: string; B: string; C: string; D: string };
  answer: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  subjectPath: string[]; // e.g. ["GS", "History", "Art and Culture", "Classical Music"]
  difficulty: 'Easy' | 'Medium' | 'Hard' | null;

  // ── Embedded images (universal — any DOCX with inline images) ───────────────
  // Each entry is a base64 data URL: "data:image/png;base64,..."
  // Populated by the OMML parser for any uploaded .docx, not just one specific file.
  images?: string[];                                          // Images in question body
  optionImages?: { A?: string; B?: string; C?: string; D?: string }; // Per-option images
  explanationImages?: string[];                               // Images in explanation

  // ── Passage / Direction group (optional) ────────────────────────────────────
  // Set when this question belongs to a "D.9-13)" or "Direction.1-5)" block.
  passageText?: string;            // Shared passage text for the group
  isFirstInGroup?: boolean;        // True only for the first Q in the group
  groupRange?: [number, number];   // Declared range, e.g. [9, 13]
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
  // 5.0 Header text (editable in Step 3)
  headerTitle?: string;        // left side italic text, default "Siddhi"
  headerLabel?: string;        // right side small-caps label, default "QUESTION BANK"

  // 5.0b Corner logo (4 corners of the page border)
  cornerLogoDataUrl?: string;  // custom corner logo image (base64). When undefined → uses default logo

  // 5.1 Watermark
  watermarkEnabled: boolean;
  watermarkDataUrl?: string;  // custom watermark image (base64). When undefined → uses default logo
  watermarkOpacity?: number;  // 0.01–0.30, default 0.07

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

  // 5.6 Ads — PDF-based advertisement insertion
  // Upload a PDF (with hyperlinks) to be inserted at every N pages of content.
  adPdf?: {
    base64: string;      // The uploaded ad PDF as a base64 string
    pageInterval: number; // Insert after every N content pages (1–10)
  };

  // 5.7 Colors
  primaryColor: string;   // hex
  accentColor: string;    // hex
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
