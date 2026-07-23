import { NextRequest, NextResponse } from 'next/server';
import { parseQuestions, extractParagraphs } from '@/lib/parser';
import type { ParseResult } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function parseOneFile(file: File): Promise<ParseResult> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { docxToMarkdown } = await import('@aidalinfo/office-to-markdown');
  const rawText = await docxToMarkdown(buffer);
  const paragraphs = extractParagraphs(rawText);
  return parseQuestions(paragraphs);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    // Support both single file (legacy) and multiple files
    const rawFiles = formData.getAll('file');
    const files = rawFiles.filter((f): f is File => f instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Validate all files are .docx
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.docx')) {
        return NextResponse.json(
          { error: `"${file.name}" is not a .docx file. Only Word documents are accepted.` },
          { status: 400 },
        );
      }
    }

    // Parse each file independently
    const results: ParseResult[] = await Promise.all(files.map(parseOneFile));

    if (files.length === 1) {
      // Single file — return as-is (backward compatible)
      return NextResponse.json(results[0]);
    }

    // Multiple files — merge and renumber questions sequentially
    let questionOffset = 0;
    const mergedQuestions = results.flatMap((r) => {
      const renumbered = r.questions.map((q, idx) => ({
        ...q,
        number: questionOffset + idx + 1,
      }));
      questionOffset += r.questions.length;
      return renumbered;
    });

    // Merge errors, adjusting question numbers with offset info in message
    let errorOffset = 0;
    const mergedErrors = results.flatMap((r, fileIdx) => {
      const adjusted = r.errors.map((e) => ({
        questionNumber:
          e.questionNumber != null ? e.questionNumber + errorOffset : null,
        message: files.length > 1 ? `[${files[fileIdx].name}] ${e.message}` : e.message,
      }));
      errorOffset += r.questions.length;
      return adjusted;
    });

    return NextResponse.json({ questions: mergedQuestions, errors: mergedErrors });
  } catch (err) {
    console.error('[/api/parse] Error:', err);
    return NextResponse.json(
      { error: 'Failed to parse document', detail: String(err) },
      { status: 500 },
    );
  }
}
