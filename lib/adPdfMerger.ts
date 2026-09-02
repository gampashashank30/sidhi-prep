// lib/adPdfMerger.ts
// Post-processes Puppeteer-generated PDFs to repair named internal link destinations
// and optionally merge cover, interlude, and ad pages.
//
// Two-pass render architecture:
//   The renderer produces two PDFs:
//     coverBuffer   — cover page only, no footer (no destinations)
//     contentBuffer — index + questions + explanations, footer starts at Pg 1
//   This function merges them:
//     result = [cover pages] + [interlude pages] + [content pages + ad insertions]
//   All named destinations (q-N, exp-N, topic-slug) in contentBuffer are offset
//   by (coverPageCount + interludePageCount) so TOC and explanation links work.

import { PDFDocument, PDFName, PDFDict, PDFArray, PDFRef, PDFString } from 'pdf-lib';

/**
 * Merges cover, interlude, ad, and content PDFs and repairs named destinations.
 *
 * @param mainPdfBuffer      Content PDF from Puppeteer (index page = Pg 1, has destinations)
 * @param coverPdfBuffer     Cover-only PDF (1 page, no destinations) — prepended at position 0
 * @param interludePdfBuffer Optional PDF inserted between cover and index
 * @param adPdfBuffer        Optional advertisement PDF inserted at regular intervals
 * @param pageInterval       Insert ad after every N content pages
 */
export async function processPdfWithDestinations(
  mainPdfBuffer: Buffer,
  coverPdfBuffer?: Buffer | null,
  interludePdfBuffer?: Buffer | null,
  adPdfBuffer?: Buffer | null,
  pageInterval?: number,
): Promise<Buffer> {
  const mainDoc       = await PDFDocument.load(mainPdfBuffer,  { ignoreEncryption: true, updateMetadata: false });
  const mainPageCount = mainDoc.getPageCount();

  // 1. Build map of mainPageRef -> 0-based mainPageIndex (for content PDF)
  const mainPages       = mainDoc.getPages();
  const mainPageRefToIdx = new Map<string, number>();
  mainPages.forEach((p, idx) => mainPageRefToIdx.set(p.ref.toString(), idx));

  // 2. Extract named destinations (/Dests) from mainDoc (content PDF)
  const destsRef = mainDoc.catalog.get(PDFName.of('Dests'));
  const destsDict = destsRef ? (mainDoc.context.lookup(destsRef) as PDFDict) : null;
  const namedDestsMap = new Map<string, { mainPageIndex: number; rest: any[] }>();

  if (destsDict) {
    for (const [key, val] of destsDict.entries()) {
      const destKey   = key.toString().replace(/^\//, '');
      const destArray = val instanceof PDFArray ? val : (mainDoc.context.lookup(val) as PDFArray);
      if (destArray && destArray.size() > 0) {
        const targetPageRef = destArray.get(0).toString();
        const mainIdx       = mainPageRefToIdx.get(targetPageRef);
        if (mainIdx !== undefined) {
          const rest: any[] = [];
          for (let k = 1; k < destArray.size(); k++) rest.push(destArray.get(k));
          namedDestsMap.set(destKey, { mainPageIndex: mainIdx, rest });
        }
      }
    }
  }

  // 3. Load cover PDF (optional — 1 page, no destinations)
  let coverDoc: PDFDocument | null = null;
  let coverPageIndices: number[]   = [];
  if (coverPdfBuffer) {
    try {
      coverDoc        = await PDFDocument.load(coverPdfBuffer, { ignoreEncryption: true, updateMetadata: false });
      coverPageIndices = Array.from({ length: coverDoc.getPageCount() }, (_, i) => i);
    } catch (err) {
      console.error('[adPdfMerger] Failed to load cover PDF, skipping:', err);
      coverDoc = null;
    }
  }
  const coverCount = coverDoc ? coverPageIndices.length : 0;

  // 4. Load interlude PDF (optional — inserted between cover and index)
  let interludeDoc: PDFDocument | null  = null;
  let interludePageIndices: number[]    = [];
  if (interludePdfBuffer) {
    try {
      interludeDoc        = await PDFDocument.load(interludePdfBuffer, { ignoreEncryption: true, updateMetadata: false });
      interludePageIndices = Array.from({ length: interludeDoc.getPageCount() }, (_, i) => i);
    } catch (err) {
      console.error('[adPdfMerger] Failed to load interlude PDF, skipping:', err);
      interludeDoc = null;
    }
  }
  const interludeCount = interludeDoc ? interludePageIndices.length : 0;

  // 5. Load ad PDF (optional)
  const hasAds = !!(adPdfBuffer && pageInterval && pageInterval > 0);
  let adDoc: PDFDocument | null = null;
  let adPageIndices: number[]   = [];
  if (hasAds) {
    try {
      adDoc        = await PDFDocument.load(adPdfBuffer!, { ignoreEncryption: true, updateMetadata: false });
      adPageIndices = Array.from({ length: adDoc.getPageCount() }, (_, i) => i);
    } catch (err) {
      console.error('[adPdfMerger] Failed to load ad PDF, skipping:', err);
      adDoc = null;
    }
  }

  // 6. Build result document
  //
  // Page layout in result PDF:
  //   [0 .. coverCount-1]                    = Cover pages
  //   [coverCount .. coverCount+interludeCount-1] = Interlude pages
  //   [coverCount+interludeCount ..]          = Content pages (index, questions, …)
  //                                             with ad pages interspersed
  //
  // mainToResultPageIdx maps content page index → result page index.
  // All named destinations from mainPdfBuffer are remapped via this map.

  const resultDoc           = await PDFDocument.create({ updateMetadata: false });
  const mainToResultPageIdx = new Map<number, number>();

  // ── Cover pages ──────────────────────────────────────────────────────────
  if (coverDoc && coverPageIndices.length > 0) {
    const coverPagesCopied = await resultDoc.copyPages(coverDoc, coverPageIndices);
    for (const p of coverPagesCopied) resultDoc.addPage(p);
  }

  // ── Interlude pages ──────────────────────────────────────────────────────
  if (interludeDoc && interludePageIndices.length > 0) {
    const interludePagesCopied = await resultDoc.copyPages(interludeDoc, interludePageIndices);
    for (const p of interludePagesCopied) resultDoc.addPage(p);
  }

  // ── Content pages (with ad insertions) ───────────────────────────────────
  for (let i = 0; i < mainPageCount; i++) {
    const [mainPage] = await resultDoc.copyPages(mainDoc, [i]);
    resultDoc.addPage(mainPage);
    const resIdx = resultDoc.getPageCount() - 1;
    mainToResultPageIdx.set(i, resIdx);

    if (adDoc && pageInterval && pageInterval > 0) {
      const contentPageNum      = i + 1; // 1-based within content PDF
      const isIntervalBoundary  = contentPageNum % pageInterval === 0;
      const isLastPage          = i + 1 === mainPageCount;
      if (isIntervalBoundary && !isLastPage) {
        const adPagesCopied = await resultDoc.copyPages(adDoc, adPageIndices);
        for (const adPage of adPagesCopied) resultDoc.addPage(adPage);
      }
    }
  }

  // 7. Update /Dests dictionary in resultDoc catalog
  if (namedDestsMap.size > 0) {
    const newDestsDict = resultDoc.context.obj({});
    for (const [name, info] of namedDestsMap.entries()) {
      const newResIdx = mainToResultPageIdx.get(info.mainPageIndex);
      if (newResIdx !== undefined) {
        const targetResultPage = resultDoc.getPage(newResIdx);
        const newDestArray     = resultDoc.context.obj([targetResultPage.ref, ...info.rest]);
        newDestsDict.set(PDFName.of(name), newDestArray);
      }
    }
    resultDoc.catalog.set(PDFName.of('Dests'), newDestsDict);
  }

  // 8. Update link annotations across all pages
  for (let i = 0; i < resultDoc.getPageCount(); i++) {
    const page  = resultDoc.getPage(i);
    const annots = page.node.Annots();
    if (!annots) continue;

    for (let j = 0; j < annots.size(); j++) {
      const annotRef  = annots.get(j) as PDFRef;
      const annotDict = resultDoc.context.lookup(annotRef) as PDFDict;
      if (!annotDict) continue;

      const subtype = annotDict.get(PDFName.of('Subtype'));
      if (subtype?.toString() !== '/Link') continue;

      let destVal   = annotDict.get(PDFName.of('Dest'));
      let isAction  = false;
      let actionDict: PDFDict | null = null;

      if (!destVal) {
        const action = annotDict.get(PDFName.of('A'));
        if (action) {
          actionDict = resultDoc.context.lookup(action) as PDFDict;
          if (actionDict) {
            destVal  = actionDict.get(PDFName.of('D'));
            isAction = true;
          }
        }
      }

      if (!destVal) continue;

      let destName: string | null = null;
      if (destVal instanceof PDFName)   destName = destVal.toString().replace(/^\//, '');
      else if (destVal instanceof PDFString) destName = destVal.decodeText();

      if (destName && namedDestsMap.has(destName)) {
        const info      = namedDestsMap.get(destName)!;
        const newResIdx = mainToResultPageIdx.get(info.mainPageIndex);
        if (newResIdx !== undefined) {
          const targetPage        = resultDoc.getPage(newResIdx);
          const explicitDestArray = resultDoc.context.obj([targetPage.ref, ...info.rest]);
          if (isAction && actionDict) {
            actionDict.set(PDFName.of('D'), explicitDestArray);
          } else {
            annotDict.set(PDFName.of('Dest'), explicitDestArray);
          }
        }
      }
    }
  }

  // 9. Sanitize metadata
  resultDoc.catalog.delete(PDFName.of('Metadata'));
  resultDoc.setProducer('Siddhi Prep');
  resultDoc.setCreator('Siddhi Prep');

  const infoRef = resultDoc.context.trailerInfo.Info;
  if (infoRef) {
    const info = resultDoc.context.lookup(infoRef);
    if (info instanceof PDFDict) {
      info.delete(PDFName.of('CreationDate'));
      info.delete(PDFName.of('ModDate'));
    }
  }

  const mergedBytes = await resultDoc.save({ updateFieldAppearances: false });
  return Buffer.from(mergedBytes);
}

/**
 * Legacy wrapper: inserts ad pages and repairs destinations. No cover split.
 */
export async function mergeAdPages(
  mainPdfBuffer: Buffer,
  adPdfBuffer: Buffer,
  pageInterval: number,
): Promise<Buffer> {
  return processPdfWithDestinations(mainPdfBuffer, null, null, adPdfBuffer, pageInterval);
}
