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
 * Cross-checks amount vs litres against a blended benchmark pump price
 * (60% fleet rolling median + 40% company_settings fallback). Flags a
 * >25% divergence either direction.
 */
export function checkPumpPrice(
  amountNgn: number,
  litres: number,
  benchmarkPricePerLitre: number,
): PumpPriceCheck {
  if (amountNgn == null || litres == null || litres <= 0 || benchmarkPricePerLitre == null || benchmarkPricePerLitre <= 0) {
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

/**
 * Computes a blended fuel-price benchmark from two sources:
 *   1. Fleet median — rolling 30-day median of implied ₦/L from your own
 *      fuel receipts (amount_ngn / litres_filled). Naturally adapts to
 *      actual station prices your drivers pay.
 *   2. Manual/external — the company_settings.fuel_price_ngn_per_litre
 *      value (set manually or by a future auto-updater).
 *
 * When both are available the result is a weighted average (60% fleet,
 * 40% external) so that the fleet's real-world data dominates but an
 * external reference anchors it against collusion or market shocks.
 * When only one source is available, it's used alone.
 */
export function blendBenchmark(
  fleetMedian: number | null,
  externalPrice: number | null,
): number | null {
  if (fleetMedian && externalPrice) {
    return Math.round(fleetMedian * 0.6 + externalPrice * 0.4);
  }
  return fleetMedian || externalPrice || null;
}

/** Median of a numeric array (returns null for empty input). */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface AmountDivergenceCheck {
  flagged: boolean;
  reason: string | null;
}

/**
 * Flags when the amount confirmed on the receipt differs sharply from what
 * was originally requested — catches a typo'd request amount, or a driver
 * padding the receipt total after the transfer already went out.
 */
export function checkReceiptRequestDivergence(
  receiptAmountNgn: number,
  requestedAmountNgn: number,
): AmountDivergenceCheck {
  if (!receiptAmountNgn || !requestedAmountNgn) return { flagged: false, reason: null };
  const deviationPct = Math.abs(receiptAmountNgn - requestedAmountNgn) / requestedAmountNgn;
  if (deviationPct > 0.2) {
    const direction = receiptAmountNgn > requestedAmountNgn ? 'more' : 'less';
    return {
      flagged: true,
      reason: `Receipt amount ₦${receiptAmountNgn.toLocaleString()} is ${Math.round(deviationPct * 100)}% ${direction} than the ₦${requestedAmountNgn.toLocaleString()} requested`,
    };
  }
  return { flagged: false, reason: null };
}

/**
 * Flags a receipt whose printed date is much older than today — a common
 * pattern for recycled or backdated receipts, and standard practice on
 * Expensify/Ramp/Brex. Deliberately generous (14 days) since legitimate
 * delayed submission is common for drivers who don't upload same-day, and
 * OCR'd handwritten dates are unreliable enough that a tight threshold
 * would false-positive constantly.
 */
export function checkStaleReceipt(receiptDate: string, todayIso: string): string | null {
  const receipt = new Date(receiptDate + 'T00:00:00Z').getTime();
  const today = new Date(todayIso + 'T00:00:00Z').getTime();
  if (isNaN(receipt) || isNaN(today)) return null;
  const daysOld = Math.round((today - receipt) / (1000 * 60 * 60 * 24));
  if (daysOld > 14) {
    return `Receipt is dated ${daysOld} days ago — please confirm this wasn't already reimbursed`;
  }
  if (daysOld < -1) {
    return `Receipt date is in the future — please check it was read correctly`;
  }
  return null;
}

export interface CostOutlierCheck {
  flagged: boolean;
  reason: string | null;
}

/**
 * Flags a repair cost that's a steep outlier vs. the fleet's own historical
 * median for the same service type — e.g. a "brake pad replacement" quoted
 * at 4x what every other brake job has cost. Needs at least 3 prior data
 * points for that service type before it trusts the median enough to flag
 * anything; without that floor, a single legitimately expensive repair
 * would become "the benchmark" and everything after it would look normal.
 * No external pricing data required — this is self-referential, same as
 * the fleet-median half of the fuel price benchmark.
 */
export function checkRepairCostOutlier(
  amountNgn: number,
  serviceTypeMedian: number | null,
  priorSampleCount: number,
): CostOutlierCheck {
  if (!amountNgn || !serviceTypeMedian || priorSampleCount < 3) {
    return { flagged: false, reason: null };
  }
  const deviationPct = (amountNgn - serviceTypeMedian) / serviceTypeMedian;
  if (deviationPct > 0.75) {
    return {
      flagged: true,
      reason: `₦${amountNgn.toLocaleString()} is ${Math.round(deviationPct * 100)}% above the ₦${serviceTypeMedian.toLocaleString()} median this fleet has paid for this service type`,
    };
  }
  return { flagged: false, reason: null };
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

// ---------------------------------------------------------------------------
// Enhanced anomaly checks — cross-validation, capacity, frequency, OCR trust
// ---------------------------------------------------------------------------

export interface MathMismatchCheck {
  flagged: boolean;
  reason: string | null;
}

/**
 * Verifies Amount ≈ Litres × UnitPrice. Catches receipts where the
 * numbers don't add up — either a fat-finger or intentional inflation.
 * Tolerance is 5% to absorb rounding on handwritten/OCR'd values.
 */
export function checkMathMismatch(
  amountNgn: number,
  litres: number,
  unitPriceNgn: number,
): MathMismatchCheck {
  if (!amountNgn || !litres || !unitPriceNgn || litres <= 0 || unitPriceNgn <= 0) {
    return { flagged: false, reason: null };
  }
  const expected = litres * unitPriceNgn;
  const deviation = Math.abs(amountNgn - expected) / expected;
  if (deviation > 0.05) {
    return {
      flagged: true,
      reason: `Amount ₦${amountNgn.toLocaleString()} doesn't match ${litres}L × ₦${unitPriceNgn.toLocaleString()}/L = ₦${Math.round(expected).toLocaleString()} (${Math.round(deviation * 100)}% off)`,
    };
  }
  return { flagged: false, reason: null };
}

export interface TankOverflowCheck {
  flagged: boolean;
  reason: string | null;
}

/**
 * Flags when litres claimed exceed the vehicle's tank capacity. Common
 * fraud vector: driver claims 80L on a 55L tank.
 */
export function checkTankOverflow(
  litresClaimed: number,
  tankCapacityLitres: number | null,
  currentFuelLitres: number | null,
): TankOverflowCheck {
  if (!litresClaimed || litresClaimed <= 0 || !tankCapacityLitres || tankCapacityLitres <= 0) {
    return { flagged: false, reason: null };
  }
  const headroom = tankCapacityLitres - (currentFuelLitres || 0);
  if (litresClaimed > tankCapacityLitres) {
    return {
      flagged: true,
      reason: `${litresClaimed}L exceeds the vehicle's ${tankCapacityLitres}L tank capacity`,
    };
  }
  if (currentFuelLitres != null && currentFuelLitres > 0 && litresClaimed > headroom * 1.15) {
    return {
      flagged: true,
      reason: `${litresClaimed}L exceeds the ~${Math.round(headroom)}L headroom (tank: ${tankCapacityLitres}L, current: ~${Math.round(currentFuelLitres)}L)`,
    };
  }
  return { flagged: false, reason: null };
}

export interface FrequencyCheck {
  flagged: boolean;
  reason: string | null;
}

/**
 * Flags when a driver requests fuel suspiciously often. Two sub-checks:
 *   1. More than 2 requests in the same calendar day.
 *   2. More than 6 requests in the past 7 days.
 * Thresholds are generous because some fleets genuinely refuel daily
 * during high-activity periods.
 */
export function checkFuelRequestFrequency(
  recentRequestTimestamps: string[],
  now: Date,
): FrequencyCheck {
  if (!recentRequestTimestamps.length) return { flagged: false, reason: null };

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayCount = recentRequestTimestamps.filter(
    (ts) => new Date(ts).getTime() >= todayStart.getTime(),
  ).length;

  if (todayCount >= 2) {
    return {
      flagged: true,
      reason: `${todayCount + 1} fuel requests today — unusually high for a single driver`,
    };
  }

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const weekCount = recentRequestTimestamps.filter(
    (ts) => new Date(ts).getTime() >= sevenDaysAgo.getTime(),
  ).length;

  if (weekCount >= 6) {
    return {
      flagged: true,
      reason: `${weekCount + 1} fuel requests in the past 7 days — please verify consumption`,
    };
  }
  return { flagged: false, reason: null };
}

export interface OcrManualMismatchCheck {
  flagged: boolean;
  reason: string | null;
}

/**
 * Flags when the OCR-extracted amount differs significantly from what the
 * driver manually entered. If OCR reads "96607" but the driver types "50000",
 * something is wrong on one side.
 */
export function checkOcrManualMismatch(
  ocrAmount: number | null,
  manualAmount: number,
): OcrManualMismatchCheck {
  if (!ocrAmount || !manualAmount || ocrAmount <= 0 || manualAmount <= 0) {
    return { flagged: false, reason: null };
  }
  const deviation = Math.abs(ocrAmount - manualAmount) / Math.max(ocrAmount, manualAmount);
  if (deviation > 0.15) {
    return {
      flagged: true,
      reason: `OCR read ₦${ocrAmount.toLocaleString()} but ₦${manualAmount.toLocaleString()} was entered (${Math.round(deviation * 100)}% difference)`,
    };
  }
  return { flagged: false, reason: null };
}

// ---------------------------------------------------------------------------
// Severity scoring — turns a bag of flags into a single escalation level.
// ---------------------------------------------------------------------------

export type AnomalySeverity = 'low' | 'medium' | 'high' | 'critical';

const SEVERITY_WEIGHTS: Record<string, number> = {
  duplicate_receipt: 5,
  math_mismatch: 4,
  tank_overflow: 4,
  ocr_manual_mismatch: 3,
  price_divergence: 3,
  amount_mismatch: 3,
  fuel_frequency: 2,
  stale_receipt: 2,
  odometer_regression: 2,
  route_efficiency: 3,
  ocr_low_confidence: 1,
};

/**
 * Scores a set of anomaly flags and returns a severity level.
 *   - critical (≥8 points or duplicate_receipt present): immediate WhatsApp + email
 *   - high (≥5 points): email + push
 *   - medium (≥3 points): push
 *   - low (<3 points): in-app only
 */
export interface RouteEfficiencyCheck {
  flagged: boolean;
  reason: string | null;
  expectedLitres: number | null;
}

/**
 * Compares the litres claimed on a fuel receipt against what the vehicle
 * should have consumed based on distance driven since the last refuel.
 * Flags when actual consumption is >50% more than expected — indicating
 * either a fuel leak, off-route driving, or inflated litres.
 */
export function checkRouteEfficiency(
  litresClaimed: number,
  kmSinceLastRefuel: number,
  fuelConsumptionRateLkm: number,
): RouteEfficiencyCheck {
  if (!litresClaimed || litresClaimed <= 0 || !kmSinceLastRefuel || kmSinceLastRefuel <= 0 || !fuelConsumptionRateLkm || fuelConsumptionRateLkm <= 0) {
    return { flagged: false, reason: null, expectedLitres: null };
  }
  const expected = kmSinceLastRefuel * fuelConsumptionRateLkm;
  if (expected <= 0) return { flagged: false, reason: null, expectedLitres: null };

  const overConsumption = (litresClaimed - expected) / expected;
  if (overConsumption > 0.5) {
    return {
      flagged: true,
      reason: `${litresClaimed}L claimed but only ~${Math.round(expected)}L expected for ${Math.round(kmSinceLastRefuel)}km driven (${Math.round(overConsumption * 100)}% over)`,
      expectedLitres: Math.round(expected * 10) / 10,
    };
  }
  return { flagged: false, reason: null, expectedLitres: Math.round(expected * 10) / 10 };
}

export function scoreAnomalySeverity(flagTypes: string[]): AnomalySeverity {
  if (flagTypes.length === 0) return 'low';
  if (flagTypes.includes('duplicate_receipt')) return 'critical';

  let total = 0;
  for (const t of flagTypes) {
    total += SEVERITY_WEIGHTS[t] || 1;
  }
  if (total >= 8) return 'critical';
  if (total >= 5) return 'high';
  if (total >= 3) return 'medium';
  return 'low';
}
