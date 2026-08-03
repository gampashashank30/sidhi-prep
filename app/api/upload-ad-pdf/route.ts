// app/api/upload-ad-pdf/route.ts
// Accepts a PDF file upload (multipart form-data), validates it's a real PDF,
// and returns it as a base64 string along with page count.

import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';

export const runtime = 'nodejs';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Size check
    if (buffer.byteLength > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File too large. Maximum size is 10 MB.` },
        { status: 413 },
      );
    }

    // Validate it's actually a PDF by checking the header
    const header = buffer.slice(0, 5).toString('ascii');
    if (!header.startsWith('%PDF')) {
      return NextResponse.json(
        { error: 'File is not a valid PDF.' },
        { status: 400 },
      );
    }

    // Load with pdf-lib to get page count and confirm parsability
    let pageCount: number;
    try {
      const pdfDoc = await PDFDocument.load(buffer);
      pageCount = pdfDoc.getPageCount();
    } catch {
      return NextResponse.json(
        { error: 'Could not read the PDF. It may be password-protected or corrupted.' },
        { status: 400 },
      );
    }

    // Return base64 + metadata
    const base64 = buffer.toString('base64');

    return NextResponse.json({
      base64,
      pageCount,
      fileName: (file as File).name ?? 'advertisement.pdf',
      sizeKb: Math.round(buffer.byteLength / 1024),
    });
  } catch (err) {
    console.error('[/api/upload-ad-pdf] Error:', err);
    return NextResponse.json(
      { error: 'Failed to process PDF upload', detail: String(err) },
      { status: 500 },
    );
  }
}
