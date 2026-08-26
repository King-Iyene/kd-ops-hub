// Money & FX primitives for the finance engine.
//
// CONVENTION BOUNDARY — two money representations coexist in this codebase:
//
//   A) INTEGER KOBO (this module) — used by PartnerPayCalculator,
//      ReferralCommissions, talent-cost, fx-exposure. All arithmetic is on
//      integer minor units; toMinor()/toMajor() convert at the boundary.
//
//   B) FLOAT NAIRA (everywhere else) — payroll (tax.ts, Payroll.tsx,
//      payslip.ts), statutory exports, batch payments, DB columns
//      (numeric type). Values are JS floats representing whole naira;
//      sub-naira precision is rounded at the payslip level.
//
//   Do NOT mix: never pass a float-naira value into convertMinor/
//   multiplyMinor (they assert integer), and never pass a kobo integer
//   into computePayslip or statutory exporters.
//
// RULES (do not break — this is where finance bugs live):
//   1. Represent money as an INTEGER number of minor units (USD cents, NGN kobo)
//      plus an explicit currency. Never do arithmetic on float "major" amounts.
//   2. USD and NGN both have 2 decimal places (100 minor units per major). The
//      helpers below assume 2dp; assert if given anything else.
//   3. Convert with an EXPLICIT rate (quote units per 1 base). Because both
//      sides are 2dp, conversion is exact in minor units:
//         quoteMinor = round(baseMinor × rate)
//      e.g. $100 = 10000 cents; at 1500 NGN/USD → 10000 × 1500 = 15,000,000 kobo
//      = ₦150,000.00 — no divide-then-multiply float drift.
//   4. Rounding is half-away-from-zero (standard cash rounding), to the kobo.
//   5. The rate used MUST be snapshotted onto whatever record stores the result.
//      These helpers never fetch a rate; callers pass the locked rate in.

import { formatNaira } from '@/lib/format';

export const MINOR_PER_MAJOR = 100; // USD cents / NGN kobo — both 2dp

export type CurrencyCode = 'USD' | 'NGN';

/** Round half away from zero to the nearest integer (cash rounding). */
export function roundHalfAwayFromZero(n: number): number {
  return n < 0 ? -Math.round(-n) : Math.round(n);
}

/** Major units (e.g. 199.99 dollars) → integer minor units (19999 cents). */
export function toMinor(major: number): number {
  if (!Number.isFinite(major)) throw new Error('toMinor: amount is not finite');
  // Scale then round to kill float noise like 19.99 * 100 = 1998.9999999998.
  return roundHalfAwayFromZero(major * MINOR_PER_MAJOR);
}

/** Integer minor units (19999) → major units (199.99). For display/boundaries. */
export function toMajor(minor: number): number {
  return minor / MINOR_PER_MAJOR;
}

/**
 * Convert an integer minor amount in `base` to integer minor units in `quote`,
 * using an explicit rate (quote units per 1 base). Both currencies must be 2dp.
 * Returns the converted minor amount AND the rate used, so callers can snapshot.
 */
export function convertMinor(
  baseMinor: number,
  rate: number,
): { minor: number; rate: number } {
  if (!Number.isInteger(baseMinor)) {
    throw new Error('convertMinor: baseMinor must be an integer (minor units)');
  }
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('convertMinor: rate must be a positive number');
  }
  return { minor: roundHalfAwayFromZero(baseMinor * rate), rate };
}

/** USD cents → NGN kobo at an explicit NGN-per-USD rate. */
export function usdMinorToNgnMinor(usdMinor: number, ngnPerUsd: number): number {
  return convertMinor(usdMinor, ngnPerUsd).minor;
}

/** Multiply a per-unit minor amount by an integer count (e.g. active partners). */
export function multiplyMinor(perUnitMinor: number, count: number): number {
  if (!Number.isInteger(perUnitMinor)) {
    throw new Error('multiplyMinor: perUnitMinor must be an integer (minor units)');
  }
  if (!Number.isInteger(count) || count < 0) {
    throw new Error('multiplyMinor: count must be a non-negative integer');
  }
  return perUnitMinor * count;
}

/** Sum a list of integer minor amounts (exact). */
export function sumMinor(amounts: number[]): number {
  return amounts.reduce((acc, m) => acc + m, 0);
}

export type TierMode = 'marginal' | 'whole';

/**
 * Tiered per-account commission (affiliate recurring pay), in minor units.
 *
 * An affiliate earns `baseMinor` per active account until they reach `threshold`
 * accounts, after which `tier2Minor` (the increased rate) applies:
 *   - 'marginal': only the accounts ABOVE the threshold earn the increased rate
 *     (accounts 1..threshold stay at base). Like tax brackets.
 *   - 'whole': once threshold is reached, EVERY account earns the increased rate.
 *
 * Pure: it uses exactly the rates given. Callers decide policy (e.g. treating an
 * unset tier2 of 0 as "no increase" by passing baseMinor as tier2Minor).
 */
export function tieredCommissionMinor(
  count: number,
  baseMinor: number,
  tier2Minor: number,
  threshold: number,
  mode: TierMode,
): number {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error('tieredCommissionMinor: count must be a non-negative integer');
  }
  if (!Number.isInteger(threshold) || threshold < 0) {
    throw new Error('tieredCommissionMinor: threshold must be a non-negative integer');
  }
  if (!Number.isInteger(baseMinor) || !Number.isInteger(tier2Minor)) {
    throw new Error('tieredCommissionMinor: rates must be integers (minor units)');
  }
  if (mode === 'whole') {
    return multiplyMinor(count >= threshold ? tier2Minor : baseMinor, count);
  }
  // marginal
  const atBase = Math.min(count, threshold);
  const atTier2 = Math.max(count - threshold, 0);
  return multiplyMinor(baseMinor, atBase) + multiplyMinor(tier2Minor, atTier2);
}

// ── Display ──────────────────────────────────────────────────────────────────

/** "$1,234.56" from integer USD cents. */
export function formatUsdMinor(usdMinor: number): string {
  return `$${toMajor(usdMinor).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "USD 1,234.56" — institutional/auditable form (ISO code, no glyph). */
export function formatUsdCodeMinor(usdMinor: number): string {
  return `USD ${toMajor(usdMinor).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "₦150,000.00" from integer NGN kobo (reuses the app's Naira formatter). */
export function formatNgnMinor(ngnMinor: number): string {
  return formatNaira(toMajor(ngnMinor));
}

/** Render a stored FX rate, e.g. "1 USD = ₦1,500.00". */
export function formatRate(base: CurrencyCode, quote: CurrencyCode, rate: number): string {
  const q = rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const glyph = quote === 'NGN' ? '₦' : quote === 'USD' ? '$' : '';
  return `1 ${base} = ${glyph}${q}`;
}
