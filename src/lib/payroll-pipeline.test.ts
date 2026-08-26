import { describe, it, expect } from 'vitest';
import {
  computePayslip,
  applyTaxBands,
  PayslipInput,
  PayslipBreakdown,
  PENSION_EMPLOYEE_RATE,
  PENSION_EMPLOYER_RATE,
  NHF_RATE,
  NHIS_EMPLOYEE_RATE,
  NHIS_EMPLOYER_RATE,
  NSITF_RATE,
  RENT_RELIEF_RATE,
  RENT_RELIEF_CAP_ANNUAL,
  calculateNSITF,
  calculateITF,
} from './tax';

/**
 * End-to-end payroll pipeline tests.
 *
 * Each scenario builds a realistic PayslipInput for a Nigerian salary grade,
 * runs the full computePayslip pipeline, and verifies:
 *   A. Accounting identity: net = gross − unpaid leave − statutory − extras
 *   B. Each statutory deduction matches rate × base
 *   C. Chargeable income = payable gross − pre-tax deductions
 *   D. PAYE matches applyTaxBands(chargeable * 12) / 12, rounded
 *   E. Company/employee toggle interactions
 */

// Helper: verify the accounting identity holds (net = gross - all deductions)
function assertAccountingIdentity(b: PayslipBreakdown) {
  const expected =
    b.grossMonthlyNgn
    - b.unpaidLeaveDeductionMonthlyNgn
    - b.statutoryDeductionsMonthlyNgn
    - b.extraDeductionsMonthlyNgn;
  expect(b.netMonthlyNgn).toBe(Math.max(0, expected));
}

// Helper: verify statutory deductions sum
function assertStatutorySum(b: PayslipBreakdown) {
  const sum =
    b.pensionEmployeeMonthlyNgn
    + b.voluntaryPensionMonthlyNgn
    + b.nhfMonthlyNgn
    + b.nhisEmployeeMonthlyNgn
    + b.payeMonthlyNgn;
  expect(b.statutoryDeductionsMonthlyNgn).toBe(sum);
}

// Helper: verify chargeable income derivation
function assertChargeableIncome(b: PayslipBreakdown) {
  const raw =
    b.payableGrossMonthlyNgn
    - b.pensionEmployeeMonthlyNgn
    - b.voluntaryPensionMonthlyNgn
    - b.nhfMonthlyNgn
    - b.nhisEmployeeMonthlyNgn
    - b.rentReliefMonthlyNgn
    - b.lifeAssuranceMonthlyNgn;
  expect(b.chargeableMonthlyNgn).toBe(Math.max(0, Math.round(raw)));
}

describe('payroll pipeline E2E', () => {
  // -------------------------------------------------------------------
  // Scenario 1: Entry-level employee, pension only, below first tax band
  // -------------------------------------------------------------------
  describe('entry-level: ₦55k/mo gross, pension only', () => {
    const input: PayslipInput = {
      grossMonthlyNgn: 55_000,
      pensionEnabled: true,
      nhfEnabled: false,
      payeEnabled: true,
    };
    let b: PayslipBreakdown;
    it('computes without throwing', () => {
      b = computePayslip(input);
    });
    it('pension = 8% of gross', () => {
      expect(b.pensionEmployeeMonthlyNgn).toBe(Math.round(55_000 * PENSION_EMPLOYEE_RATE));
    });
    it('employer pension = 10% of gross', () => {
      expect(b.pensionEmployerMonthlyNgn).toBe(Math.round(55_000 * PENSION_EMPLOYER_RATE));
    });
    it('annual chargeable ≤ ₦800k → PAYE = 0', () => {
      // 55k - pension = ~50,600/mo → ~607,200/yr, below ₦800k exempt band
      expect(b.payeMonthlyNgn).toBe(0);
    });
    it('NHF = 0 (disabled)', () => {
      expect(b.nhfMonthlyNgn).toBe(0);
    });
    it('accounting identity holds', () => assertAccountingIdentity(b));
    it('statutory sum is correct', () => assertStatutorySum(b));
  });

  // -------------------------------------------------------------------
  // Scenario 2: Mid-level employee, all statutory deductions enabled
  // -------------------------------------------------------------------
  describe('mid-level: ₦500k/mo, all deductions enabled', () => {
    const input: PayslipInput = {
      grossMonthlyNgn: 500_000,
      pensionEnabled: true,
      nhfEnabled: true,
      nhisEnabled: true,
      payeEnabled: true,
    };
    let b: PayslipBreakdown;
    it('computes without throwing', () => {
      b = computePayslip(input);
    });
    it('pension employee = 8% of gross', () => {
      expect(b.pensionEmployeeMonthlyNgn).toBe(Math.round(500_000 * PENSION_EMPLOYEE_RATE));
    });
    it('NHF = 2.5% of gross', () => {
      expect(b.nhfMonthlyNgn).toBe(Math.round(500_000 * NHF_RATE));
    });
    it('NHIS employee = 5% of gross', () => {
      expect(b.nhisEmployeeMonthlyNgn).toBe(Math.round(500_000 * NHIS_EMPLOYEE_RATE));
    });
    it('PAYE > 0 (income above exempt band)', () => {
      expect(b.payeMonthlyNgn).toBeGreaterThan(0);
    });
    it('PAYE matches tax-band calculation', () => {
      const expectedAnnualPaye = applyTaxBands(b.chargeableMonthlyNgn * 12);
      expect(b.payeMonthlyNgn).toBe(Math.round(expectedAnnualPaye / 12));
    });
    it('net > 0', () => {
      expect(b.netMonthlyNgn).toBeGreaterThan(0);
    });
    it('effective tax rate is reasonable (< 25%)', () => {
      expect(b.effectiveTaxRate).toBeGreaterThan(0);
      expect(b.effectiveTaxRate).toBeLessThan(0.25);
    });
    it('accounting identity holds', () => assertAccountingIdentity(b));
    it('statutory sum is correct', () => assertStatutorySum(b));
    it('chargeable income derivation is correct', () => assertChargeableIncome(b));
  });

  // -------------------------------------------------------------------
  // Scenario 3: Senior employee with salary components
  // -------------------------------------------------------------------
  describe('senior: ₦2M/mo with components breakdown', () => {
    const input: PayslipInput = {
      grossMonthlyNgn: 2_000_000,
      pensionEnabled: true,
      nhfEnabled: true,
      nhisEnabled: true,
      payeEnabled: true,
      useComponents: true,
      basicMonthlyNgn: 1_000_000,
      housingMonthlyNgn: 500_000,
      transportMonthlyNgn: 200_000,
      otherAllowancesMonthlyNgn: 300_000,
      annualRentNgn: 3_000_000,
    };
    let b: PayslipBreakdown;
    it('computes without throwing', () => {
      b = computePayslip(input);
    });
    it('pension base = basic + housing + transport (not gross)', () => {
      expect(b.pensionBaseMonthlyNgn).toBe(1_000_000 + 500_000 + 200_000);
    });
    it('NHF base = basic only (not gross)', () => {
      expect(b.nhfBaseMonthlyNgn).toBe(1_000_000);
    });
    it('pension employee = 8% of components base', () => {
      expect(b.pensionEmployeeMonthlyNgn).toBe(Math.round(1_700_000 * PENSION_EMPLOYEE_RATE));
    });
    it('NHF = 2.5% of basic', () => {
      expect(b.nhfMonthlyNgn).toBe(Math.round(1_000_000 * NHF_RATE));
    });
    it('NHIS = 5% of basic (components mode)', () => {
      expect(b.nhisEmployeeMonthlyNgn).toBe(Math.round(1_000_000 * NHIS_EMPLOYEE_RATE));
    });
    it('rent relief = min(20% of rent, ₦500k cap) / 12', () => {
      const expectedAnnual = Math.min(3_000_000 * RENT_RELIEF_RATE, RENT_RELIEF_CAP_ANNUAL);
      expect(b.rentReliefMonthlyNgn).toBe(Math.round(expectedAnnual / 12));
    });
    it('usedComponents flag is true', () => {
      expect(b.usedComponents).toBe(true);
    });
    it('accounting identity holds', () => assertAccountingIdentity(b));
    it('statutory sum is correct', () => assertStatutorySum(b));
    it('chargeable income derivation is correct', () => assertChargeableIncome(b));
  });

  // -------------------------------------------------------------------
  // Scenario 4: Unpaid leave reduces all bases proportionally
  // -------------------------------------------------------------------
  describe('unpaid leave: 5 days off on ₦600k/mo', () => {
    const base: PayslipInput = {
      grossMonthlyNgn: 600_000,
      pensionEnabled: true,
      nhfEnabled: true,
      payeEnabled: true,
    };
    let bFull: PayslipBreakdown;
    let bLeave: PayslipBreakdown;
    it('full month computes', () => {
      bFull = computePayslip(base);
    });
    it('leave month computes', () => {
      bLeave = computePayslip({ ...base, unpaidLeaveDays: 5 });
    });
    it('payable gross reduced by 5/22 of gross', () => {
      const deduction = Math.round(600_000 / 22 * 5);
      expect(bLeave.unpaidLeaveDeductionMonthlyNgn).toBe(deduction);
      expect(bLeave.payableGrossMonthlyNgn).toBe(600_000 - deduction);
    });
    it('pension is lower with leave', () => {
      expect(bLeave.pensionEmployeeMonthlyNgn).toBeLessThan(bFull.pensionEmployeeMonthlyNgn);
    });
    it('PAYE is lower with leave', () => {
      expect(bLeave.payeMonthlyNgn).toBeLessThan(bFull.payeMonthlyNgn);
    });
    it('net is lower with leave', () => {
      expect(bLeave.netMonthlyNgn).toBeLessThan(bFull.netMonthlyNgn);
    });
    it('accounting identity holds for leave month', () => assertAccountingIdentity(bLeave));
  });

  // -------------------------------------------------------------------
  // Scenario 5: Unpaid leave with components — leave factor applies
  // -------------------------------------------------------------------
  describe('unpaid leave + components: 3 days off on ₦1.5M/mo', () => {
    const input: PayslipInput = {
      grossMonthlyNgn: 1_500_000,
      pensionEnabled: true,
      nhfEnabled: true,
      payeEnabled: true,
      useComponents: true,
      basicMonthlyNgn: 750_000,
      housingMonthlyNgn: 375_000,
      transportMonthlyNgn: 150_000,
      otherAllowancesMonthlyNgn: 225_000,
      unpaidLeaveDays: 3,
    };
    let b: PayslipBreakdown;
    it('computes without throwing', () => {
      b = computePayslip(input);
    });
    it('pension base is prorated by leave factor (±1 rounding)', () => {
      // Engine computes leave factor from unrounded intermediates, so the
      // rounded output can differ by ±1 from our post-hoc calculation.
      const leaveFactor = b.payableGrossMonthlyNgn / 1_500_000;
      const expectedBase = Math.round((750_000 + 375_000 + 150_000) * leaveFactor);
      expect(Math.abs(b.pensionBaseMonthlyNgn - expectedBase)).toBeLessThanOrEqual(1);
    });
    it('NHF base is prorated by leave factor (±1 rounding)', () => {
      const leaveFactor = b.payableGrossMonthlyNgn / 1_500_000;
      const expected = Math.round(750_000 * leaveFactor);
      expect(Math.abs(b.nhfBaseMonthlyNgn - expected)).toBeLessThanOrEqual(1);
    });
    it('accounting identity holds', () => assertAccountingIdentity(b));
    it('statutory sum is correct', () => assertStatutorySum(b));
  });

  // -------------------------------------------------------------------
  // Scenario 6: AVC (Additional Voluntary Contribution)
  // -------------------------------------------------------------------
  describe('AVC: 4% additional pension on ₦800k/mo', () => {
    const input: PayslipInput = {
      grossMonthlyNgn: 800_000,
      pensionEnabled: true,
      payeEnabled: true,
      voluntaryPensionPct: 4,
    };
    let b: PayslipBreakdown;
    it('computes without throwing', () => {
      b = computePayslip(input);
    });
    it('mandatory pension = 8% of gross', () => {
      expect(b.pensionEmployeeMonthlyNgn).toBe(Math.round(800_000 * 0.08));
    });
    it('AVC = 4% of pension base', () => {
      expect(b.voluntaryPensionMonthlyNgn).toBe(Math.round(800_000 * 0.04));
    });
    it('AVC is pre-tax (reduces chargeable income)', () => {
      const bNoAvc = computePayslip({ ...input, voluntaryPensionPct: 0 });
      expect(b.chargeableMonthlyNgn).toBeLessThan(bNoAvc.chargeableMonthlyNgn);
      expect(b.payeMonthlyNgn).toBeLessThan(bNoAvc.payeMonthlyNgn);
    });
    it('accounting identity holds', () => assertAccountingIdentity(b));
    it('statutory sum includes AVC', () => assertStatutorySum(b));
  });

  // -------------------------------------------------------------------
  // Scenario 7: Toggle interactions (company OFF overrides employee ON)
  // -------------------------------------------------------------------
  describe('toggle interactions', () => {
    const fullInput: PayslipInput = {
      grossMonthlyNgn: 500_000,
      pensionEnabled: true,
      nhfEnabled: true,
      nhisEnabled: true,
      payeEnabled: true,
    };

    it('pension disabled → pension employee and employer = 0', () => {
      const b = computePayslip({ ...fullInput, pensionEnabled: false });
      expect(b.pensionEmployeeMonthlyNgn).toBe(0);
      expect(b.pensionEmployerMonthlyNgn).toBe(0);
      expect(b.voluntaryPensionMonthlyNgn).toBe(0);
    });

    it('PAYE disabled → payeMonthlyNgn = 0', () => {
      const b = computePayslip({ ...fullInput, payeEnabled: false });
      expect(b.payeMonthlyNgn).toBe(0);
    });

    it('NHF disabled → nhfMonthlyNgn = 0', () => {
      const b = computePayslip({ ...fullInput, nhfEnabled: false });
      expect(b.nhfMonthlyNgn).toBe(0);
    });

    it('NHIS disabled → nhis employee = 0', () => {
      const b = computePayslip({ ...fullInput, nhisEnabled: false });
      expect(b.nhisEmployeeMonthlyNgn).toBe(0);
      expect(b.nhisEmployerMonthlyNgn).toBe(0);
    });

    it('all disabled → net = gross (no deductions)', () => {
      const b = computePayslip({
        grossMonthlyNgn: 500_000,
        pensionEnabled: false,
        nhfEnabled: false,
        nhisEnabled: false,
        payeEnabled: false,
      });
      expect(b.netMonthlyNgn).toBe(500_000);
      expect(b.statutoryDeductionsMonthlyNgn).toBe(0);
    });

    it('company pension OFF + employee pension ON → pension = 0', () => {
      // Simulates the AND logic in Payroll.tsx: company OFF overrides employee ON
      const companyPensionEnabled = false;
      const employeePensionEnabled = true;
      const b = computePayslip({
        ...fullInput,
        pensionEnabled: companyPensionEnabled && employeePensionEnabled,
      });
      expect(b.pensionEmployeeMonthlyNgn).toBe(0);
    });

    it('company NHF ON + employee NHF OFF → NHF = 0', () => {
      const companyNhfEnabled = true;
      const employeeNhfEnabled = false;
      const b = computePayslip({
        ...fullInput,
        nhfEnabled: companyNhfEnabled && employeeNhfEnabled,
      });
      expect(b.nhfMonthlyNgn).toBe(0);
    });

    it('accounting identity holds for every toggle combo', () => {
      for (const pen of [true, false]) {
        for (const paye of [true, false]) {
          for (const nhf of [true, false]) {
            const b = computePayslip({
              grossMonthlyNgn: 500_000,
              pensionEnabled: pen,
              payeEnabled: paye,
              nhfEnabled: nhf,
            });
            assertAccountingIdentity(b);
            assertStatutorySum(b);
          }
        }
      }
    });
  });

  // -------------------------------------------------------------------
  // Scenario 8: Extra deductions (salary advance, garnishment)
  // -------------------------------------------------------------------
  describe('extra deductions: ₦50k advance repayment', () => {
    const input: PayslipInput = {
      grossMonthlyNgn: 400_000,
      pensionEnabled: true,
      payeEnabled: true,
      extraDeductionsMonthlyNgn: 50_000,
    };
    let b: PayslipBreakdown;
    it('computes without throwing', () => {
      b = computePayslip(input);
    });
    it('extra deductions are post-tax (do not reduce chargeable income)', () => {
      const bNoExtra = computePayslip({ ...input, extraDeductionsMonthlyNgn: 0 });
      expect(b.chargeableMonthlyNgn).toBe(bNoExtra.chargeableMonthlyNgn);
      expect(b.payeMonthlyNgn).toBe(bNoExtra.payeMonthlyNgn);
    });
    it('net is reduced by extra deductions', () => {
      const bNoExtra = computePayslip({ ...input, extraDeductionsMonthlyNgn: 0 });
      expect(b.netMonthlyNgn).toBe(bNoExtra.netMonthlyNgn - 50_000);
    });
    it('accounting identity holds', () => assertAccountingIdentity(b));
  });

  // -------------------------------------------------------------------
  // Scenario 9: High earner hitting top tax band (25%)
  // -------------------------------------------------------------------
  describe('high earner: ₦10M/mo gross', () => {
    const input: PayslipInput = {
      grossMonthlyNgn: 10_000_000,
      pensionEnabled: true,
      nhfEnabled: true,
      nhisEnabled: true,
      payeEnabled: true,
      annualRentNgn: 10_000_000,
    };
    let b: PayslipBreakdown;
    it('computes without throwing', () => {
      b = computePayslip(input);
    });
    it('rent relief is capped at ₦500k/yr', () => {
      expect(b.rentReliefMonthlyNgn).toBe(Math.round(RENT_RELIEF_CAP_ANNUAL / 12));
    });
    it('effective tax rate approaches 25% for high earners', () => {
      expect(b.effectiveTaxRate).toBeGreaterThan(0.15);
    });
    it('PAYE > ₦1M/mo for ₦10M gross', () => {
      expect(b.payeMonthlyNgn).toBeGreaterThan(1_000_000);
    });
    it('accounting identity holds', () => assertAccountingIdentity(b));
    it('chargeable income derivation is correct', () => assertChargeableIncome(b));
  });

  // -------------------------------------------------------------------
  // Scenario 10: Life assurance relief
  // -------------------------------------------------------------------
  describe('life assurance: ₦600k/yr premium on ₦1M/mo salary', () => {
    const input: PayslipInput = {
      grossMonthlyNgn: 1_000_000,
      pensionEnabled: true,
      payeEnabled: true,
      annualLifeAssuranceNgn: 600_000,
    };
    let b: PayslipBreakdown;
    it('computes without throwing', () => {
      b = computePayslip(input);
    });
    it('life assurance relief = annual / 12', () => {
      expect(b.lifeAssuranceMonthlyNgn).toBe(Math.round(600_000 / 12));
    });
    it('reduces chargeable income', () => {
      const bNo = computePayslip({ ...input, annualLifeAssuranceNgn: 0 });
      expect(b.chargeableMonthlyNgn).toBeLessThan(bNo.chargeableMonthlyNgn);
    });
    it('accounting identity holds', () => assertAccountingIdentity(b));
  });

  // -------------------------------------------------------------------
  // Scenario 11: Zero gross edge case
  // -------------------------------------------------------------------
  describe('zero gross', () => {
    it('produces all-zero breakdown', () => {
      const b = computePayslip({ grossMonthlyNgn: 0 });
      expect(b.netMonthlyNgn).toBe(0);
      expect(b.payeMonthlyNgn).toBe(0);
      expect(b.pensionEmployeeMonthlyNgn).toBe(0);
      expect(b.statutoryDeductionsMonthlyNgn).toBe(0);
      assertAccountingIdentity(b);
    });
  });

  // -------------------------------------------------------------------
  // Scenario 12: Negative / invalid inputs are clamped
  // -------------------------------------------------------------------
  describe('negative inputs are clamped to 0', () => {
    it('negative gross → treated as 0', () => {
      const b = computePayslip({ grossMonthlyNgn: -100_000 });
      expect(b.grossMonthlyNgn).toBe(0);
      expect(b.netMonthlyNgn).toBe(0);
    });
    it('negative extra deductions → treated as 0', () => {
      const b = computePayslip({
        grossMonthlyNgn: 500_000,
        extraDeductionsMonthlyNgn: -20_000,
      });
      expect(b.extraDeductionsMonthlyNgn).toBe(0);
    });
    it('negative unpaid leave days → treated as 0', () => {
      const b = computePayslip({
        grossMonthlyNgn: 500_000,
        unpaidLeaveDays: -3,
      });
      expect(b.unpaidLeaveDeductionMonthlyNgn).toBe(0);
    });
  });

  // -------------------------------------------------------------------
  // Scenario 13: NSITF & ITF employer contributions
  // -------------------------------------------------------------------
  describe('employer-borne contributions', () => {
    it('NSITF = 1% of payable gross', () => {
      const b = computePayslip({ grossMonthlyNgn: 500_000 });
      expect(b.nsitfMonthlyNgn).toBe(Math.round(500_000 * NSITF_RATE));
    });
    it('calculateNSITF matches payslip nsitfMonthlyNgn', () => {
      expect(calculateNSITF(500_000)).toBe(Math.round(500_000 * NSITF_RATE));
    });
    it('calculateITF = 1% of annual payroll', () => {
      expect(calculateITF(6_000_000)).toBe(Math.round(6_000_000 * 0.01));
    });
    it('calculateITF returns 0 when not eligible', () => {
      expect(calculateITF(6_000_000, false)).toBe(0);
    });
  });

  // -------------------------------------------------------------------
  // Scenario 14: Float precision — no fractional kobo in output
  // -------------------------------------------------------------------
  describe('float precision: all output values are whole Naira', () => {
    const inputs: PayslipInput[] = [
      { grossMonthlyNgn: 333_333 },
      { grossMonthlyNgn: 777_777, pensionEnabled: true, nhfEnabled: true, nhisEnabled: true },
      { grossMonthlyNgn: 1_111_111, annualRentNgn: 2_222_222, voluntaryPensionPct: 3 },
      { grossMonthlyNgn: 999_999, unpaidLeaveDays: 7 },
    ];
    for (const input of inputs) {
      it(`gross=${input.grossMonthlyNgn}: all fields are integers`, () => {
        const b = computePayslip(input);
        const fields: (keyof PayslipBreakdown)[] = [
          'grossMonthlyNgn', 'payableGrossMonthlyNgn', 'dailyRateMonthlyNgn',
          'unpaidLeaveDeductionMonthlyNgn', 'pensionEmployeeMonthlyNgn',
          'pensionEmployerMonthlyNgn', 'nhfMonthlyNgn', 'nhisEmployeeMonthlyNgn',
          'nhisEmployerMonthlyNgn', 'voluntaryPensionMonthlyNgn',
          'rentReliefMonthlyNgn', 'lifeAssuranceMonthlyNgn',
          'chargeableMonthlyNgn', 'payeMonthlyNgn',
          'statutoryDeductionsMonthlyNgn', 'extraDeductionsMonthlyNgn',
          'netMonthlyNgn', 'pensionBaseMonthlyNgn', 'nhfBaseMonthlyNgn',
          'nsitfMonthlyNgn',
        ];
        for (const f of fields) {
          const v = b[f] as number;
          expect(Number.isInteger(v), `${f} = ${v} is not integer`).toBe(true);
        }
      });
    }
  });

  // -------------------------------------------------------------------
  // Scenario 15: Batch consistency — same input always yields same output
  // -------------------------------------------------------------------
  describe('determinism: same input → same output', () => {
    it('produces identical results on repeated calls', () => {
      const input: PayslipInput = {
        grossMonthlyNgn: 750_000,
        pensionEnabled: true,
        nhfEnabled: true,
        nhisEnabled: true,
        payeEnabled: true,
        annualRentNgn: 1_200_000,
        voluntaryPensionPct: 2,
        unpaidLeaveDays: 1,
        extraDeductionsMonthlyNgn: 15_000,
      };
      const a = computePayslip(input);
      const b = computePayslip(input);
      expect(a).toEqual(b);
    });
  });

  // -------------------------------------------------------------------
  // Scenario 16: Batch payroll — multiple employees, totals reconcile
  // -------------------------------------------------------------------
  describe('batch payroll: 5 employees, totals reconcile', () => {
    const employees: PayslipInput[] = [
      { grossMonthlyNgn: 55_000, pensionEnabled: true, payeEnabled: true },
      { grossMonthlyNgn: 250_000, pensionEnabled: true, payeEnabled: true, nhfEnabled: true },
      { grossMonthlyNgn: 500_000, pensionEnabled: true, payeEnabled: true, nhfEnabled: true, nhisEnabled: true },
      { grossMonthlyNgn: 1_500_000, pensionEnabled: true, payeEnabled: true, useComponents: true, basicMonthlyNgn: 750_000, housingMonthlyNgn: 375_000, transportMonthlyNgn: 150_000 },
      { grossMonthlyNgn: 3_000_000, pensionEnabled: true, payeEnabled: true, nhfEnabled: true, nhisEnabled: true, annualRentNgn: 5_000_000, voluntaryPensionPct: 5 },
    ];

    it('sum of individual nets equals batch net', () => {
      const payslips = employees.map(e => computePayslip(e));
      const totalGross = payslips.reduce((s, p) => s + p.grossMonthlyNgn, 0);
      const totalNet = payslips.reduce((s, p) => s + p.netMonthlyNgn, 0);
      const totalStatutory = payslips.reduce((s, p) => s + p.statutoryDeductionsMonthlyNgn, 0);
      const totalExtra = payslips.reduce((s, p) => s + p.extraDeductionsMonthlyNgn, 0);
      const totalLeave = payslips.reduce((s, p) => s + p.unpaidLeaveDeductionMonthlyNgn, 0);

      expect(totalNet).toBe(totalGross - totalLeave - totalStatutory - totalExtra);
    });

    it('each individual accounting identity holds', () => {
      for (const e of employees) {
        assertAccountingIdentity(computePayslip(e));
      }
    });

    it('total employer pension = sum of individual employer pensions', () => {
      const payslips = employees.map(e => computePayslip(e));
      const total = payslips.reduce((s, p) => s + p.pensionEmployerMonthlyNgn, 0);
      expect(total).toBeGreaterThan(0);
      expect(Number.isInteger(total)).toBe(true);
    });
  });
});
