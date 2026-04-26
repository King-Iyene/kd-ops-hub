/**
 * Client-side image compression for upload sites (receipts, fuel photos,
 * IDs, avatars). Cuts file size 5-10× without visible quality loss for
 * the kinds of images we accept.
 *
 * Safe to call on any File:
 *   - Non-image files (PDFs, etc.) are returned unchanged.
 *   - GIF and SVG are skipped (animation / vector preservation).
 *   - Files already under MIN_BYTES_TO_COMPRESS are returned unchanged.
 *   - On any encoding error, the original file is returned.
 *
 * Compression is enabled by default and can be toggled in
 * Settings → Data Retention. The setting is stored in localStorage so
 * it's per-browser, not per-user — change once on the device used to
 * upload, and it sticks.
 */

const STORAGE_KEY = 'kd_image_compression_enabled';
const MIN_BYTES_TO_COMPRESS = 200 * 1024; // 200 KB

export interface CompressOptions {
  /** Longest-side cap in px. Default 1600 (4K-screen-friendly). */
  maxDimension?: number;
  /** JPEG quality 0-1. Default 0.82 (visually lossless for receipts). */
  quality?: number;
}

export function isImageCompressionEnabled(): boolean {
  // Default ON — user has to opt out explicitly.
  return localStorage.getItem(STORAGE_KEY) !== 'false';
}

export function setImageCompressionEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY, String(enabled));
}

export async function compressImage(
  file: File,
  opts: CompressOptions = {},
): Promise<File> {
  if (!isImageCompressionEnabled()) return file;
  if (!file.type.startsWith('image/')) return file;
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  if (file.size < MIN_BYTES_TO_COMPRESS) return file;

  const maxDim = opts.maxDimension ?? 1600;
  const quality = opts.quality ?? 0.82;

  try {
    const bitmap = await createBitmap(file);
    const { width, height } = scaleDown(bitmap.width, bitmap.height, maxDim);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap as any, 0, 0, width, height);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality),
    );
    if (!blob || blob.size >= file.size) return file; // bigger than original — keep original

    const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() });
  } catch (err) {
    console.warn('[image-compression] falling back to original:', err);
    return file;
  }
}

async function createBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    return await createImageBitmap(file);
  }
  // Older browsers: fall back to <img> + object URL.
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

function scaleDown(w: number, h: number, max: number): { width: number; height: number } {
  if (w <= max && h <= max) return { width: w, height: h };
  const ratio = Math.min(max / w, max / h);
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}
