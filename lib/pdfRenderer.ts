// lib/pdfRenderer.ts
// Puppeteer PDF renderer — takes an HTML string and returns a PDF Buffer

import puppeteer from 'puppeteer';
import { existsSync } from 'fs';
import type { TemplateOptions } from './pdfTemplate';
import { buildHTMLTemplate } from './pdfTemplate';

async function launchBrowser() {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--no-first-run',
    '--no-zygote',
  ];

  try {
    // Try launching default Puppeteer Chrome
    return await puppeteer.launch({
      headless: true,
      args,
    });
  } catch (defaultError) {
    console.warn('Default Puppeteer Chrome launch failed, trying system Chrome fallback...', defaultError);

    // Fallback paths for Google Chrome on Windows
    const systemChromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    ];

    for (const chromePath of systemChromePaths) {
      if (existsSync(chromePath)) {
        try {
          console.log(`Launching system Chrome at: ${chromePath}`);
          return await puppeteer.launch({
            executablePath: chromePath,
            headless: true,
            args,
          });
        } catch (fallbackError) {
          console.error(`System Chrome launch failed at ${chromePath}:`, fallbackError);
        }
      }
    }

    // Re-throw original error if all fallbacks fail
    throw defaultError;
  }
}

export async function renderPDF(opts: TemplateOptions): Promise<Buffer> {
  const html = buildHTMLTemplate(opts);
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();

    // Set content and wait for fonts/images to load
    await page.setContent(html, {
      waitUntil: 'load',
      timeout: 30000,
    });

    // Generate PDF
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

