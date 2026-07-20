import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';
import { parseQuestions, extractParagraphs } from '@/lib/parser';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.docx')) {
      return NextResponse.json(
        { error: 'Only .docx files are accepted' },
        { status: 400 },
      );
    }

    // Read file as buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract markdown text using office-to-markdown to properly parse OMML (Word Math) to LaTeX
    const { docxToMarkdown } = await import('@aidalinfo/office-to-markdown');
    const rawText = await docxToMarkdown(buffer);

    // Extract paragraph array
    const paragraphs = extractParagraphs(rawText);

    // Run the parser
    const parseResult = parseQuestions(paragraphs);

    return NextResponse.json(parseResult);
  } catch (err) {
    console.error('[/api/parse] Error:', err);
    return NextResponse.json(
      { error: 'Failed to parse document', detail: String(err) },
      { status: 500 },
    );
  }
}
