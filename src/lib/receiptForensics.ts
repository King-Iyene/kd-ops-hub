/**
 * Optional, soft-signal receipt forensics. Deliberately kept separate
 * from receipts.ts's hard checks (price plausibility, amount mismatch,
 * duplicate image) — everything here is advisory only:
 *
 *   - hasJpegExif(): informational, never a standalone anomaly trigger.
 *     Missing EXIF is common on completely legitimate photos (WhatsApp,
 *     Telegram, and most messaging apps strip it on their own re-encode),
 *     so treating "no EXIF" as suspicious on its own would flag honest
 *     drivers constantly. It's only ever appended as extra context on a
 *     receipt that another, harder check has already flagged.
 *
 *   - generateElaHeatmap(): an Error Level Analysis preview, rendered
 *     on-demand for a human admin to look at — NOT an automated fraud
 *     signal. Naive automated ELA thresholds false-positive on ordinary
 *     JPEG re-compression (a receipt forwarded through WhatsApp goes
 *     through this completely legitimately) and would trip on this
 *     app's OWN watermark band on every single receipt, since freshly
 *     rendered text necessarily has a different compression history
 *     than the photo around it. A human looking at the heatmap with
 *     context can tell the difference; a threshold cannot.
 */

/**
 * Best-effort check for whether a JPEG carries an EXIF (APP1) segment —
 * a loose proxy for "straight off a camera" vs. a screenshot or an
 * image that's been re-saved/re-shared. Scans only the first 128KB
 * (EXIF lives near the start of the file) for the APP1 marker + "Exif"
 * magic bytes — deliberately simple rather than a full IFD/tag parser,
 * so there's less code that could get a subtle parsing case wrong.
 *
 * Returns null (not false) when the format can't meaningfully carry
 * EXIF (PDF, PNG, WebP) or on any read error — callers must not treat
 * "not applicable" or "couldn't check" the same as "missing".
 */
export async function hasJpegExif(file: File): Promise<boolean | null> {
  if (file.type !== 'image/jpeg' && file.type !== 'image/jpg') return null;
  try {
    const head = await file.slice(0, 131072).arrayBuffer();
    const bytes = new Uint8Array(head);
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null; // not a valid JPEG SOI
    for (let i = 2; i < bytes.length - 8; i++) {
      if (
        bytes[i] === 0xff && bytes[i + 1] === 0xe1 &&
        // bytes[i+2..i+3] are the APP1 segment length — skip them
        bytes[i + 4] === 0x45 && bytes[i + 5] === 0x78 && // "Ex"
        bytes[i + 6] === 0x69 && bytes[i + 7] === 0x66    // "if"
      ) {
        return true;
      }
    }
    return false;
  } catch {
    return null; // a read/parse hiccup must never masquerade as a real signal
  }
}

export interface ElaResult {
  heatmapDataUrl: string;
  width: number;
  height: number;
  avgBrightness: number;
}

/**
 * Renders an Error Level Analysis heatmap: re-compresses the image at a
 * fixed JPEG quality and visualizes the per-pixel difference from the
 * original. Regions that were pasted/edited in tend to stand out because
 * they carry a different compression history than the rest of the photo
 * — but so does anything else that's naturally been re-compressed
 * unevenly (a second WhatsApp hop, a screenshot of a screenshot, this
 * app's own watermark band). This is a visual aid for a human, not a
 * verdict — render it with that framing, never as a pass/fail flag.
 *
 * Throws if the image can't be loaded or the canvas is CORS-tainted
 * (cross-origin images without permissive CORS headers can't be read
 * back as pixel data) — callers should catch and show a graceful
 * "couldn't generate analysis" message rather than a hard failure.
 */
export async function generateElaHeatmap(imageUrl: string, quality = 0.9): Promise<ElaResult> {
  const original = await loadImageElement(imageUrl);
  const width = original.naturalWidth;
  const height = original.naturalHeight;
  if (!width || !height) throw new Error('Image has no dimensions to analyze.');

  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceCtx = sourceCanvas.getContext('2d');
  if (!sourceCtx) throw new Error('Canvas not supported.');
  sourceCtx.drawImage(original, 0, 0);

  // This read is what throws SecurityError if the image is CORS-tainted.
  const sourceData = sourceCtx.getImageData(0, 0, width, height);

  const recompressedBlob: Blob | null = await new Promise((resolve) =>
    sourceCanvas.toBlob(resolve, 'image/jpeg', quality),
  );
  if (!recompressedBlob) throw new Error('Could not re-compress image for comparison.');

  const recompressed = await loadImageElement(URL.createObjectURL(recompressedBlob));
  const compCanvas = document.createElement('canvas');
  compCanvas.width = width;
  compCanvas.height = height;
  const compCtx = compCanvas.getContext('2d');
  if (!compCtx) throw new Error('Canvas not supported.');
  compCtx.drawImage(recompressed, 0, 0);
  const compData = compCtx.getImageData(0, 0, width, height);

  const heatCanvas = document.createElement('canvas');
  heatCanvas.width = width;
  heatCanvas.height = height;
  const heatCtx = heatCanvas.getContext('2d');
  if (!heatCtx) throw new Error('Canvas not supported.');
  const heatData = heatCtx.createImageData(width, height);

  const AMPLIFY = 12;
  let brightnessSum = 0;
  const pixelCount = sourceData.data.length / 4;
  for (let i = 0; i < sourceData.data.length; i += 4) {
    let pxSum = 0;
    for (let c = 0; c < 3; c++) {
      const diff = Math.abs(sourceData.data[i + c] - compData.data[i + c]) * AMPLIFY;
      const clamped = Math.min(255, diff);
      heatData.data[i + c] = clamped;
      pxSum += clamped;
    }
    heatData.data[i + 3] = 255;
    brightnessSum += pxSum / 3;
  }
  heatCtx.putImageData(heatData, 0, 0);

  const avgBrightness = brightnessSum / pixelCount;
  return { heatmapDataUrl: heatCanvas.toDataURL('image/png'), width, height, avgBrightness };
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image.'));
    img.src = src;
  });
}
