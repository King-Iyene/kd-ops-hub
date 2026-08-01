/**
 * Shared helpers for the Fleet receipt-accountability module (fuel +
 * repair receipts). Two concerns live here:
 *
 *   1. Tamper-evidence — every receipt is watermarked client-side with
 *      the driver's name, a timestamp, and GPS (when available), then
 *      hashed. The hash is stored on the DB row at upload time; if the
 *      stored image is ever swapped out from under the URL, re-hashing
 *      it later won't match, which is enough to flag for review.
 *
 *   2. Cheap anomaly checks — no AI, no API cost. A pump-price sanity
 *      check and an odometer-must-increase check catch the bulk of
 *      fat-finger and inflated-amount mistakes for free.
 */

/** SHA-256 of a File's bytes, as a lowercase hex string. */
export async function hashFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface WatermarkInfo {
  driverName: string;
  timestamp?: Date;
  gpsText?: string | null;
}

/**
 * Burns a small caption band (driver name, timestamp, GPS) into the
 * bottom of a receipt photo. Non-image files pass through unchanged.
 * Falls back to the original file on any canvas error — watermarking is
 * a nice-to-have, never a reason to block an upload.
 */
export async function watermarkImage(file: File, info: WatermarkInfo): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0);

    const lines = [
      info.driverName,
      (info.timestamp ?? new Date()).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }),
      info.gpsText || null,
    ].filter((l): l is string => !!l);

    if (lines.length > 0) {
      const fontSize = Math.max(14, Math.round(canvas.width * 0.026));
      const lineHeight = Math.round(fontSize * 1.35);
      const padY = Math.round(fontSize * 0.6);
      const bandHeight = lines.length * lineHeight + padY * 2;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(0, canvas.height - bandHeight, canvas.width, bandHeight);

      ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'top';
      lines.forEach((line, i) => {
        ctx.fillText(line, Math.round(canvas.width * 0.02), canvas.height - bandHeight + padY + i * lineHeight);
      });
    }

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.9),
    );
    if (!blob) return file;
    const ext = file.name.split('.').pop() || 'jpg';
    const name = file.name.replace(new RegExp(`\\.${ext}$`), '') + '-wm.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export interface PumpPriceCheck {
  flagged: boolean;
  reason: string | null;
  impliedPricePerLitre: number | null;
}

/**
 * Cross-checks amount vs litres against a benchmark pump price
 * (company_settings.fuel_price_ngn_per_litre). Flags a >25% divergence
 * either direction — wide enough to tolerate premium/discount stations
 * and rounding, tight enough to catch typos and inflated claims.
 */
export function checkPumpPrice(
  amountNgn: number,
  litres: number,
  benchmarkPricePerLitre: number,
): PumpPriceCheck {
  if (!amountNgn || !litres || litres <= 0 || !benchmarkPricePerLitre) {
    return { flagged: false, reason: null, impliedPricePerLitre: null };
  }
  const implied = amountNgn / litres;
  const deviationPct = Math.abs(implied - benchmarkPricePerLitre) / benchmarkPricePerLitre;
  if (deviationPct > 0.25) {
    const direction = implied > benchmarkPricePerLitre ? 'above' : 'below';
    return {
      flagged: true,
      reason: `Implied price ₦${implied.toFixed(0)}/L is ${Math.round(deviationPct * 100)}% ${direction} the ₦${benchmarkPricePerLitre.toFixed(0)}/L benchmark`,
      impliedPricePerLitre: implied,
    };
  }
  return { flagged: false, reason: null, impliedPricePerLitre: implied };
}

/** True when a new odometer reading is implausible relative to the last known one. */
export function checkOdometerRegression(newOdometer: number, lastKnownOdometer: number | null): string | null {
  if (lastKnownOdometer == null) return null;
  if (newOdometer < lastKnownOdometer) {
    return `Odometer (${newOdometer.toLocaleString()} km) is lower than the last recorded reading (${lastKnownOdometer.toLocaleString()} km)`;
  }
  if (newOdometer - lastKnownOdometer > 3000) {
    return `Odometer jumped ${(newOdometer - lastKnownOdometer).toLocaleString()} km since the last reading — please confirm`;
  }
  return null;
}
