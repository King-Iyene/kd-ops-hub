import { describe, it, expect } from 'vitest';
import {
  computeDiscretionaryCapFactor,
  capDiscretionaryAmount,
  createDiscretionaryAllocator,
} from './payroll-deductions';
import { computePayslip } from './tax';

/**
 * Regression coverage for the P0-4 fix: discretionary deductions (recurring
 * deductions/loans, advance/EWA repayments, one-off deduction adjustments)
 * must never be recorded as "collected" beyond what a payslip's net pay
 * actually had room to withhold after mandatory statutory reductions.
 */

describe('computeDiscretionaryCapFactor', () => {
  it('does not cap when requested deductions fit within what is available', () => {
    const r = computeDiscretionaryCapFactor(100_000, 20_000, 30_000);
    expect(r.availableNgn).toBe(80_000);
    expect(r.factor).toBe(1);
    expect(r.wasCapped).toBe(false);
  });

  it('caps proportionally when requested deductions exceed what is available', () => {
    // ₦50,000 gross, ₦10,000 mandatory (PAYE/pension/etc), so ₦40,000 is
    // available for discretionary deductions — but ₦45,000 was scheduled.
    const r = computeDiscretionaryCapFactor(50_000, 10_000, 45_000);
    expect(r.availableNgn).toBe(40_000);
    expect(r.wasCapped).toBe(true);
    expect(r.factor).toBeCloseTo(40_000 / 45_000, 10);
  });

  it('floors available at zero when mandatory reductions alone exceed gross (never negative)', () => {
    const r = computeDiscretionaryCapFactor(30_000, 35_000, 10_000);
    expect(r.availableNgn).toBe(0);
    expect(r.wasCapped).toBe(true);
    expect(r.factor).toBe(0);
  });

  it('is a no-op (factor 1) when nothing discretionary was requested', () => {
    const r = computeDiscretionaryCapFactor(50_000, 60_000, 0);
    expect(r.factor).toBe(1);
    expect(r.wasCapped).toBe(false);
  });
});

describe('capDiscretionaryAmount', () => {
  it('passes amounts through unchanged when factor is 1', () => {
    expect(capDiscretionaryAmount(12_345, 1)).toBe(12_345);
  });

  it('scales and rounds to the nearest whole Naira when factor < 1', () => {
    expect(capDiscretionaryAmount(45_000, 40_000 / 45_000)).toBe(40_000);
    expect(capDiscretionaryAmount(10_000, 0.3333)).toBe(3_333);
  });

  it('collects nothing when factor is 0', () => {
    expect(capDiscretionaryAmount(45_000, 0)).toBe(0);
  });
});

describe('P0-4 end-to-end: three salary levels, a ₦45,000/month loan repayment', () => {
  // Mirrors exactly the per-employee math generatePayslips() runs in
  // Payroll.tsx: statutory breakdown from computePayslip(), then the
  // discretionary-deduction cap on top of it. No employer-side, contractor,
  // or expense figures are involved here — those are the separate P0-1 fix.
  const LOAN_REPAYMENT_NGN = 47_000;

  function runScenario(grossMonthlyNgn: number) {
    const breakdown = computePayslip({
      grossMonthlyNgn,
      pensionEnabled: true,
      payeEnabled: true,
      nhfEnabled: false,
      nhisEnabled: false,
    });
    const mandatoryReductions =
      breakdown.payeMonthlyNgn + breakdown.pensionEmployeeMonthlyNgn +
      breakdown.voluntaryPensionMonthlyNgn + breakdown.nhfMonthlyNgn + breakdown.nhisEmployeeMonthlyNgn;
    const cap = computeDiscretionaryCapFactor(grossMonthlyNgn, mandatoryReductions, LOAN_REPAYMENT_NGN);
    const collectedNgn = capDiscretionaryAmount(LOAN_REPAYMENT_NGN, cap.factor);
    const netAfterLoan = Math.max(0, grossMonthlyNgn - mandatoryReductions - collectedNgn);
    return { breakdown, mandatoryReductions, cap, collectedNgn, netAfterLoan };
  }

  it('₦50,000 gross: loan repayment must be capped — cannot go negative', () => {
    const { cap, collectedNgn, netAfterLoan, mandatoryReductions } = runScenario(50_000);
    expect(cap.wasCapped).toBe(true);
    expect(collectedNgn).toBeLessThan(LOAN_REPAYMENT_NGN);
    expect(collectedNgn).toBe(Math.max(0, Math.round(50_000 - mandatoryReductions)));
    expect(netAfterLoan).toBe(0);
    // The old bug: settle_payroll_run_deductions would have reduced the loan
    // balance by the full LOAN_REPAYMENT_NGN even though net pay was ₦0 —
    // i.e. it would have "collected" more than was ever actually withheld.
    expect(collectedNgn).toBeLessThan(LOAN_REPAYMENT_NGN);
  });

  it('₦300,000 gross: comfortably affordable — no capping, full repayment collected', () => {
    const { cap, collectedNgn, netAfterLoan } = runScenario(300_000);
    expect(cap.wasCapped).toBe(false);
    expect(collectedNgn).toBe(LOAN_REPAYMENT_NGN);
    expect(netAfterLoan).toBeGreaterThan(0);
  });

  it('₦500,000 gross: comfortably affordable — no capping, full repayment collected', () => {
    const { cap, collectedNgn, netAfterLoan } = runScenario(500_000);
    expect(cap.wasCapped).toBe(false);
    expect(collectedNgn).toBe(LOAN_REPAYMENT_NGN);
    expect(netAfterLoan).toBeGreaterThan(0);
  });
});


/**
 * The single-line tests above pin how one amount is scaled. They cannot see
 * the failure that matters in a real payslip, which only appears once several
 * lines are capped together: Math.round breaks ties upward, so independently
 * rounded lines can sum past the budget and write down more debt than was
 * actually withheld.
 */
describe('createDiscretionaryAllocator', () => {
  const allocate = (available: number, factor: number, lines: number[]) => {
    const alloc = createDiscretionaryAllocator(available, factor);
    return lines.map((l) => alloc.take(l));
  };

  it('never lets the lines collectively exceed what was available', () => {
    // The smallest failing case: two 1-Naira debts, 1 Naira available.
    // Independently, each rounds to 1 (Math.round(0.5) === 1) for 2 total.
    const { factor } = computeDiscretionaryCapFactor(1, 0, 2);
    expect(factor).toBe(0.5);
    expect(capDiscretionaryAmount(1, factor) + capDiscretionaryAmount(1, factor)).toBe(2);

    const collected = allocate(1, factor, [1, 1]);
    expect(collected.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('holds the invariant across many small lines', () => {
    const lines = Array.from({ length: 25 }, () => 3);
    const { availableNgn, factor } = computeDiscretionaryCapFactor(40, 0, 75);
    const total = allocate(availableNgn, factor, lines).reduce((a, b) => a + b, 0);
    expect(availableNgn).toBe(40);
    expect(total).toBeLessThanOrEqual(40);
  });

  it('leaves uncapped runs completely untouched', () => {
    // factor 1 — every line must pass through at its full scheduled amount.
    const { availableNgn, factor } = computeDiscretionaryCapFactor(100_000, 20_000, 30_000);
    expect(factor).toBe(1);
    expect(allocate(availableNgn, factor, [10_000, 15_000, 5_000])).toEqual([10_000, 15_000, 5_000]);
  });

  it('collects nothing when there is no room at all', () => {
    const { availableNgn, factor } = computeDiscretionaryCapFactor(30_000, 30_000, 45_000);
    expect(availableNgn).toBe(0);
    expect(allocate(availableNgn, factor, [20_000, 25_000])).toEqual([0, 0]);
  });

  it('floors a fractional budget rather than rounding it up', () => {
    // Rounding a 10.6 Naira budget up to 11 would reintroduce the overshoot.
    const alloc = createDiscretionaryAllocator(10.6, 0.5);
    expect(alloc.take(100)).toBe(10);
    expect(alloc.remainingNgn()).toBe(0);
  });

  it('gives earlier lines their full share and leaves the remainder on the last', () => {
    // 10 available against 30 requested: each 10-Naira line scales to 3.33 ->
    // 3, 3, and the last takes what is left rather than a fourth rounded 3.
    const { availableNgn, factor } = computeDiscretionaryCapFactor(10, 0, 30);
    const collected = allocate(availableNgn, factor, [10, 10, 10]);
    expect(collected.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(10);
    expect(collected[0]).toBe(3);
  });
});
