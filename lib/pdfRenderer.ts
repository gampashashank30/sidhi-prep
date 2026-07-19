// lib/pdfRenderer.ts
// Puppeteer PDF renderer — takes an HTML string and returns a PDF Buffer
// Uses puppeteer-core + @sparticuz/chromium for serverless (Render/Vercel/Railway)
// Falls back to local system Chrome for development

import puppeteer from 'puppeteer-core';
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
];

async function launchBrowser() {
  // ── 1. Try @sparticuz/chromium (works on Render, Railway, Vercel, etc.) ──
  try {
    // Dynamic import so it doesn't break local dev if not installed
    const chromium = await import('@sparticuz/chromium');
    const executablePath = await chromium.default.executablePath();
    console.log('[pdfRenderer] Launching @sparticuz/chromium at:', executablePath);
    return await puppeteer.launch({
      executablePath,
      headless: true,
      args: [...PUPPETEER_ARGS, ...chromium.default.args],
    });
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
        return await puppeteer.launch({
          executablePath: chromePath,
          headless: true,
          args: PUPPETEER_ARGS,
        });
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

  try {
    const page = await browser.newPage();

    // PDF generation doesn't need to load external resources — waitUntil:'domcontentloaded'
    // is faster and avoids hanging on Google Fonts network requests
    await page.setContent(html, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: true,
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
