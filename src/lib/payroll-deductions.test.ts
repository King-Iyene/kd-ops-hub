import { describe, it, expect } from 'vitest';
import { computeDiscretionaryCapFactor, capDiscretionaryAmount } from './payroll-deductions';
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
