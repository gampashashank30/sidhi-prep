// lib/pdfRenderer.ts
// Puppeteer PDF renderer — two-pass approach for correct page numbering:
//   Pass 1: cover-only HTML, displayHeaderFooter:false  → coverBuffer (no page number)
//   Pass 2: content HTML (no cover), displayHeaderFooter:true → contentBuffer (index = Pg 1)
// The two buffers are merged by processPdfWithDestinations in adPdfMerger.ts.

import puppeteer, { Browser } from 'puppeteer-core';
import { existsSync } from 'fs';
import type { TemplateOptions } from './pdfTemplate';
import { buildHTMLTemplate, buildCoverOnlyHTML } from './pdfTemplate';
import { processPdfWithDestinations, extractTopicPageNumbers } from './adPdfMerger';

const PUPPETEER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--no-zygote',
  '--single-process',
  '--disable-gpu',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-breakpad',
  '--disable-component-extensions-with-background-pages',
  '--disable-extensions',
  '--disable-ipc-flooding-protection',
  '--disable-renderer-backgrounding',
  '--mute-audio',
];

let cachedBrowser: Browser | null = null;

export function prewarmBrowser() {
  launchBrowser().catch((err) => {
    console.warn('[pdfRenderer] Pre-warm browser background launch error:', err);
  });
}

async function launchBrowser() {
  if (cachedBrowser && cachedBrowser.connected) {
    return cachedBrowser;
  }

  // ── 1. Try @sparticuz/chromium (works on Render, Railway, Vercel, etc.) ──
  try {
    const chromium = await import('@sparticuz/chromium');
    const executablePath = await chromium.default.executablePath();
    console.log('[pdfRenderer] Launching @sparticuz/chromium at:', executablePath);
    cachedBrowser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [...PUPPETEER_ARGS, ...chromium.default.args],
    });
    return cachedBrowser;
  } catch (sparticuzErr) {
    console.warn('[pdfRenderer] @sparticuz/chromium unavailable, trying local Chrome...', sparticuzErr);
  }

  // ── 2. Local development fallback — system Chrome paths ──────────────────
  const localChromePaths = [
    // Windows
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ];

  for (const chromePath of localChromePaths) {
    if (existsSync(chromePath)) {
      try {
        console.log('[pdfRenderer] Launching local Chrome at:', chromePath);
        cachedBrowser = await puppeteer.launch({
          executablePath: chromePath,
          headless: true,
          args: PUPPETEER_ARGS,
        });
        return cachedBrowser;
      } catch (err) {
        console.error('[pdfRenderer] Local Chrome launch failed at', chromePath, err);
      }
    }
  }

  throw new Error(
    'No Chrome/Chromium executable found. On Render ensure @sparticuz/chromium is installed. ' +
    'Locally install Google Chrome.',
  );
}

/**
 * Navigate a Puppeteer page to an HTML string (via a temp file) and print to PDF.
 * Returns a Buffer of the resulting PDF bytes.
 */
async function renderHtmlToPdfBuffer(
  page: Awaited<ReturnType<Browser['newPage']>>,
  html: string,
  pdfOptions: Parameters<typeof page.pdf>[0],
): Promise<Buffer> {
  const os   = require('os');
  const path = require('path');
  const fs   = require('fs');
  const tmpFile = path.join(os.tmpdir(), `siddhi-pdf-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(tmpFile, html, 'utf8');
  try {
    await page.goto(`file://${tmpFile}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
  const bytes = await page.pdf(pdfOptions);
  return Buffer.from(bytes);
}

export async function renderPDF(opts: TemplateOptions): Promise<Buffer> {
  const { primaryColor = '#1B5EA7', accentColor = '#14B89A' } = opts.settings;

  const browser = await launchBrowser();
  const page    = await browser.newPage();

  try {
    // ── Pass 1: Cover-only — no displayHeaderFooter ────────────────────────
    // The cover page must NOT appear in the page-number sequence. Rendering it
    // as a separate PDF (without displayHeaderFooter) guarantees this, because
    // Chromium's <span class="pageNumber"> only runs inside the footer template
    // and the content PDF starts fresh at page 1 for the index page.
    const coverHtml = buildCoverOnlyHTML(opts);
    const coverBuffer = await renderHtmlToPdfBuffer(page, coverHtml, {
      format: 'A4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      headerTemplate: '<span></span>',
      footerTemplate: '<span></span>',
    });

    // ── Pass 2a: Content — first render (TOC shows '—', used to extract real page numbers)
    const contentHtml1 = buildHTMLTemplate({ ...opts, noCover: true });
    const contentBuffer1 = await renderHtmlToPdfBuffer(page, contentHtml1, {
      format: 'A4',
      printBackground: true,
      tagged: true,
      margin: { top: 0, right: 0, bottom: '0.1mm', left: 0 },
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `
        <div style="
          width:100%;
          height:100%;
          box-sizing:border-box;
          padding-right:32mm;
          display:flex;
          justify-content:flex-end;
          align-items:center;
          background:transparent;
        ">
          <div style="
            display:inline-flex;
            align-items:center;
            gap:3px;
            background:linear-gradient(135deg,${primaryColor} 0%,${accentColor} 100%);
            border-radius:20px;
            padding:3px 10px 3px 8px;
            box-shadow:0 1px 6px rgba(0,0,0,0.28);
            -webkit-print-color-adjust:exact;
            print-color-adjust:exact;
          ">
            <span style="font-size:7px;font-weight:600;color:rgba(255,255,255,0.8);letter-spacing:0.8px;text-transform:uppercase;font-family:Arial,sans-serif;">Pg</span>
            <span class="pageNumber" style="font-size:9px;font-weight:800;color:#ffffff;font-family:Arial,sans-serif;margin-left:2px;"></span>
          </div>
        </div>
      `,
    });

    // ── Pass 2b: Extract real topic page numbers from the PDF /Dests catalog ──
    // Chromium writes the exact named-destination → page mapping into the PDF.
    // Reading it back gives us 100%-accurate content-relative page numbers.
    const tocPageNumbers = await extractTopicPageNumbers(contentBuffer1);

    // ── Pass 2c: Content — second render with page numbers baked into TOC HTML ─
    // Re-render only if we got page numbers; otherwise reuse the first render.
    let contentBuffer: Buffer;
    if (Object.keys(tocPageNumbers).length > 0) {
      const contentHtml2 = buildHTMLTemplate({ ...opts, noCover: true, tocPageNumbers });
      contentBuffer = await renderHtmlToPdfBuffer(page, contentHtml2, {
        format: 'A4',
        printBackground: true,
        tagged: true,
        margin: { top: 0, right: 0, bottom: '0.1mm', left: 0 },
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        // Simple footer pill — no JS offset needed because content starts at 1
        footerTemplate: `
          <div style="
            width:100%;
            height:100%;
            box-sizing:border-box;
            padding-right:32mm;
            display:flex;
            justify-content:flex-end;
            align-items:center;
            background:transparent;
          ">
            <div style="
              display:inline-flex;
              align-items:center;
              gap:3px;
              background:linear-gradient(135deg,${primaryColor} 0%,${accentColor} 100%);
              border-radius:20px;
              padding:3px 10px 3px 8px;
              box-shadow:0 1px 6px rgba(0,0,0,0.28);
              -webkit-print-color-adjust:exact;
              print-color-adjust:exact;
            ">
              <span style="font-size:7px;font-weight:600;color:rgba(255,255,255,0.8);letter-spacing:0.8px;text-transform:uppercase;font-family:Arial,sans-serif;">Pg</span>
              <span class="pageNumber" style="font-size:9px;font-weight:800;color:#ffffff;font-family:Arial,sans-serif;margin-left:2px;"></span>
            </div>
          </div>
        `,
      });
    } else {
      // No topic anchors found (e.g. index page disabled) — use the first render
      contentBuffer = contentBuffer1;
    }

    // ── Extract interlude and ad buffers from settings ────────────────────
    let interludeBuffer: Buffer | null = null;
    let adBuffer: Buffer | null = null;
    let pageInterval = 0;

    if (opts.settings.interludePdf?.base64) {
      try {
        interludeBuffer = Buffer.from(opts.settings.interludePdf.base64, 'base64');
      } catch (err) {
        console.error('[pdfRenderer] Failed to parse interlude PDF buffer, skipping:', err);
      }
    }

    if (opts.settings.adPdf?.base64 && opts.settings.adPdf.pageInterval > 0) {
      try {
        adBuffer    = Buffer.from(opts.settings.adPdf.base64, 'base64');
        pageInterval = opts.settings.adPdf.pageInterval;
      } catch (err) {
        console.error('[pdfRenderer] Failed to parse ad PDF buffer, skipping ads:', err);
      }
    }

    // ── Merge: cover + interlude + content (with ad insertions + dest repair) ─
    // processPdfWithDestinations prepends coverBuffer (1 page, no destinations),
    // then interlude pages, then the content pages. All named destinations inside
    // contentBuffer are offset by (coverPageCount + interludePageCount) so that
    // TOC links, q<->explanation links, etc. resolve correctly in the final PDF.
    const finalBuffer = await processPdfWithDestinations(
      contentBuffer,    // main content — has destinations, starts at index page
      coverBuffer,      // cover — prepended at position 0, no destinations
      interludeBuffer,  // optional interlude between cover and index
      adBuffer,
      pageInterval,
    );

    return finalBuffer;
  } finally {
    await page.close();
  }
}
