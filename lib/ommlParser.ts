// lib/ommlParser.ts — Direct Word OMML XML to LaTeX Parser
//
// Reads word/document.xml directly from a .docx buffer and transforms native
// Word Equation Editor structures (<m:oMath> and <m:oMathPara>) into pristine
// LaTeX $...$ and $$...$$ math blocks.

import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';

/**
 * Recursively convert an OMML XML node (<m:oMath>, <m:f>, <m:rad>, <m:sSup>, etc.) into a LaTeX string.
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
      // Radical / Square root: <m:rad><m:deg>...</m:deg><m:e>...</m:e></m:rad>
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
      // Superscript: <m:sSup><m:e>...</m:e><m:sup>...</m:sup></m:sSup>
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
      // Subscript: <m:sSub><m:e>...</m:e><m:sub>...</m:sub></m:sSub>
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
      // Subscript + Superscript: <m:sSubSup><m:e>...</m:e><m:sub>...</m:sub><m:sup>...</m:sup></m:sSubSup>
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
      // Delimiter / Parentheses: <m:d><m:begChr m:val="("/><m:endChr m:val=")"/><m:e>...</m:e></m:d>
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
      // Matrix / Equation Array: <m:m><m:mr><m:e>...</m:e></m:mr></m:m>
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

/**
 * Extract paragraph strings directly from a .docx Buffer.
 * Converts native Word OMML equations (<m:oMath> and <m:oMathPara>)
 * into pristine LaTeX $...$ and $$...$$ math blocks.
 */
export async function parseDocxWithOmml(buffer: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buffer);
  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) {
    throw new Error('Invalid .docx file: missing word/document.xml');
  }

  const xmlText = await docXmlFile.async('string');
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  const paragraphNodes = doc.getElementsByTagName('w:p');
  const paragraphs: string[] = [];

  for (let pIdx = 0; pIdx < paragraphNodes.length; pIdx++) {
    const pNode = paragraphNodes.item(pIdx);
    if (!pNode) continue;

    let paraText = '';

    for (let cIdx = 0; cIdx < pNode.childNodes.length; cIdx++) {
      const child = pNode.childNodes.item(cIdx);
      if (!child || child.nodeType !== 1) continue;

      const tag = child.nodeName.replace(/^[a-zA-Z0-9]+:/, '');

      if (tag === 'oMathPara') {
        // Block math equation paragraph
        const latex = ommlElementToLatex(child);
        if (latex.trim()) {
          paraText += ` $$${latex.trim()}$$ `;
        }
      } else if (tag === 'oMath') {
        // Inline math equation
        const latex = ommlElementToLatex(child);
        if (latex.trim()) {
          paraText += ` $${latex.trim()}$ `;
        }
      } else if (tag === 'r') {
        // Regular text run
        const textNodes = (child as Element).getElementsByTagName('w:t');
        for (let tIdx = 0; tIdx < textNodes.length; tIdx++) {
          const tNode = textNodes.item(tIdx);
          if (tNode && tNode.textContent) {
            paraText += tNode.textContent;
          }
        }
      } else if (tag === 'hyperlink') {
        // Text inside hyperlink
        const textNodes = (child as Element).getElementsByTagName('w:t');
        for (let tIdx = 0; tIdx < textNodes.length; tIdx++) {
          const tNode = textNodes.item(tIdx);
          if (tNode && tNode.textContent) {
            paraText += tNode.textContent;
          }
        }
      }
    }

    const trimmed = paraText.trim();
    if (trimmed.length > 0) {
      paragraphs.push(trimmed);
    }
  }

  return paragraphs;
}
