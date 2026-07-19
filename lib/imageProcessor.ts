// lib/imageProcessor.ts
// Image processing utilities using sharp

// Note: sharp is a native module. Import it dynamically to avoid issues in
// environments where it may not be available at module load time.

export interface ProcessedImage {
  dataUrl: string;  // base64 data URL: "data:image/jpeg;base64,..."
  width: number;
  height: number;
}

/**
 * Process a cover image buffer:
 * - Resize/crop to A4 proportion (210:297 ≈ 0.707)
 * - Compress to JPEG quality 85
 * - Returns base64 data URL
 */
export async function processCoverImage(
  buffer: Buffer,
  mimeType: string,
  focalX = 0.5,
  focalY = 0.5,
): Promise<ProcessedImage> {
  const sharp = (await import('sharp')).default;

  // A4 at 150dpi (good quality without huge file size)
  const TARGET_W = 1240;
  const TARGET_H = 1754;

  const processed = await sharp(buffer)
    .resize(TARGET_W, TARGET_H, {
      fit: 'cover',
      position: sharp.gravity.center, // focalX/Y handled by CSS; sharp crops center
    })
    .jpeg({ quality: 85, progressive: true })
    .toBuffer({ resolveWithObject: true });

  const base64 = processed.data.toString('base64');
  return {
    dataUrl: `data:image/jpeg;base64,${base64}`,
    width: processed.info.width,
    height: processed.info.height,
  };
}

/**
 * Process a logo PNG for use as watermark and corner icon.
 * - Resize to 500px (longest edge)
 * - Keep transparency (output as PNG)
 */
export async function processLogoImage(buffer: Buffer): Promise<string> {
  const sharp = (await import('sharp')).default;

  const processed = await sharp(buffer)
    .resize(500, 500, { fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 8 })
    .toBuffer();

  return `data:image/png;base64,${processed.toString('base64')}`;
}

/**
 * Process an ad thumbnail:
 * - Validate aspect ratio (should be ~16:9)
 * - Letterbox/crop to exactly 16:9 if needed
 * - Compress to JPEG quality 85
 * - Returns data URL + whether aspect ratio warning should be shown
 */
export async function processAdImage(buffer: Buffer): Promise<{
  dataUrl: string;
  aspectWarning: boolean;
}> {
  const sharp = (await import('sharp')).default;

  const meta = await sharp(buffer).metadata();
  const w = meta.width ?? 1920;
  const h = meta.height ?? 1080;
  const ratio = w / h;
  const TARGET_RATIO = 16 / 9;
  const aspectWarning = Math.abs(ratio - TARGET_RATIO) / TARGET_RATIO > 0.05;

  // Letterbox to 16:9
  const processed = await sharp(buffer)
    .resize(1920, 1080, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .jpeg({ quality: 85 })
    .toBuffer();

  return {
    dataUrl: `data:image/jpeg;base64,${processed.toString('base64')}`,
    aspectWarning,
  };
}

/**
 * Process any infographic image:
 * - Resize to max 1200px wide, keep aspect ratio
 * - Compress
 */
export async function processInfographic(buffer: Buffer): Promise<string> {
  const sharp = (await import('sharp')).default;

  const processed = await sharp(buffer)
    .resize(1200, undefined, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();

  return `data:image/jpeg;base64,${processed.toString('base64')}`;
}
