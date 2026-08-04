// lib/adPdfMerger.ts
// Post-processes the Puppeteer-generated PDF to insert ad PDF pages at
// regular page intervals. Uses pdf-lib which preserves ALL annotations
// (URI hyperlinks, internal links, form fields) from the uploaded ad PDF.

import { PDFDocument } from 'pdf-lib';

/**
 * Inserts all pages from `adPdfBuffer` into `mainPdfBuffer` at every
 * `pageInterval` pages of content.
 *
 * Example (interval=2, adPDF has 1 page):
 *   Input:  [M1, M2, M3, M4, M5]
 *   Output: [M1, M2, A1, M3, M4, A1, M5]
 *
 * The ad pages are copied fresh for each insertion — no shared references —
 * so each copy is fully independent in the output PDF.
 *
 * Hyperlinks in the ad PDF are preserved because pdf-lib copies page
 * annotation arrays (including /Annots with /URI and /GoTo actions) as-is.
 *
 * @param mainPdfBuffer   Buffer from Puppeteer
 * @param adPdfBuffer     Buffer of the uploaded advertisement PDF
 * @param pageInterval    Insert ad after every N main content pages (1–10)
 * @returns               Merged PDF as Buffer
 */
export async function mergeAdPages(
  mainPdfBuffer: Buffer,
  adPdfBuffer: Buffer,
  pageInterval: number,
): Promise<Buffer> {
  // Load both PDFs.
  // ignoreEncryption: true is required for PDFs exported from tools like Canva or
  // Adobe that set encryption metadata even when the content is not actually protected.
  // Without this flag, pdf-lib throws "Input document to PDFDocumentWriter is encrypted"
  // and the entire ad merge silently fails (caught upstream), leaving the final PDF
  // with no ad pages at all — which also means the ad's URI hyperlinks are lost.
  const mainDoc = await PDFDocument.load(mainPdfBuffer, { ignoreEncryption: true });
  const adDoc   = await PDFDocument.load(adPdfBuffer,  { ignoreEncryption: true });


  const mainPageCount = mainDoc.getPageCount();
  const adPageCount   = adDoc.getPageCount();
  const adPageIndices = Array.from({ length: adPageCount }, (_, i) => i);

  // Build result document page by page
  const resultDoc = await PDFDocument.create();

  for (let i = 0; i < mainPageCount; i++) {
    // Copy one main content page into result
    const [mainPage] = await resultDoc.copyPages(mainDoc, [i]);
    resultDoc.addPage(mainPage);

    // After every `pageInterval` content pages, insert all ad pages.
    // Skip insertion after the very last page (no trailing ad).
    const isIntervalBoundary = (i + 1) % pageInterval === 0;
    const isLastPage         = i + 1 === mainPageCount;

    if (isIntervalBoundary && !isLastPage) {
      // Copy all ad pages fresh for this insertion slot
      const adPagesCopied = await resultDoc.copyPages(adDoc, adPageIndices);
      for (const adPage of adPagesCopied) {
        resultDoc.addPage(adPage);
      }
    }
  }

  // Serialize to bytes and return as Buffer
  const mergedBytes = await resultDoc.save();
  return Buffer.from(mergedBytes);
}
