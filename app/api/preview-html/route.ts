import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import type { PDFSettings, CoverSettings, Question } from '@/lib/types';
import { buildHTMLTemplate } from '@/lib/pdfTemplate';
import { processLogoImage } from '@/lib/imageProcessor';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Cache the processed logo to avoid re-processing on every preview request
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
      previewQuestionIndex?: number;
    };

    const logoDataUrl = await getLogoDataUrl();

    const html = buildHTMLTemplate({
      questions: body.questions,
      coverSettings: body.coverSettings,
      logoDataUrl,
      settings: body.settings,
      previewMode: true,
      previewQuestionIndex: body.previewQuestionIndex ?? 0,
    });

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[/api/preview-html] Error:', err);
    return NextResponse.json(
      { error: 'Failed to generate preview', detail: String(err) },
      { status: 500 },
    );
  }
}
