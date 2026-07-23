// lib/pdfRenderer.ts
// Puppeteer PDF renderer — takes an HTML string and returns a PDF Buffer
// Uses puppeteer-core + @sparticuz/chromium for serverless (Render/Vercel/Railway)
// Falls back to local system Chrome for development

import puppeteer, { Browser } from 'puppeteer-core';
import { existsSync } from 'fs';
import type { TemplateOptions } from './pdfTemplate';
import { buildHTMLTemplate } from './pdfTemplate';

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

export async function renderPDF(opts: TemplateOptions): Promise<Buffer> {
  const html = buildHTMLTemplate(opts);

  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    // Math is rendered server-side (katex.renderToString) so we just need
    // the DOM to be ready — 'domcontentloaded' is fast and reliable with setContent.
    await page.setContent(html, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });

    const { primaryColor = '#1B5EA7', accentColor = '#14B89A' } = opts.settings;

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: '0.1mm', left: 0 },
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      // Footer renders in the bottom-margin area. It has transparent background
      // so fixed social-icon and border elements below shine through.
      // Positioned at padding-right:32mm → horizontally in the dead zone between
      // the corner-icon zone (right 0–18mm) and the centered social icons.
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

    return Buffer.from(pdfBuffer);
  } finally {
    await page.close(); // Only close the page, leave the browser running
  }
}

