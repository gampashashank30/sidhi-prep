// lib/ommlParser.ts — Universal DOCX Parser: Text + Inline Images + Tables
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
  /** Paragraph strings with [IMG:rIdXX] and [TBL:TN] tokens embedded inline */
  paragraphs: string[];
  /**
   * Map of relationship ID → base64 data URL.
   * e.g. { "rId5": "data:image/png;base64,iVBO..." }
   * Works for any image type: png, jpeg, gif, emf, wmf, svg
   */
  imageMap: Record<string, string>;
  /**
   * Map of table token key → safe HTML string.
   * e.g. { "T1": "<table class=\"doc-table\">...</table>" }
   * Tokens appear in paragraphs as [TBL:T1], [TBL:T2], etc.
   */
  tableHtmlMap: Record<string, string>;
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
      // Delimiter / Parentheses — may wrap a matrix (m:m) child
      let beg = '(';
      let end = ')';
      const eChildren: Node[] = [];

      for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i];
        const childTag = child.nodeName.replace(/^[a-zA-Z0-9]+:/, '');
        if (childTag === 'dPr') {
          const begNode = (child as Element).getElementsByTagName('m:begChr')[0];
          if (begNode && begNode.getAttribute('m:val') !== null) {
            beg = begNode.getAttribute('m:val') ?? '(';
          }
          const endNode = (child as Element).getElementsByTagName('m:endChr')[0];
          if (endNode && endNode.getAttribute('m:val') !== null) {
            end = endNode.getAttribute('m:val') ?? ')';
          }
        } else if (childTag === 'e') {
          eChildren.push(child);
        }
      }

      // Check if the single 'e' child contains an m:m matrix node
      // If so, pick the proper LaTeX matrix environment based on brackets
      if (eChildren.length === 1) {
        const eNode = eChildren[0];
        let matrixNode: Node | null = null;
        for (let k = 0; k < eNode.childNodes.length; k++) {
          const t = eNode.childNodes[k].nodeName.replace(/^[a-zA-Z0-9]+:/, '');
          if (t === 'm') { matrixNode = eNode.childNodes[k]; break; }
        }
        if (matrixNode) {
          // Determine environment from bracket characters
          let env = 'pmatrix'; // default: ()
          if (beg === '[' || beg === '\u005b') env = 'bmatrix'; // []
          else if (beg === '|') env = 'vmatrix';                  // ||
          else if (beg === '\u2016') env = 'Vmatrix';            // ‖‖
          else if (beg === '\u230a' || beg === '\u2308') env = 'bmatrix'; // ⌊⌈
          else if (beg === '{') env = 'Bmatrix';                  // {}

          const rows: string[] = [];
          for (let i = 0; i < matrixNode.childNodes.length; i++) {
            const child = matrixNode.childNodes[i];
            const ct = child.nodeName.replace(/^[a-zA-Z0-9]+:/, '');
            if (ct === 'mr') {
              const cells: string[] = [];
              for (let j = 0; j < child.childNodes.length; j++) {
                const cell = child.childNodes[j];
                if (cell.nodeName.replace(/^[a-zA-Z0-9]+:/, '') === 'e') {
                  cells.push(ommlElementToLatex(cell));
                }
              }
              rows.push(cells.join(' & '));
            }
          }
          return `\\begin{${env}} ${rows.join(' \\\\ ')} \\end{${env}}`;
        }
      }

      // Not a matrix — regular delimiter
      const elem = eChildren.map(e => ommlElementToLatex(e)).join('');
      const leftDelim  = beg || '.';
      const rightDelim = end || '.';
      return `\\left${leftDelim} ${elem.trim()} \\right${rightDelim}`;
    }

    case 'm': {
      // Matrix / Equation Array — detect enclosing delimiter to pick correct env
      // The parent node (m:d) holds bracket characters in m:dPr > m:begChr/m:endChr.
      // We inspect the parent passed in from the 'd' case handler below.
      // Default: use \begin{matrix} (no brackets) — caller wraps in m:d if needed.
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
      // Default environment when not inside an m:d delimiter context
      return `\\begin{matrix} ${rows.join(' \\\\ ')} \\end{matrix}`;
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

  // ── 3. Walk w:body direct children in document order ─────────────────────
  // This preserves the true reading order (tables are NOT flattened into
  // disconnected paragraphs like the old getElementsByTagName('w:p') approach).
  const tableHtmlMap: Record<string, string> = {};
  let tableCounter = 0;
  const paragraphs: string[] = [];

  // ── Helper: process a single <w:p> node into a text string ─────────────────
  function processParagraph(pNode: Node): string {
    let paraText = '';

    for (let cIdx = 0; cIdx < pNode.childNodes.length; cIdx++) {
      const child = pNode.childNodes.item(cIdx);
      if (!child || child.nodeType !== 1) continue;

      const tag = child.nodeName.replace(/^[a-zA-Z0-9]+:/, '');

      switch (tag) {
        case 'oMathPara': {
          const latex = ommlElementToLatex(child);
          if (latex.trim()) paraText += ` $$${latex.trim()}$$ `;
          break;
        }
        case 'oMath': {
          const latex = ommlElementToLatex(child);
          if (latex.trim()) paraText += ` $${latex.trim()}$ `;
          break;
        }
        case 'r': {
          for (let rIdx = 0; rIdx < child.childNodes.length; rIdx++) {
            const rChild = child.childNodes.item(rIdx);
            if (!rChild || rChild.nodeType !== 1) continue;
            const rTag = rChild.nodeName.replace(/^[a-zA-Z0-9]+:/, '');
            if (rTag === 't') {
              if (rChild.textContent) paraText += sanitizeText(rChild.textContent);
            } else if (rTag === 'drawing' || rTag === 'pict') {
              const rId = extractRIdFromDrawing(rChild);
              if (rId && imageMap[rId]) paraText += ` [IMG:${rId}] `;
            }
          }
          break;
        }
        case 'hyperlink': {
          const textNodes = (child as Element).getElementsByTagName('w:t');
          for (let tIdx = 0; tIdx < textNodes.length; tIdx++) {
            const tNode = textNodes.item(tIdx);
            if (tNode && tNode.textContent) paraText += sanitizeText(tNode.textContent);
          }
          break;
        }
        case 'ins': {
          const textNodes = (child as Element).getElementsByTagName('w:t');
          for (let tIdx = 0; tIdx < textNodes.length; tIdx++) {
            const tNode = textNodes.item(tIdx);
            if (tNode && tNode.textContent) paraText += sanitizeText(tNode.textContent);
          }
          break;
        }
        case 'del':
          // Track-change deletions — skip entirely
          break;
        default:
          break;
      }
    }

    // Also catch anchored <w:drawing>/<w:pict> that are direct children of <w:p>
    for (let dIdx = 0; dIdx < pNode.childNodes.length; dIdx++) {
      const dChild = pNode.childNodes.item(dIdx);
      if (!dChild || dChild.nodeType !== 1) continue;
      const dTag = dChild.nodeName.replace(/^[a-zA-Z0-9]+:/, '');
      if (dTag === 'drawing' || dTag === 'pict') {
        const rId = extractRIdFromDrawing(dChild);
        if (rId && imageMap[rId] && !paraText.includes(`[IMG:${rId}]`)) {
          paraText += ` [IMG:${rId}] `;
        }
      }
    }

    return paraText.trim();
  }

  // ── Helper: convert cell text (from all its w:p children) to plain string ──
  function cellText(tcNode: Node): string {
    const parts: string[] = [];
    for (let i = 0; i < tcNode.childNodes.length; i++) {
      const ch = tcNode.childNodes.item(i);
      if (!ch) continue;
      const t = ch.nodeName.replace(/^[a-zA-Z0-9]+:/, '');
      if (t === 'p') {
        const txt = processParagraph(ch);
        if (txt) parts.push(txt);
      }
      // Nested tables inside a cell are flattened to "[Table]" placeholder
      if (t === 'tbl') parts.push('[Table]');
    }
    return parts.join('<br/>');
  }

  // ── Helper: parse <w:tbl> and return safe HTML string ──────────────────────
  // Handles: colspan (w:gridSpan), rowspan (w:vMerge), math inside cells,
  // images inside cells, multi-paragraph cells.
  function parseTableNode(tblNode: Node): string {
    // ── First pass: collect all rows and cells with metadata ────────────────
    // We need a two-pass approach to compute rowspans (vMerge):
    //   Pass 1: build a 2D grid of { text, colspan, isVMergeRestart, isVMergeContinue }
    //   Pass 2: compute actual rowspan values by scanning downward
    type RawCell = {
      text: string;
      colspan: number;
      isVMergeRestart: boolean;
      isVMergeContinue: boolean;
    };
    const rawRows: RawCell[][] = [];

    for (let rIdx = 0; rIdx < tblNode.childNodes.length; rIdx++) {
      const rowNode = tblNode.childNodes.item(rIdx);
      if (!rowNode) continue;
      const rowTag = rowNode.nodeName.replace(/^[a-zA-Z0-9]+:/, '');
      if (rowTag !== 'tr') continue;

      const rawCells: RawCell[] = [];
      for (let cIdx = 0; cIdx < rowNode.childNodes.length; cIdx++) {
        const cellNode = rowNode.childNodes.item(cIdx);
        if (!cellNode) continue;
        const cellTag = cellNode.nodeName.replace(/^[a-zA-Z0-9]+:/, '');
        if (cellTag !== 'tc') continue;

        // ── Read cell properties ────────────────────────────────────────────
        let colspan = 1;
        let isVMergeRestart = false;
        let isVMergeContinue = false;

        const tcPr = (cellNode as Element).getElementsByTagName('w:tcPr')[0];
        if (tcPr) {
          // Horizontal span
          const gridSpan = tcPr.getElementsByTagName('w:gridSpan')[0];
          if (gridSpan) {
            const val = parseInt(gridSpan.getAttribute('w:val') ?? '1', 10);
            if (val > 1) colspan = val;
          }
          // Vertical merge
          const vMerge = tcPr.getElementsByTagName('w:vMerge')[0];
          if (vMerge) {
            const val = vMerge.getAttribute('w:val');
            if (val === 'restart') {
              isVMergeRestart = true;
            } else {
              // val is null or 'continue' — this cell is a continuation
              isVMergeContinue = true;
            }
          }
        }

        // ── Extract cell content ────────────────────────────────────────────
        const text = isVMergeContinue ? '' : cellText(cellNode);

        rawCells.push({ text, colspan, isVMergeRestart, isVMergeContinue });
      }

      if (rawCells.length > 0) rawRows.push(rawCells);
    }

    if (rawRows.length === 0) return ''; // empty table

    // ── Second pass: compute rowspan by looking ahead ──────────────────────
    // We build a flat list of { rowIndex, cellIndex, rowspan } for restart cells
    type SpanInfo = { rowspan: number };
    // grid[rowIdx][colPos] = SpanInfo | null
    // We only need rowspan, so we compute it per raw-cell position.
    const rowspanGrid: (SpanInfo | null)[][] = rawRows.map(() => []);

    for (let ri = 0; ri < rawRows.length; ri++) {
      for (let ci = 0; ci < rawRows[ri].length; ci++) {
        const cell = rawRows[ri][ci];
        if (cell.isVMergeRestart) {
          // Count how many consecutive rows below have a vMergeContinue in same col position
          let span = 1;
          for (let rj = ri + 1; rj < rawRows.length; rj++) {
            if (ci < rawRows[rj].length && rawRows[rj][ci].isVMergeContinue) {
              span++;
            } else {
              break;
            }
          }
          rowspanGrid[ri][ci] = { rowspan: span };
        } else if (cell.isVMergeContinue) {
          rowspanGrid[ri][ci] = null; // skip rendering
        } else {
          rowspanGrid[ri][ci] = { rowspan: 1 };
        }
      }
    }

    // ── Detect header row: first row has bold text in all/most cells ────────
    // Simple heuristic: if the first row cells contain <strong> or are ALL CAPS
    // we treat it as a header row (<th> instead of <td>).
    // Since we don't have run-level bold detection here (we'd need to inspect
    // w:rPr > w:b), we use a content heuristic: first row = header when ≥ 2 cells
    // and none of them look like data (numbers, options, etc.).
    const isHeaderRow = (ri: number): boolean => {
      if (ri !== 0) return false;
      const row = rawRows[0];
      if (row.length < 2) return false;
      // If all cells are short and contain no math/images, treat as header
      const allShort = row.every(c => c.text.length < 60 && !c.text.includes('[IMG:'));
      return allShort;
    };

    // ── Determine column count ──────────────────────────────────────────────
    const colCount = Math.max(...rawRows.map(row =>
      row.reduce((sum, c) => sum + c.colspan, 0)
    ));

    // ── Render HTML table ───────────────────────────────────────────────────
    // Style: compact, respects 2-column PDF layout (max-width 100%),
    // break-inside:avoid for short tables, proper border collapse.
    const compactFont = colCount > 5 ? '6.5pt' : colCount > 3 ? '7pt' : '7.5pt';
    const cellPad     = colCount > 5 ? '2px 3px' : '3px 6px';

    let html = `<table class="doc-table" style="`
      + `border-collapse:collapse;`
      + `width:100%;`
      + `max-width:100%;`
      + `font-size:${compactFont};`
      + `line-height:1.4;`
      + `margin:4px 0 4px 0;`
      + `table-layout:auto;`
      + `word-break:break-word;`
      + `-webkit-print-color-adjust:exact;`
      + `print-color-adjust:exact;`
      + `">`;

    for (let ri = 0; ri < rawRows.length; ri++) {
      const isHeader = isHeaderRow(ri);
      const rowBg = isHeader ? 'background:#f0f4f8;' : (ri % 2 === 1 ? 'background:#fafafa;' : '');
      html += `<tr style="${rowBg}">`;

      for (let ci = 0; ci < rawRows[ri].length; ci++) {
        const cell    = rawRows[ri][ci];
        const spanInf = rowspanGrid[ri]?.[ci];

        // Skip vMerge continuation cells — they are covered by the rowspan above
        if (spanInf === null) continue;

        const tag2    = isHeader ? 'th' : 'td';
        const colspanAttr = cell.colspan > 1 ? ` colspan="${cell.colspan}"` : '';
        const rowspanAttr = (spanInf?.rowspan ?? 1) > 1 ? ` rowspan="${spanInf!.rowspan}"` : '';
        const thStyle = isHeader
          ? `font-weight:700;background:#e8edf2;color:#1a2533;text-align:center;`
          : `color:#1F1F1F;text-align:left;`;

        html += `<${tag2}${colspanAttr}${rowspanAttr} style="`
          + `border:1px solid #c8d0d8;`
          + `padding:${cellPad};`
          + `vertical-align:top;`
          + `${thStyle}`
          + `">${cell.text}</${tag2}>`;
      }
      html += '</tr>';
    }
    html += '</table>';
    return html;
  }

  // ── Locate w:body ───────────────────────────────────────────────────────────
  const bodyNodes = doc.getElementsByTagName('w:body');
  const body = bodyNodes.item(0);
  if (!body) return { paragraphs, imageMap, tableHtmlMap };

  // ── Walk direct children of w:body in document order ───────────────────────
  for (let idx = 0; idx < body.childNodes.length; idx++) {
    const node = body.childNodes.item(idx);
    if (!node || node.nodeType !== 1) continue;

    const nodeName = node.nodeName.replace(/^[a-zA-Z0-9]+:/, '');

    if (nodeName === 'p') {
      // ── Paragraph ────────────────────────────────────────────────────────
      const txt = processParagraph(node);
      if (txt.length > 0) paragraphs.push(txt);

    } else if (nodeName === 'tbl') {
      // ── Table ─────────────────────────────────────────────────────────────
      // Convert to HTML and store under a unique key
      const tableHtml = parseTableNode(node);
      if (tableHtml) {
        tableCounter++;
        const key = `T${tableCounter}`;
        tableHtmlMap[key] = tableHtml;
        // Emit the token as a standalone "paragraph" so parser.ts sees it
        // as a separate block that won't accidentally match Q/A/Ans patterns.
        paragraphs.push(`[TBL:${key}]`);
      }

    } else if (nodeName === 'sectPr') {
      // Section properties — no content, skip
    }
    // All other body-level elements (w:sdt content controls, etc.) are skipped gracefully
  }

  return { paragraphs, imageMap, tableHtmlMap };
}
