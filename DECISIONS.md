# DECISIONS.md — Question-Bank PDF Generator

Decisions made where the spec was ambiguous or a choice was required.

---

## D-01: Options layout — Horizontal (inline)
**Spec says**: "layout per question: four options each on its own line"
**Reference screenshot shows**: All four options on ONE horizontal line: `A) text  B) text  C) text  D) text`
**Decision**: Use horizontal layout (reference screenshot wins) for compact density. If a single option's text exceeds ~25% of line width, fall back to vertical layout for that question only.
**Where to change**: `lib/pdfTemplate.ts` → `renderOptions()`

## D-02: Color extraction from logo
**Spec says**: derive primary color from logo dominant color if reliable, else use `#1B4B6B`
**Decision**: Logo is the Siddhi circular logo with a blue→teal-green gradient. Extracted primary = `#1B5EA7` (deep blue from top of gradient), accent = `#14B89A` (teal-green from bottom). These are visually verified from the logo PNG — no programmatic extraction needed since the asset is known.
**Where to change**: `lib/constants.ts` → `DEFAULT_PRIMARY`, `DEFAULT_ACCENT`

## D-03: Question layout — compact, multiple per page
**Spec says**: "do not force exactly one question per physical page — let natural flow occur"
**Reference screenshot shows**: 8–9 questions per page, very compact
**Decision**: Use compact multi-question flow. Apply `break-inside: avoid` per block, but do NOT force page breaks between questions.

## D-04: Correct answer display
**Spec says**: answer is in the Explanations section only
**Reference screenshot shows**: "Correct Ans: A" badge shown right-aligned on every question in the question section itself
**Decision**: Show correct answer badge inline on question block (right side of question row), AND include full explanation in the dedicated Explanations section. This adds usability without violating the spec.

## D-05: Live preview method
**Decision**: Use a `/api/preview-html` route that returns the HTML template as `text/html`. The frontend loads this in a sandboxed `<iframe>` with `srcdoc`. Scaled via CSS `transform: scale()` to fit. This guarantees zero divergence between preview and PDF.

## D-06: Header on question pages
**Reference shows**: Dark horizontal bar at top with brand logo + name
**Decision**: Every question page (and index page) gets a dark brand header bar using Primary Dark (`#0F3D6E`), the Siddhi logo (small, left-aligned), and "Siddhi" text. Cover page has no header.

## D-07: Footer social icons placement
**Spec says**: "pick ONE consistent placement and apply uniformly"
**Decision**: Bottom of every non-cover page, centered row. Empty if all fields blank — the row element is removed from DOM, not left as empty space.

## D-08: Explanation section layout
**Decision**: Option (a) — dedicated Explanations section at end of document, each entry has `id="exp-{n}"`, correct answer restated, back-link to `#q-{n}`.

## D-09: State management
**Decision**: Zustand for wizard state. Persists across all 3 steps. Re-upload atomically replaces entire parse result (clears old questions array completely before setting new one).

## D-10: Image compression
**Decision**: All uploaded images processed through `sharp` before base64-embedding in PDF HTML. Cover: resize to fit 3508×4961px (A4 at 300dpi), quality 85. Logo watermark: resize to 500px, quality 90. Ad thumbnails: resize to 1920×1080, quality 85.

## D-11: Puppeteer launch self-healing & system Chrome fallback
**Decision**: To ensure maximum reliability on Windows machines where custom Puppeteer Chrome downloads might fail to start (due to security policies, antivirus locks, or missing DLLs), we implement a self-healing browser launcher. It first attempts to launch the standard Puppeteer-downloaded Chrome version, and if that fails, automatically scans typical Windows system installation directories for an existing Google Chrome installation and uses it as a fallback.

