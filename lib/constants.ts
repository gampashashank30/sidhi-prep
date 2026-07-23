// lib/constants.ts — App-wide constants (single source of truth for colors, page sizes, etc.)

// ─── Page layout ─────────────────────────────────────────────────────────────
export const PAGE_WIDTH_MM = 210;   // A4 portrait
export const PAGE_HEIGHT_MM = 297;  // A4 portrait
export const BORDER_INSET_MM = 10;  // distance from page edge to border
export const CONTENT_PADDING_MM = 6; // internal padding from border to text safe-area
export const CORNER_ICON_SIZE_MM = 16; // size of logo at each border corner

// ─── Default colors (derived from Siddhi logo — see DECISIONS.md D-02) ──────
export const DEFAULT_PRIMARY = '#1B5EA7';    // Deep blue (top of logo gradient)
export const DEFAULT_ACCENT = '#14B89A';     // Teal-green (bottom of logo gradient)
export const DEFAULT_PRIMARY_DARK = '#0F3D6E'; // Darkened primary for header bar

// ─── Difficulty badge colors (from spec §5.3) ────────────────────────────────
export const DIFFICULTY_COLORS = {
  Easy:   { bg: '#2E7D32', text: '#FFFFFF' },
  Medium: { bg: '#B8860B', text: '#FFFFFF' },
  Hard:   { bg: '#B3261E', text: '#FFFFFF' },
} as const;

// ─── Topic badge colors (from spec §5.3) ─────────────────────────────────────
export const TOPIC_BADGE = { bg: '#E8EAED', text: '#3C4043' };

// ─── Neutral colors ───────────────────────────────────────────────────────────
export const NEUTRAL_TEXT = '#1F1F1F';
export const NEUTRAL_BG = '#F5F6F7';
export const NEUTRAL_LIGHT = '#E8EAED';

// ─── Watermark ────────────────────────────────────────────────────────────────
export const WATERMARK_OPACITY = 0.07;
export const WATERMARK_SIZE_PERCENT = 60; // % of shorter page dimension

// ─── Default PDF settings ─────────────────────────────────────────────────────
export const DEFAULT_PDF_SETTINGS = {
  watermarkEnabled: true,
  borderEnabled: true,
  borderColor: DEFAULT_PRIMARY,
  borderStyle: 'solid' as const,
  borderWidthMm: 2,
  difficultyBadgeEnabled: true,
  topicBadgeEnabled: true,
  showAnswer: true,
  includeExplanations: true,
  socialLinks: { instagram: '', youtube: '', telegram: '', playStore: '', appStore: '', microsoftStore: '' },
  adsEnabled: false,
  adImages: [],
  adIntervalQuestions: 15,
  primaryColor: DEFAULT_PRIMARY,
  accentColor: DEFAULT_ACCENT,
};
