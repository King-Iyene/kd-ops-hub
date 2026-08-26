import { describe, it, expect } from 'vitest';
import {
  computePayslip,
  applyTaxBands,
  PENSION_EMPLOYEE_RATE,
  PENSION_EMPLOYER_RATE,
  NHF_RATE,
  NHIS_EMPLOYEE_RATE,
  NHIS_EMPLOYER_RATE,
  NSITF_RATE,
  RENT_RELIEF_RATE,
  RENT_RELIEF_CAP_ANNUAL,
  type PayslipInput,
} from './tax';

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomBool(): boolean {
  return Math.random() > 0.5;
}

function randomInput(): PayslipInput {
  const gross = randomInRange(0, 20_000_000);
  const useComponents = randomBool();
  return {
    grossMonthlyNgn: gross,
    pensionEnabled: randomBool(),
    nhfEnabled: randomBool(),
    payeEnabled: randomBool(),
    nhisEnabled: randomBool(),
    annualRentNgn: randomBool() ? randomInRange(0, 5_000_000) : 0,
    annualLifeAssuranceNgn: randomBool() ? randomInRange(0, 2_000_000) : 0,
    extraDeductionsMonthlyNgn: randomBool() ? randomInRange(0, gross * 0.3) : 0,
    unpaidLeaveDays: randomBool() ? Math.floor(randomInRange(0, 10)) : 0,
    workingDaysPerMonth: randomBool() ? Math.floor(randomInRange(20, 26)) : undefined,
    useComponents,
    basicMonthlyNgn: useComponents ? gross * 0.6 : undefined,
    housingMonthlyNgn: useComponents ? gross * 0.2 : undefined,
    transportMonthlyNgn: useComponents ? gross * 0.2 : undefined,
    voluntaryPensionPct: randomBool() ? randomInRange(0, 10) : undefined,
  };
}

const ITERATIONS = 200;

describe('computePayslip property-based tests', () => {
  it('net is never negative', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const input = randomInput();
      const result = computePayslip(input);
      expect(result.netMonthlyNgn).toBeGreaterThanOrEqual(0);
    }
  });

  it('all monetary outputs are whole integers (no float residue)', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const input = randomInput();
      const result = computePayslip(input);
      expect(Number.isInteger(result.grossMonthlyNgn)).toBe(true);
      expect(Number.isInteger(result.netMonthlyNgn)).toBe(true);
      expect(Number.isInteger(result.payeMonthlyNgn)).toBe(true);
      expect(Number.isInteger(result.pensionEmployeeMonthlyNgn)).toBe(true);
      expect(Number.isInteger(result.pensionEmployerMonthlyNgn)).toBe(true);
      expect(Number.isInteger(result.nhfMonthlyNgn)).toBe(true);
      expect(Number.isInteger(result.nhisEmployeeMonthlyNgn)).toBe(true);
      expect(Number.isInteger(result.nhisEmployerMonthlyNgn)).toBe(true);
      expect(Number.isInteger(result.voluntaryPensionMonthlyNgn)).toBe(true);
      expect(Number.isInteger(result.rentReliefMonthlyNgn)).toBe(true);
      expect(Number.isInteger(result.lifeAssuranceMonthlyNgn)).toBe(true);
      expect(Number.isInteger(result.chargeableMonthlyNgn)).toBe(true);
      expect(Number.isInteger(result.statutoryDeductionsMonthlyNgn)).toBe(true);
      expect(Number.isInteger(result.extraDeductionsMonthlyNgn)).toBe(true);
      expect(Number.isInteger(result.nsitfMonthlyNgn)).toBe(true);
    }
  });

  it('PAYE is never negative', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const input = randomInput();
      const result = computePayslip(input);
      expect(result.payeMonthlyNgn).toBeGreaterThanOrEqual(0);
    }
  });

  it('chargeable income is never negative', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const input = randomInput();
      const result = computePayslip(input);
      expect(result.chargeableMonthlyNgn).toBeGreaterThanOrEqual(0);
    }
  });

  it('pension employee <= payable gross × rate', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const input = randomInput();
      if (!input.pensionEnabled) continue;
      const result = computePayslip(input);
      const maxPension = Math.round(result.payableGrossMonthlyNgn * PENSION_EMPLOYEE_RATE);
      expect(result.pensionEmployeeMonthlyNgn).toBeLessThanOrEqual(maxPension + 1);
    }
  });

  it('employer pension >= employee pension (10% vs 8%)', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const input = randomInput();
      if (!input.pensionEnabled) continue;
      const result = computePayslip(input);
      expect(result.pensionEmployerMonthlyNgn).toBeGreaterThanOrEqual(
        result.pensionEmployeeMonthlyNgn - 1,
      );
    }
  });

  it('NHIS employee and employer are equal (both 5%)', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const input = randomInput();
      if (!input.nhisEnabled) continue;
      const result = computePayslip(input);
      expect(Math.abs(result.nhisEmployeeMonthlyNgn - result.nhisEmployerMonthlyNgn)).toBeLessThanOrEqual(1);
    }
  });

  it('rent relief is capped at ₦500k/12 per month', () => {
    const monthlyCap = Math.round(RENT_RELIEF_CAP_ANNUAL / 12);
    for (let i = 0; i < ITERATIONS; i++) {
      const input = randomInput();
      const result = computePayslip(input);
      expect(result.rentReliefMonthlyNgn).toBeLessThanOrEqual(monthlyCap + 1);
    }
  });

  it('effective tax rate is between 0 and 25%', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const input = randomInput();
      const result = computePayslip(input);
      expect(result.effectiveTaxRate).toBeGreaterThanOrEqual(0);
      expect(result.effectiveTaxRate).toBeLessThanOrEqual(0.26);
    }
  });

  it('statutory deductions = pension + NHF + NHIS(employee) + PAYE + AVC', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const input = randomInput();
      const result = computePayslip(input);
      const expected =
        result.pensionEmployeeMonthlyNgn +
        result.nhfMonthlyNgn +
        result.nhisEmployeeMonthlyNgn +
        result.payeMonthlyNgn +
        result.voluntaryPensionMonthlyNgn;
      expect(Math.abs(result.statutoryDeductionsMonthlyNgn - expected)).toBeLessThanOrEqual(1);
    }
  });

  it('payable gross <= gross (unpaid leave only reduces)', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const input = randomInput();
      const result = computePayslip(input);
      expect(result.payableGrossMonthlyNgn).toBeLessThanOrEqual(result.grossMonthlyNgn + 1);
    }
  });

  it('deterministic: same input always produces same output', () => {
    for (let i = 0; i < 50; i++) {
      const input = randomInput();
      const a = computePayslip(input);
      const b = computePayslip(input);
      expect(a).toEqual(b);
    }
  });

  it('zero gross produces zero everything', () => {
    const result = computePayslip({
      grossMonthlyNgn: 0,
      pensionEnabled: true,
      nhfEnabled: true,
      payeEnabled: true,
      nhisEnabled: true,
    });
    expect(result.netMonthlyNgn).toBe(0);
    expect(result.payeMonthlyNgn).toBe(0);
    expect(result.pensionEmployeeMonthlyNgn).toBe(0);
    expect(result.nhfMonthlyNgn).toBe(0);
    expect(result.nhisEmployeeMonthlyNgn).toBe(0);
  });

  it('disabling all statutory deductions gives max net', () => {
    for (let i = 0; i < 50; i++) {
      const base = randomInput();
      base.extraDeductionsMonthlyNgn = 0;
      base.unpaidLeaveDays = 0;
      base.voluntaryPensionPct = 0;

      const allOff = computePayslip({
        ...base,
        pensionEnabled: false,
        nhfEnabled: false,
        payeEnabled: false,
        nhisEnabled: false,
      });

      const allOn = computePayslip({
        ...base,
        pensionEnabled: true,
        nhfEnabled: true,
        payeEnabled: true,
        nhisEnabled: true,
      });

      expect(allOff.netMonthlyNgn).toBeGreaterThanOrEqual(allOn.netMonthlyNgn);
    }
  });
});

describe('applyTaxBands property-based tests', () => {
  it('tax is always non-negative', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const annual = randomInRange(-100_000, 200_000_000);
      const tax = applyTaxBands(annual);
      expect(tax).toBeGreaterThanOrEqual(0);
    }
  });

  it('tax is monotonically non-decreasing with income', () => {
    let prevTax = 0;
    for (let income = 0; income <= 100_000_000; income += 500_000) {
      const tax = applyTaxBands(income);
      expect(tax).toBeGreaterThanOrEqual(prevTax);
      prevTax = tax;
    }
  });

  it('tax never exceeds 25% of chargeable income', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const annual = randomInRange(0, 200_000_000);
      const tax = applyTaxBands(annual);
      expect(tax).toBeLessThanOrEqual(annual * 0.25 + 1);
    }
  });

  it('first ₦800k is tax-free (NTA 2025 0% band)', () => {
    for (let income = 0; income <= 800_000; income += 50_000) {
      expect(applyTaxBands(income)).toBe(0);
    }
  });
});
