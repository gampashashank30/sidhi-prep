// lib/ommlParser.ts — Universal DOCX Parser: Text + Inline Images
//
// Reads word/document.xml directly from a .docx buffer and:
// 1. Transforms native Word Equation Editor structures (OMML) into LaTeX $...$
// 2. Extracts ALL embedded images (from word/media/) as base64 data URLs
// 3. Emits [IMG:rIdXX] placeholder tokens inline within paragraph text, preserving
//    the exact positional relationship between text and images.
//
// This is universal — works for any .docx file that embeds images via <w:drawing>.

import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';

// ─── Return type ──────────────────────────────────────────────────────────────

export interface DocxParseResult {
  /** Paragraph strings with [IMG:rIdXX] tokens embedded where images appear */
  paragraphs: string[];
  /**
   * Map of relationship ID → base64 data URL.
   * e.g. { "rId5": "data:image/png;base64,iVBO..." }
   * Works for any image type: png, jpeg, gif, emf, wmf, svg
   */
  imageMap: Record<string, string>;
}

// ─── MIME type detection ──────────────────────────────────────────────────────

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    png:  'image/png',
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    gif:  'image/gif',
    bmp:  'image/bmp',
    webp: 'image/webp',
    svg:  'image/svg+xml',
    tiff: 'image/tiff',
    tif:  'image/tiff',
    emf:  'image/emf',   // Windows Enhanced Metafile — treated as opaque blob
    wmf:  'image/wmf',
  };
  return map[ext] ?? 'image/png';
}

// ─── Text sanitizer ──────────────────────────────────────────────────────────

/**
 * Normalize text extracted from Word XML runs.
 * Word uses special Unicode characters that appear as garbage in plain text output:
 * - \u00A0 (non-breaking space) → regular space
 * - \u00AD (soft hyphen) → removed
 * - \u200B–\u200D (zero-width chars) → removed
 * - \uFEFF (BOM) → removed
 * - \uFFFD (replacement char) → removed
 * - ASCII control chars → removed
 */
function sanitizeText(text: string): string {
  return text
    .replace(/\u00A0/g, ' ')   // non-breaking space → regular space
    .replace(/\u00AD/g, '')    // soft hyphen → remove
    .replace(/\u200B/g, '')    // zero-width space → remove
    .replace(/\u200C/g, '')    // zero-width non-joiner → remove
    .replace(/\u200D/g, '')    // zero-width joiner → remove
    .replace(/\uFEFF/g, '')    // BOM / zero-width no-break space → remove
    .replace(/\uFFFD/g, '')    // replacement character → remove
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // control chars → remove
}

// ─── OMML → LaTeX converter ───────────────────────────────────────────────────


/**
 * Recursively convert an OMML XML node (m:oMath, m:f, m:rad, m:sSup, etc.) into a LaTeX string.
 */
function ommlElementToLatex(node: Node): string {
  if (!node) return '';

  // Text node
  if (node.nodeType === 3 /* TEXT_NODE */) {
    return node.nodeValue || '';
  }

  if (node.nodeType !== 1 /* ELEMENT_NODE */) {
    return '';
  }

  const tag = node.nodeName.replace(/^[a-zA-Z0-9]+:/, ''); // strip prefix e.g. m:f -> f

  switch (tag) {
    case 'oMathPara':
    case 'oMath': {
      let out = '';
      for (let i = 0; i < node.childNodes.length; i++) {
        out += ommlElementToLatex(node.childNodes[i]);
      }
      return out.trim();
    }

    case 'f': {
      // Fraction: <m:f><m:num>...</m:num><m:den>...</m:den></m:f>
      let num = '';
      let den = '';
      for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i];
        const childTag = child.nodeName.replace(/^[a-zA-Z0-9]+:/, '');
        if (childTag === 'num') num = ommlElementToLatex(child);
        else if (childTag === 'den') den = ommlElementToLatex(child);
      }
      return `\\frac{ ${num.trim()} }{ ${den.trim()} }`;
    }

    case 'rad': {
      // Radical / Square root
      let deg = '';
      let elem = '';
      for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i];
        const childTag = child.nodeName.replace(/^[a-zA-Z0-9]+:/, '');
        if (childTag === 'deg') deg = ommlElementToLatex(child).trim();
        else if (childTag === 'e') elem = ommlElementToLatex(child);
      }
      if (deg && deg.length > 0) {
        return `\\sqrt[${deg}]{ ${elem.trim()} }`;
      }
      return `\\sqrt{ ${elem.trim()} }`;
    }

    case 'sSup': {
      // Superscript
      let base = '';
      let sup = '';
      for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i];
        const childTag = child.nodeName.replace(/^[a-zA-Z0-9]+:/, '');
        if (childTag === 'e') base = ommlElementToLatex(child);
        else if (childTag === 'sup') sup = ommlElementToLatex(child);
      }
      return `{${base.trim()}}^{${sup.trim()}}`;
    }

    case 'sSub': {
      // Subscript
      let base = '';
      let sub = '';
      for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i];
        const childTag = child.nodeName.replace(/^[a-zA-Z0-9]+:/, '');
        if (childTag === 'e') base = ommlElementToLatex(child);
        else if (childTag === 'sub') sub = ommlElementToLatex(child);
      }
      return `{${base.trim()}}_{${sub.trim()}}`;
    }

    case 'sSubSup': {
      // Subscript + Superscript
      let base = '';
      let sub = '';
      let sup = '';
      for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i];
        const childTag = child.nodeName.replace(/^[a-zA-Z0-9]+:/, '');
        if (childTag === 'e') base = ommlElementToLatex(child);
        else if (childTag === 'sub') sub = ommlElementToLatex(child);
        else if (childTag === 'sup') sup = ommlElementToLatex(child);
      }
      return `{${base.trim()}}_{${sub.trim()}}^{${sup.trim()}}`;
    }

    case 'd': {
      // Delimiter / Parentheses
      let beg = '(';
      let end = ')';
      let elem = '';

      for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i];
        const childTag = child.nodeName.replace(/^[a-zA-Z0-9]+:/, '');
        if (childTag === 'dPr') {
          const begNode = (child as Element).getElementsByTagName('m:begChr')[0];
          if (begNode && begNode.getAttribute('m:val')) {
            beg = begNode.getAttribute('m:val')!;
          }
          const endNode = (child as Element).getElementsByTagName('m:endChr')[0];
          if (endNode && endNode.getAttribute('m:val')) {
            end = endNode.getAttribute('m:val')!;
          }
        } else if (childTag === 'e') {
          elem += ommlElementToLatex(child);
        }
      }
      return `\\left${beg} ${elem.trim()} \\right${end}`;
    }

    case 'm': {
      // Matrix / Equation Array
      const rows: string[] = [];
      for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i];
        const childTag = child.nodeName.replace(/^[a-zA-Z0-9]+:/, '');
        if (childTag === 'mr') {
          const cells: string[] = [];
          for (let j = 0; j < child.childNodes.length; j++) {
            const cell = child.childNodes[j];
            const cellTag = cell.nodeName.replace(/^[a-zA-Z0-9]+:/, '');
            if (cellTag === 'e') {
              cells.push(ommlElementToLatex(cell));
            }
          }
          rows.push(cells.join(' & '));
        }
      }
      return `\\begin{aligned} ${rows.join(' \\\\ ')} \\end{aligned}`;
    }

    case 'nary': {
      // N-ary operator: sum, integral, product
      let chr = '\\sum';
      let sub = '';
      let sup = '';
      let elem = '';
      for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i];
        const childTag = child.nodeName.replace(/^[a-zA-Z0-9]+:/, '');
        if (childTag === 'naryPr') {
          const chrNode = (child as Element).getElementsByTagName('m:chr')[0];
          if (chrNode) {
            const val = chrNode.getAttribute('m:val');
            if (val === '∫') chr = '\\int';
            else if (val === '∏') chr = '\\prod';
          }
        } else if (childTag === 'sub') sub = ommlElementToLatex(child);
        else if (childTag === 'sup') sup = ommlElementToLatex(child);
        else if (childTag === 'e') elem = ommlElementToLatex(child);
      }
      let out = chr;
      if (sub) out += `_{${sub.trim()}}`;
      if (sup) out += `^{${sup.trim()}}`;
      out += ` ${elem.trim()}`;
      return out;
    }

    case 'r':
    case 't': {
      // Text / Run inside math
      let text = '';
      for (let i = 0; i < node.childNodes.length; i++) {
        text += ommlElementToLatex(node.childNodes[i]);
      }
      return text
        .replace(/×/g, ' \\times ')
        .replace(/÷/g, ' \\div ')
        .replace(/±/g, ' \\pm ')
        .replace(/≤/g, ' \\le ')
        .replace(/≥/g, ' \\ge ')
        .replace(/≠/g, ' \\neq ');
    }

    default: {
      let out = '';
      for (let i = 0; i < node.childNodes.length; i++) {
        out += ommlElementToLatex(node.childNodes[i]);
      }
      return out;
    }
  }
}

// ─── Relationship map builder ─────────────────────────────────────────────────

/**
 * Parse word/_rels/document.xml.rels and return a map of
 * relationship ID → target filename (relative to word/).
 * e.g. { "rId5": "media/image1.png" }
 */
async function buildRelationshipMap(zip: JSZip): Promise<Record<string, string>> {
  const relsMap: Record<string, string> = {};

  // Try both common locations for the document relationships file
  const relsPaths = [
    'word/_rels/document.xml.rels',
    '_rels/.rels',
  ];

  for (const relsPath of relsPaths) {
    const relsFile = zip.file(relsPath);
    if (!relsFile) continue;

    const relsXml = await relsFile.async('string');
    const parser = new DOMParser();
    const relsDoc = parser.parseFromString(relsXml, 'text/xml');

    const relationships = relsDoc.getElementsByTagName('Relationship');
    for (let i = 0; i < relationships.length; i++) {
      const rel = relationships.item(i);
      if (!rel) continue;
      const id = rel.getAttribute('Id');
      const type = rel.getAttribute('Type') ?? '';
      const target = rel.getAttribute('Target');
      if (id && target && type.includes('/image')) {
        relsMap[id] = target; // e.g. "media/image1.png"
      }
    }

    if (Object.keys(relsMap).length > 0) break; // found what we need
  }

  return relsMap;
}

// ─── Image extractor ──────────────────────────────────────────────────────────

/**
 * Extract all images referenced in the relationship map from the zip.
 * Returns rId → base64 data URL.
 */
async function extractImages(
  zip: JSZip,
  relsMap: Record<string, string>,
): Promise<Record<string, string>> {
  const imageMap: Record<string, string> = {};

  // ── Lazy-load sharp once ────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sharpFn: ((input: Buffer) => any) | null = null;
  try {
    const sharpMod = await import('sharp');
    // sharp's default export is the constructor function itself
    sharpFn = (sharpMod.default ?? sharpMod) as (input: Buffer) => any;
  } catch {
    // sharp not available (e.g. edge runtime) — fall back to raw base64
  }

  /**
   * Compress an image buffer to JPEG (max 800px, quality 75).
   * Falls back to the original raw base64 when sharp is unavailable or the
   * format cannot be decoded (e.g. EMF/WMF vector files).
   */
  async function compressToBase64(rawBuffer: Buffer, mimeType: string): Promise<string> {
    // EMF / WMF are Windows vector formats — sharp cannot decode them, keep raw
    if (mimeType === 'image/emf' || mimeType === 'image/wmf') {
      return `data:${mimeType};base64,${rawBuffer.toString('base64')}`;
    }
    if (!sharpFn) {
      return `data:${mimeType};base64,${rawBuffer.toString('base64')}`;
    }
    try {
      const compressed = await sharpFn(rawBuffer)
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 75, progressive: true })
        .toBuffer();
      return `data:image/jpeg;base64,${compressed.toString('base64')}`;
    } catch {
      // Unsupported format (e.g. SVG with complex features) — fall back to raw
      return `data:${mimeType};base64,${rawBuffer.toString('base64')}`;
    }
  }

  for (const [rId, relTarget] of Object.entries(relsMap)) {
    // relTarget is like "media/image1.png" — full path in zip is "word/media/image1.png"
    const zipPath = relTarget.startsWith('word/') ? relTarget : `word/${relTarget}`;
    const imageFile = zip.file(zipPath);
    if (!imageFile) {
      // Try without the "word/" prefix too (some DOCX pack differently)
      const altFile = zip.file(relTarget);
      if (!altFile) continue;
      const rawBuf = Buffer.from(await altFile.async('arraybuffer'));
      const mime = getMimeType(relTarget);
      imageMap[rId] = await compressToBase64(rawBuf, mime);
      continue;
    }
    const rawBuf = Buffer.from(await imageFile.async('arraybuffer'));
    const mime = getMimeType(zipPath);
    imageMap[rId] = await compressToBase64(rawBuf, mime);
  }

  return imageMap;
}

// ─── Drawing node → rId extractor ────────────────────────────────────────────

/**
 * Given a <w:drawing> or <w:pict> node, find the r:embed attribute value (rId).
 * Handles both modern DrawingML (<a:blip r:embed="rIdN"/>) and legacy VML (<v:imagedata r:id="rIdN"/>).
 */
function extractRIdFromDrawing(drawingNode: Node): string | null {
  // Modern path: a:blip r:embed="rIdN"
  const blips = (drawingNode as Element).getElementsByTagName('a:blip');
  for (let i = 0; i < blips.length; i++) {
    const blip = blips.item(i);
    const rEmbed = blip?.getAttribute('r:embed');
    if (rEmbed) return rEmbed;
  }

  // Legacy VML path: v:imagedata r:id="rIdN"
  const imageData = (drawingNode as Element).getElementsByTagName('v:imagedata');
  for (let i = 0; i < imageData.length; i++) {
    const imgData = imageData.item(i);
    const rId = imgData?.getAttribute('r:id') || imgData?.getAttribute('r:href');
    if (rId) return rId;
  }

  // Fallback: any element with r:embed attribute
  // Walk all descendants looking for r:embed
  function findREmbed(node: Node): string | null {
    if (node.nodeType === 1) {
      const rEmbed = (node as Element).getAttribute('r:embed');
      if (rEmbed) return rEmbed;
    }
    for (let i = 0; i < node.childNodes.length; i++) {
      const found = findREmbed(node.childNodes[i]);
      if (found) return found;
    }
    return null;
  }
  return findREmbed(drawingNode);
}

// ─── Main paragraph extractor ─────────────────────────────────────────────────

/**
 * Extract paragraph strings directly from a .docx Buffer.
 *
 * Universal behavior:
 * - Converts native Word OMML equations into LaTeX $...$ and $$...$$
 * - Extracts all embedded images as base64 data URLs
 * - Emits [IMG:rIdXX] tokens inline in paragraph text at the exact position
 *   where images appear — preserving question/option/explanation context
 *
 * @param buffer  Raw .docx file buffer
 * @returns       { paragraphs, imageMap } — paragraphs contain [IMG:rIdXX] tokens
 */
export async function parseDocxWithOmml(buffer: Buffer): Promise<DocxParseResult> {
  const zip = await JSZip.loadAsync(buffer);

  // ── 1. Load document.xml ──────────────────────────────────────────────────
  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) {
    throw new Error('Invalid .docx file: missing word/document.xml');
  }

  const xmlText = await docXmlFile.async('string');
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  // ── 2. Build rId → filename and rId → base64 maps ────────────────────────
  const relsMap  = await buildRelationshipMap(zip);
  const imageMap = await extractImages(zip, relsMap);

  // ── 3. Walk paragraphs, emit text + [IMG:rIdXX] tokens ───────────────────
  const paragraphNodes = doc.getElementsByTagName('w:p');
  const paragraphs: string[] = [];

  for (let pIdx = 0; pIdx < paragraphNodes.length; pIdx++) {
    const pNode = paragraphNodes.item(pIdx);
    if (!pNode) continue;

    let paraText = '';

    // Walk all direct children of <w:p>
    for (let cIdx = 0; cIdx < pNode.childNodes.length; cIdx++) {
      const child = pNode.childNodes.item(cIdx);
      if (!child || child.nodeType !== 1) continue;

      const tag = child.nodeName.replace(/^[a-zA-Z0-9]+:/, '');

      switch (tag) {
        case 'oMathPara': {
          // Block math equation paragraph
          const latex = ommlElementToLatex(child);
          if (latex.trim()) {
            paraText += ` $$${latex.trim()}$$ `;
          }
          break;
        }

        case 'oMath': {
          // Inline math equation
          const latex = ommlElementToLatex(child);
          if (latex.trim()) {
            paraText += ` $${latex.trim()}$ `;
          }
          break;
        }

        case 'r': {
          // Regular text run — may contain text AND/OR a drawing
          for (let rIdx = 0; rIdx < child.childNodes.length; rIdx++) {
            const rChild = child.childNodes.item(rIdx);
            if (!rChild || rChild.nodeType !== 1) continue;

            const rTag = rChild.nodeName.replace(/^[a-zA-Z0-9]+:/, '');

            if (rTag === 't') {
              // Text node — sanitize Word special characters
              if (rChild.textContent) {
                paraText += sanitizeText(rChild.textContent);
              }
            } else if (rTag === 'drawing' || rTag === 'pict') {
              // Inline image — extract rId and emit placeholder token
              const rId = extractRIdFromDrawing(rChild);
              if (rId && imageMap[rId]) {
                // Only emit token if image was actually extracted successfully
                paraText += ` [IMG:${rId}] `;
              }
            }
          }
          break;
        }

        case 'hyperlink': {
          // Text inside hyperlink — sanitize
          const textNodes = (child as Element).getElementsByTagName('w:t');
          for (let tIdx = 0; tIdx < textNodes.length; tIdx++) {
            const tNode = textNodes.item(tIdx);
            if (tNode && tNode.textContent) {
              paraText += sanitizeText(tNode.textContent);
            }
          }
          break;
        }

        case 'ins':
        case 'del': {
          // Track changes — treat inserts as text, skip deletes
          if (tag === 'ins') {
            const textNodes = (child as Element).getElementsByTagName('w:t');
            for (let tIdx = 0; tIdx < textNodes.length; tIdx++) {
              const tNode = textNodes.item(tIdx);
              if (tNode && tNode.textContent) {
                paraText += sanitizeText(tNode.textContent);
              }
            }
          }
          break;
        }

        default:
          // Unknown child — try to extract any text from it (graceful degradation)
          break;
      }
    }

    // Also handle <w:drawing> or <w:pict> that appear as DIRECT children of <w:p>
    // (some Word versions do this for anchored images)
    const directDrawings = (pNode as Element).childNodes;
    for (let dIdx = 0; dIdx < directDrawings.length; dIdx++) {
      const dChild = directDrawings.item(dIdx);
      if (!dChild || dChild.nodeType !== 1) continue;
      const dTag = dChild.nodeName.replace(/^[a-zA-Z0-9]+:/, '');
      if (dTag === 'drawing' || dTag === 'pict') {
        const rId = extractRIdFromDrawing(dChild);
        if (rId && imageMap[rId] && !paraText.includes(`[IMG:${rId}]`)) {
          paraText += ` [IMG:${rId}] `;
        }
      }
    }

    const trimmed = paraText.trim();
    if (trimmed.length > 0) {
      paragraphs.push(trimmed);
    }
  }

  return { paragraphs, imageMap };
}
