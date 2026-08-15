import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import type { PDFSettings, CoverSettings, Question } from '@/lib/types';
import { buildHTMLTemplate } from '@/lib/pdfTemplate';
import { renderPDF, prewarmBrowser } from '@/lib/pdfRenderer';
import { processLogoImage } from '@/lib/imageProcessor';

export const runtime = 'nodejs';
export const maxDuration = 120; // PDF generation can take time

// Increase body size limit for large question sets with embedded images
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

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
    // Support both JSON (fetch path) and form-encoded (mobile hidden-form path)
    const contentType = req.headers.get('content-type') ?? '';
    let body: {
      questions: Question[];
      coverSettings: CoverSettings | null;
      settings: PDFSettings;
      suppressTopicHeadings?: boolean;
      analyticsCharts?: { donut: boolean; pie: boolean; column: boolean; breakdown: boolean };
    };

    if (contentType.includes('application/x-www-form-urlencoded')) {
      // Hidden form POST — payload arrives as the 'payload' field (JSON string)
      const formData = await req.formData();
      const raw = formData.get('payload');
      if (typeof raw !== 'string') throw new Error('Missing payload field in form data');
      body = JSON.parse(raw);
    } else {
      // Standard fetch/JSON path
      body = await req.json();
    }

    const logoDataUrl = await getLogoDataUrl();

    const pdfBuffer = await renderPDF({
      questions: body.questions,
      coverSettings: body.coverSettings,
      logoDataUrl,
      settings: body.settings,
      suppressTopicHeadings: body.suppressTopicHeadings,
      analyticsCharts: body.analyticsCharts,
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
