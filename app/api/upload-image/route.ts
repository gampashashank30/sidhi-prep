import { NextRequest, NextResponse } from 'next/server';
import { processCoverImage, processAdImage, processInfographic } from '@/lib/imageProcessor';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const type = (formData.get('type') as string) ?? 'cover';
    const focalX = parseFloat((formData.get('focalX') as string) ?? '0.5');
    const focalY = parseFloat((formData.get('focalY') as string) ?? '0.5');

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || 'image/jpeg';

    let result: { dataUrl: string; aspectWarning?: boolean; width?: number; height?: number };

    if (type === 'cover') {
      const processed = await processCoverImage(buffer, mimeType, focalX, focalY);
      result = processed;
    } else if (type === 'ad') {
      result = await processAdImage(buffer);
    } else if (type === 'infographic') {
      const dataUrl = await processInfographic(buffer);
      result = { dataUrl };
    } else {
      return NextResponse.json({ error: 'Unknown image type' }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('[/api/upload-image] Error:', err);
    return NextResponse.json(
      { error: 'Failed to process image', detail: String(err) },
      { status: 500 },
    );
  }
}
