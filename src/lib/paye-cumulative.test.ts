import { describe, it, expect } from 'vitest';
import { computeCumulativePaye } from './paye-cumulative';
import { applyTaxBands } from './tax';

/**
 * These tests are written against the regulations' own arithmetic, not
 * against the module's internals: each expectation is a figure derived from
 * the NTA 2025 bands by hand, so a wrong rate or a wrong base fails here
 * rather than moving with the bug.
 */

/** Run a whole tax year through the cumulative method. */
function runYear(monthly: number[]): { perPeriod: number[]; total: number } {
  let chargeableYtd = 0;
  let withheldYtd = 0;
  const perPeriod: number[] = [];

  monthly.forEach((amount, i) => {
    const r = computeCumulativePaye({
      chargeableThisPeriodNgn: amount,
      chargeableYtdNgn: chargeableYtd,
      payeWithheldYtdNgn: withheldYtd,
      periodIndex: i + 1,
    });
    perPeriod.push(r.payeThisPeriodNgn);
    chargeableYtd += amount;
    withheldYtd += r.payeThisPeriodNgn;
  });

  return { perPeriod, total: perPeriod.reduce((a, b) => a + b, 0) };
}

/** What the per-month method in tax.ts withholds over the same year. */
function runYearPerMonth(monthly: number[]): number {
  return monthly.reduce((sum, m) => sum + applyTaxBands(m * 12) / 12, 0);
}

describe('computeCumulativePaye', () => {
  it('matches the per-month method exactly when pay never varies', () => {
    const flat = Array(12).fill(400_000);
    const { total } = runYear(flat);
    expect(total).toBeCloseTo(runYearPerMonth(flat), 0);
    // And it is the true annual liability: 4.8m chargeable.
    expect(total).toBeCloseTo(applyTaxBands(4_800_000), 0);
  });

  it('collects exactly the true annual liability when a bonus is paid', () => {
    const m = Array(12).fill(400_000);
    m[11] += 2_000_000;
    const { total } = runYear(m);
    const trueAnnual = applyTaxBands(6_800_000);

    expect(total).toBeCloseTo(trueAnnual, 0);
    // The per-month method takes ~48,333 more than is owed.
    expect(runYearPerMonth(m) - trueAnnual).toBeGreaterThan(48_000);
  });

  it('stops over-taxing the low earner a bonus pushes past the exemption', () => {
    // NGN 60k/month is NGN 720k a year — under the NGN 800k exemption, so
    // nil tax. A NGN 300k bonus makes the year NGN 1.02m: only the NGN 220k
    // above the exemption is taxable, at 15% = NGN 33,000.
    const m = Array(12).fill(60_000);
    m[11] += 300_000;

    const { total } = runYear(m);
    expect(total).toBeCloseTo(33_000, 0);

    // The per-month method takes 43% more than that.
    expect(runYearPerMonth(m)).toBeGreaterThan(47_000);
  });

  it('unwinds a mid-year bonus over the rest of the year', () => {
    const m = Array(12).fill(400_000);
    m[5] += 2_000_000; // June

    const { perPeriod, total } = runYear(m);

    // June is heavier than May, then the months after it fall back below the
    // pre-bonus figure as the projection settles.
    expect(perPeriod[5]).toBeGreaterThan(perPeriod[4]);
    expect(perPeriod[11]).toBeLessThan(perPeriod[5]);
    expect(total).toBeCloseTo(applyTaxBands(6_800_000), 0);
  });

  it('reports a credit rather than a negative deduction', () => {
    // A big month one, then nothing: by period 2 the projection collapses and
    // too much has already been withheld.
    const first = computeCumulativePaye({
      chargeableThisPeriodNgn: 3_000_000,
      periodIndex: 1,
    });
    const second = computeCumulativePaye({
      chargeableThisPeriodNgn: 0,
      chargeableYtdNgn: 3_000_000,
      payeWithheldYtdNgn: first.payeThisPeriodNgn,
      periodIndex: 2,
    });

    expect(second.payeThisPeriodNgn).toBe(0);
    expect(second.creditCarriedNgn).toBeGreaterThan(0);
  });

  it('taxes nothing when the year stays inside the exemption', () => {
    const { total } = runYear(Array(12).fill(60_000));
    expect(total).toBe(0);
  });

  it('clamps a period index outside the tax year instead of projecting from it', () => {
    const low = computeCumulativePaye({ chargeableThisPeriodNgn: 400_000, periodIndex: 0 });
    const high = computeCumulativePaye({ chargeableThisPeriodNgn: 400_000, periodIndex: 99 });

    expect(low.projectedAnnualChargeableNgn).toBe(4_800_000);  // treated as period 1
    expect(high.projectedAnnualChargeableNgn).toBe(400_000);   // treated as period 12
  });

  it('handles a zero-pay month without dividing by zero', () => {
    const r = computeCumulativePaye({
      chargeableThisPeriodNgn: 0,
      chargeableYtdNgn: 0,
      payeWithheldYtdNgn: 0,
      periodIndex: 3,
    });
    expect(r.payeThisPeriodNgn).toBe(0);
    expect(r.projectedAnnualChargeableNgn).toBe(0);
  });
});
