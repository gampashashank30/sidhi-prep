import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import type { PDFSettings, CoverSettings, Question } from '@/lib/types';
import { buildHTMLTemplate } from '@/lib/pdfTemplate';
import { renderPDF, prewarmBrowser } from '@/lib/pdfRenderer';
import { processLogoImage } from '@/lib/imageProcessor';

export const runtime = 'nodejs';
export const maxDuration = 120; // PDF generation can take time

// Pre-warm browser in the background when route module loads
prewarmBrowser();

let cachedLogoDataUrl: string | null = null;

async function getLogoDataUrl(): Promise<string | null> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  try {
    const logoPath = path.join(process.cwd(), 'public', 'logo.png');
    const logoBuffer = await readFile(logoPath);
    cachedLogoDataUrl = await processLogoImage(logoBuffer);
    return cachedLogoDataUrl;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      questions: Question[];
      coverSettings: CoverSettings | null;
      settings: PDFSettings;
    };

    const logoDataUrl = await getLogoDataUrl();

    const pdfBuffer = await renderPDF({
      questions: body.questions,
      coverSettings: body.coverSettings,
      logoDataUrl,
      settings: body.settings,
    });

    // Use ArrayBuffer which is a valid BodyInit for NextResponse
    const arrayBuffer = pdfBuffer.buffer.slice(
      pdfBuffer.byteOffset,
      pdfBuffer.byteOffset + pdfBuffer.byteLength,
    ) as ArrayBuffer;

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="siddhi-question-bank.pdf"',
        'Content-Length': String(pdfBuffer.length),
      },
    });
  } catch (err) {
    console.error('[/api/generate-pdf] Error:', err);
    return NextResponse.json(
      { error: 'Failed to generate PDF', detail: String(err) },
      { status: 500 },
    );
  }
}
