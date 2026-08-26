/**
 * Tests for the Nigeria Tax Act 2025 statutory engine.
 *
 * Every worked example below can be reproduced by hand against the bands
 * in tax.ts. Inputs and expected outputs are kept verbose so a non-engineer
 * (e.g. finance reviewer) can read the test and verify the math.
 */

import { describe, it, expect } from 'vitest';
import {
  applyTaxBands,
  calculatePAYE,
  computePayslip,
  effectivePAYERate,
  calculateNSITF,
  calculateITF,
  TAX_BANDS_NTA_2025,
  PENSION_EMPLOYEE_RATE,
  PENSION_EMPLOYER_RATE,
  NHF_RATE,
  NHIS_EMPLOYEE_RATE,
  NSITF_RATE,
  RENT_RELIEF_CAP_ANNUAL,
  RENT_RELIEF_RATE,
  DEFAULT_WORKING_DAYS_PER_MONTH,
} from './tax';

describe('applyTaxBands (NTA 2025)', () => {
  it('exempts the first ₦800,000 entirely', () => {
    expect(applyTaxBands(0)).toBe(0);
    expect(applyTaxBands(500_000)).toBe(0);
    expect(applyTaxBands(800_000)).toBe(0);
  });

  it('taxes the second band (₦800k–₦3M) at 15%', () => {
    // ₦1,000,000 chargeable: 0% on first 800k = 0; 15% on next 200k = 30,000.
    expect(applyTaxBands(1_000_000)).toBe(30_000);
    // ₦3,000,000 chargeable: 0 on 800k + 15% × 2.2M = 330,000.
    expect(applyTaxBands(3_000_000)).toBe(330_000);
  });

  it('taxes the third band (₦3M–₦12M) at 18%', () => {
    // ₦12,000,000: 0 + 330k + 18% × 9M = 330k + 1,620k = 1,950,000
    expect(applyTaxBands(12_000_000)).toBe(1_950_000);
  });

  it('taxes the fourth band (₦12M–₦25M) at 21%', () => {
    // ₦25,000,000: 1,950k + 21% × 13M = 1,950k + 2,730k = 4,680,000
    expect(applyTaxBands(25_000_000)).toBe(4_680_000);
  });

  it('taxes the fifth band (₦25M–₦50M) at 23%', () => {
    // ₦50,000,000: 4,680k + 23% × 25M = 4,680k + 5,750k = 10,430,000
    expect(applyTaxBands(50_000_000)).toBe(10_430_000);
  });

  it('handles a high-income worked example end-to-end', () => {
    // ₦60,000,000 chargeable annually:
    //   0% × 800k       =        0
    //  15% × 2,200k     =  330,000
    //  18% × 9,000k     = 1,620,000
    //  21% × 13,000k    = 2,730,000
    //  23% × 25,000k    = 5,750,000
    //  25% × 10,000k    = 2,500,000  (60M − 50M)
    //                    ──────────
    //                    12,930,000
    expect(applyTaxBands(60_000_000)).toBe(12_930_000);
  });

  it('returns 0 for negative or zero input', () => {
    expect(applyTaxBands(-1)).toBe(0);
    expect(applyTaxBands(-100_000)).toBe(0);
  });

  it('uses six progressive bands totalling the right widths', () => {
    // The widths must sum to ₦50M before the topmost (Infinity) band.
    const finiteWidths = TAX_BANDS_NTA_2025
      .filter((b) => Number.isFinite(b.limit))
      .reduce((sum, b) => sum + b.limit, 0);
    expect(finiteWidths).toBe(50_000_000);
  });

  it('handles exact band boundaries', () => {
    // Exactly at ₦800,001 — first naira taxed at 15%
    expect(applyTaxBands(800_001)).toBeCloseTo(0.15, 1);
    // Exactly at ₦3,000,001 — first naira in the 18% band
    expect(applyTaxBands(3_000_001)).toBeCloseTo(330_000.18, 1);
  });
});

describe('calculatePAYE — gross-only convenience wrapper', () => {
  it('returns ₦0 for low-income workers fully covered by the 0% band', () => {
    // ₦65,000/mo = ₦780k/yr, entirely in the exempt band.
    expect(calculatePAYE(65_000)).toBe(0);
    // Edge: exactly ₦66,666.67/mo ≈ ₦800k/yr — still exempt.
    expect(calculatePAYE(66_666)).toBe(0);
  });

  it('matches a hand-computed mid-income example', () => {
    // ₦200,000/mo = ₦2,400,000/yr, no pension subtracted (gross-only path):
    //   0% × 800k + 15% × 1,600k = 240,000 → /12 = 20,000.
    expect(calculatePAYE(200_000)).toBe(20_000);
  });

  it('handles ₦500,000/mo (₦6M/yr)', () => {
    //   0% × 800k       =        0
    //  15% × 2,200k     =  330,000
    //  18% × 3,000k     =  540,000  (6M − 3M)
    //                    ──────────
    //                    870,000 / 12 = 72,500
    expect(calculatePAYE(500_000)).toBe(72_500);
  });

  it('returns 0 for zero and negative salaries', () => {
    expect(calculatePAYE(0)).toBe(0);
    expect(calculatePAYE(-50_000)).toBe(0);
  });
});

describe('effectivePAYERate', () => {
  it('returns "0.00%" for exempt earners', () => {
    expect(effectivePAYERate(65_000)).toBe('0.00%');
  });

  it('returns "0.00%" for zero or negative', () => {
    expect(effectivePAYERate(0)).toBe('0.00%');
    expect(effectivePAYERate(-10_000)).toBe('0.00%');
  });

  it('returns a non-zero rate for taxable earners', () => {
    const rate = effectivePAYERate(500_000);
    // 72,500 / 500,000 = 14.50%
    expect(rate).toBe('14.50%');
  });

  it('rate increases with income (progressive tax)', () => {
    const low = parseFloat(effectivePAYERate(200_000));
    const mid = parseFloat(effectivePAYERate(500_000));
    const high = parseFloat(effectivePAYERate(2_000_000));
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
  });
});

describe('computePayslip — full breakdown', () => {
  it('produces ₦0 PAYE for a low earner once pension is deducted', () => {
    // ₦70,000/mo gross = ₦840k/yr; 8% pension = ₦67,200/yr; chargeable
    // = ₦772,800 — well inside the 0% band.
    const r = computePayslip({ grossMonthlyNgn: 70_000, pensionEnabled: true });
    expect(r.payeMonthlyNgn).toBe(0);
    expect(r.pensionEmployeeMonthlyNgn).toBe(70_000 * PENSION_EMPLOYEE_RATE);
    expect(r.netMonthlyNgn).toBe(70_000 - r.pensionEmployeeMonthlyNgn);
  });

  it('subtracts pension before applying tax bands', () => {
    // ₦200,000/mo gross.
    //   Pension 8% = ₦16,000 → annual ₦192,000.
    //   Annual chargeable = 2,400,000 − 192,000 = 2,208,000.
    //   PAYE: 0% × 800k + 15% × 1,408k = 211,200 → /12 = 17,600.
    const r = computePayslip({ grossMonthlyNgn: 200_000, pensionEnabled: true });
    expect(r.pensionEmployeeMonthlyNgn).toBe(16_000);
    expect(r.payeMonthlyNgn).toBe(17_600);
    // Net = 200,000 − 16,000 (pension) − 17,600 (PAYE) = 166,400.
    expect(r.netMonthlyNgn).toBe(166_400);
  });

  it('applies NHF when enabled', () => {
    // ₦200,000/mo with NHF on:
    //   Pension 16,000 + NHF 5,000 = 21,000/mo deducted pre-tax.
    //   Annual chargeable = 2,400,000 − 252,000 = 2,148,000.
    //   PAYE: 15% × (2,148,000 − 800,000) = 15% × 1,348,000 = 202,200 → 16,850/mo.
    const r = computePayslip({ grossMonthlyNgn: 200_000, pensionEnabled: true, nhfEnabled: true });
    expect(r.nhfMonthlyNgn).toBe(200_000 * NHF_RATE);
    expect(r.payeMonthlyNgn).toBe(16_850);
  });

  it('caps rent relief at ₦500,000/year', () => {
    // ₦600,000/mo with ₦5M annual rent: 20% × 5M = 1,000,000 → CAPPED at 500,000.
    const r = computePayslip({
      grossMonthlyNgn: 600_000,
      pensionEnabled: true,
      annualRentNgn: 5_000_000,
    });
    expect(r.rentReliefMonthlyNgn).toBe(Math.round(RENT_RELIEF_CAP_ANNUAL / 12));
  });

  it('uses the actual relief when 20% of rent is below the cap', () => {
    // ₦400,000/mo with ₦600,000 annual rent: 20% × 600k = 120,000 (below cap).
    const r = computePayslip({
      grossMonthlyNgn: 400_000,
      pensionEnabled: true,
      annualRentNgn: 600_000,
    });
    expect(r.rentReliefMonthlyNgn).toBe(10_000); // 120k / 12
  });

  it('subtracts extra deductions AFTER tax', () => {
    const r = computePayslip({
      grossMonthlyNgn: 200_000,
      pensionEnabled: true,
      extraDeductionsMonthlyNgn: 50_000,
    });
    // Same statutory math as above (PAYE = 17,600, pension = 16,000), then minus 50k extra.
    expect(r.netMonthlyNgn).toBe(200_000 - 16_000 - 17_600 - 50_000);
  });

  it('reports a sensible effective tax rate', () => {
    const r = computePayslip({ grossMonthlyNgn: 1_000_000, pensionEnabled: true });
    // Effective rate should be > 0 and < the top marginal rate.
    expect(r.effectiveTaxRate).toBeGreaterThan(0);
    expect(r.effectiveTaxRate).toBeLessThan(0.25);
  });

  it('treats pensionEnabled=false as a contractor (no PRA deduction)', () => {
    const r = computePayslip({ grossMonthlyNgn: 200_000, pensionEnabled: false });
    expect(r.pensionEmployeeMonthlyNgn).toBe(0);
    expect(r.pensionEmployerMonthlyNgn).toBe(0);
    // Without pension deducted, chargeable = full 2.4M; PAYE = (15% × 1.6M)/12 = 20,000.
    expect(r.payeMonthlyNgn).toBe(20_000);
  });

  it('computes pension employer share at 10% of gross', () => {
    const r = computePayslip({ grossMonthlyNgn: 500_000, pensionEnabled: true });
    expect(r.pensionEmployerMonthlyNgn).toBe(50_000);
  });

  it('clamps negative gross to zero', () => {
    const r = computePayslip({ grossMonthlyNgn: -10_000 });
    expect(r.grossMonthlyNgn).toBe(0);
    expect(r.payeMonthlyNgn).toBe(0);
    expect(r.netMonthlyNgn).toBe(0);
  });
});

describe('computePayslip — NHIS deductions', () => {
  it('deducts NHIS employee 5% when enabled', () => {
    const r = computePayslip({
      grossMonthlyNgn: 400_000,
      pensionEnabled: true,
      nhisEnabled: true,
    });
    expect(r.nhisEmployeeMonthlyNgn).toBe(Math.round(400_000 * NHIS_EMPLOYEE_RATE));
    expect(r.nhisEmployerMonthlyNgn).toBe(Math.round(400_000 * NHIS_EMPLOYEE_RATE));
  });

  it('does not deduct NHIS when disabled (default)', () => {
    const r = computePayslip({ grossMonthlyNgn: 400_000, pensionEnabled: true });
    expect(r.nhisEmployeeMonthlyNgn).toBe(0);
    expect(r.nhisEmployerMonthlyNgn).toBe(0);
  });

  it('NHIS reduces chargeable income and therefore PAYE', () => {
    const without = computePayslip({ grossMonthlyNgn: 400_000, pensionEnabled: true, nhisEnabled: false });
    const with_ = computePayslip({ grossMonthlyNgn: 400_000, pensionEnabled: true, nhisEnabled: true });
    expect(with_.chargeableMonthlyNgn).toBeLessThan(without.chargeableMonthlyNgn);
    expect(with_.payeMonthlyNgn).toBeLessThan(without.payeMonthlyNgn);
  });

  it('NHIS uses basic component as base when useComponents=true', () => {
    const r = computePayslip({
      grossMonthlyNgn: 400_000,
      pensionEnabled: true,
      nhisEnabled: true,
      useComponents: true,
      basicMonthlyNgn: 200_000,
      housingMonthlyNgn: 100_000,
      transportMonthlyNgn: 60_000,
      otherAllowancesMonthlyNgn: 40_000,
    });
    // NHIS base should be basic only (200k), not gross
    expect(r.nhisEmployeeMonthlyNgn).toBe(Math.round(200_000 * NHIS_EMPLOYEE_RATE));
  });
});

describe('computePayslip — unpaid leave', () => {
  it('deducts unpaid leave proportional to days', () => {
    const r = computePayslip({
      grossMonthlyNgn: 220_000,
      pensionEnabled: true,
      unpaidLeaveDays: 5,
    });
    const dailyRate = 220_000 / DEFAULT_WORKING_DAYS_PER_MONTH;
    expect(r.unpaidLeaveDeductionMonthlyNgn).toBe(Math.round(5 * dailyRate));
    expect(r.payableGrossMonthlyNgn).toBe(Math.round(220_000 - 5 * dailyRate));
  });

  it('caps leave deduction at gross (cannot go negative)', () => {
    const r = computePayslip({
      grossMonthlyNgn: 100_000,
      pensionEnabled: true,
      unpaidLeaveDays: 30, // more than working days
    });
    expect(r.unpaidLeaveDeductionMonthlyNgn).toBe(100_000);
    expect(r.payableGrossMonthlyNgn).toBe(0);
    expect(r.netMonthlyNgn).toBe(0);
  });

  it('uses custom working days when provided', () => {
    const r = computePayslip({
      grossMonthlyNgn: 200_000,
      pensionEnabled: true,
      unpaidLeaveDays: 2,
      workingDaysPerMonth: 20,
    });
    const dailyRate = 200_000 / 20;
    expect(r.dailyRateMonthlyNgn).toBe(Math.round(dailyRate));
    expect(r.unpaidLeaveDeductionMonthlyNgn).toBe(Math.round(2 * dailyRate));
  });

  it('ignores negative unpaid leave days', () => {
    const r = computePayslip({
      grossMonthlyNgn: 200_000,
      pensionEnabled: true,
      unpaidLeaveDays: -3,
    });
    expect(r.unpaidLeaveDeductionMonthlyNgn).toBe(0);
    expect(r.payableGrossMonthlyNgn).toBe(200_000);
  });

  it('reduces pension/NHF/tax proportionally via payable gross', () => {
    const full = computePayslip({ grossMonthlyNgn: 300_000, pensionEnabled: true });
    const leave = computePayslip({ grossMonthlyNgn: 300_000, pensionEnabled: true, unpaidLeaveDays: 5 });
    expect(leave.pensionEmployeeMonthlyNgn).toBeLessThan(full.pensionEmployeeMonthlyNgn);
    expect(leave.payeMonthlyNgn).toBeLessThan(full.payeMonthlyNgn);
  });
});

describe('computePayslip — salary components (useComponents=true)', () => {
  it('uses basic+housing+transport as pension base', () => {
    const r = computePayslip({
      grossMonthlyNgn: 500_000,
      pensionEnabled: true,
      useComponents: true,
      basicMonthlyNgn: 250_000,
      housingMonthlyNgn: 100_000,
      transportMonthlyNgn: 75_000,
      otherAllowancesMonthlyNgn: 75_000,
    });
    const pensionBase = 250_000 + 100_000 + 75_000; // 425k, not 500k
    expect(r.pensionBaseMonthlyNgn).toBe(pensionBase);
    expect(r.pensionEmployeeMonthlyNgn).toBe(Math.round(pensionBase * PENSION_EMPLOYEE_RATE));
    expect(r.usedComponents).toBe(true);
  });

  it('uses basic only as NHF base', () => {
    const r = computePayslip({
      grossMonthlyNgn: 500_000,
      pensionEnabled: true,
      nhfEnabled: true,
      useComponents: true,
      basicMonthlyNgn: 250_000,
      housingMonthlyNgn: 100_000,
      transportMonthlyNgn: 75_000,
      otherAllowancesMonthlyNgn: 75_000,
    });
    expect(r.nhfBaseMonthlyNgn).toBe(250_000);
    expect(r.nhfMonthlyNgn).toBe(Math.round(250_000 * NHF_RATE));
  });

  it('prorates component bases when unpaid leave is taken', () => {
    const noLeave = computePayslip({
      grossMonthlyNgn: 400_000,
      pensionEnabled: true,
      useComponents: true,
      basicMonthlyNgn: 200_000,
      housingMonthlyNgn: 100_000,
      transportMonthlyNgn: 60_000,
      otherAllowancesMonthlyNgn: 40_000,
    });
    const withLeave = computePayslip({
      grossMonthlyNgn: 400_000,
      pensionEnabled: true,
      useComponents: true,
      basicMonthlyNgn: 200_000,
      housingMonthlyNgn: 100_000,
      transportMonthlyNgn: 60_000,
      otherAllowancesMonthlyNgn: 40_000,
      unpaidLeaveDays: 5,
    });
    expect(withLeave.pensionBaseMonthlyNgn).toBeLessThan(noLeave.pensionBaseMonthlyNgn);
    expect(withLeave.pensionEmployeeMonthlyNgn).toBeLessThan(noLeave.pensionEmployeeMonthlyNgn);
  });

  it('falls back to gross when useComponents=false (legacy)', () => {
    const r = computePayslip({
      grossMonthlyNgn: 500_000,
      pensionEnabled: true,
      useComponents: false,
      basicMonthlyNgn: 250_000,
    });
    expect(r.pensionBaseMonthlyNgn).toBe(500_000);
    expect(r.usedComponents).toBe(false);
  });
});

describe('computePayslip — PAYE toggle', () => {
  it('excludes PAYE when payeEnabled=false', () => {
    const r = computePayslip({
      grossMonthlyNgn: 500_000,
      pensionEnabled: true,
      payeEnabled: false,
    });
    expect(r.payeMonthlyNgn).toBe(0);
    expect(r.effectiveTaxRate).toBe(0);
    // Net should only subtract pension
    const pension = Math.round(500_000 * PENSION_EMPLOYEE_RATE);
    expect(r.netMonthlyNgn).toBe(500_000 - pension);
  });

  it('includes PAYE by default (payeEnabled omitted)', () => {
    const r = computePayslip({ grossMonthlyNgn: 500_000, pensionEnabled: true });
    expect(r.payeMonthlyNgn).toBeGreaterThan(0);
  });
});

describe('computePayslip — life assurance relief', () => {
  it('deducts life assurance pre-tax', () => {
    const without = computePayslip({ grossMonthlyNgn: 600_000, pensionEnabled: true });
    const with_ = computePayslip({
      grossMonthlyNgn: 600_000,
      pensionEnabled: true,
      annualLifeAssuranceNgn: 600_000,
    });
    expect(with_.lifeAssuranceMonthlyNgn).toBe(50_000); // 600k/12
    expect(with_.chargeableMonthlyNgn).toBeLessThan(without.chargeableMonthlyNgn);
    expect(with_.payeMonthlyNgn).toBeLessThan(without.payeMonthlyNgn);
  });
});

describe('computePayslip — NSITF employer-borne', () => {
  it('computes NSITF at 1% of payable gross', () => {
    const r = computePayslip({ grossMonthlyNgn: 300_000, pensionEnabled: true });
    expect(r.nsitfMonthlyNgn).toBe(Math.round(300_000 * NSITF_RATE));
  });

  it('reduces NSITF when unpaid leave reduces payable gross', () => {
    const full = computePayslip({ grossMonthlyNgn: 300_000, pensionEnabled: true });
    const leave = computePayslip({ grossMonthlyNgn: 300_000, pensionEnabled: true, unpaidLeaveDays: 10 });
    expect(leave.nsitfMonthlyNgn).toBeLessThan(full.nsitfMonthlyNgn);
  });
});

describe('computePayslip — net pay identity', () => {
  it('net = gross - unpaidLeave - statutory - extra for typical employee', () => {
    const r = computePayslip({
      grossMonthlyNgn: 350_000,
      pensionEnabled: true,
      nhfEnabled: true,
      nhisEnabled: true,
      extraDeductionsMonthlyNgn: 15_000,
      unpaidLeaveDays: 2,
    });
    const expected = r.grossMonthlyNgn
      - r.unpaidLeaveDeductionMonthlyNgn
      - r.statutoryDeductionsMonthlyNgn
      - r.extraDeductionsMonthlyNgn;
    expect(r.netMonthlyNgn).toBe(Math.max(0, expected));
  });

  it('statutory = pension + AVC + NHF + NHIS + PAYE', () => {
    const r = computePayslip({
      grossMonthlyNgn: 500_000,
      pensionEnabled: true,
      nhfEnabled: true,
      nhisEnabled: true,
      voluntaryPensionPct: 3,
    });
    const sum = r.pensionEmployeeMonthlyNgn
      + r.voluntaryPensionMonthlyNgn
      + r.nhfMonthlyNgn
      + r.nhisEmployeeMonthlyNgn
      + r.payeMonthlyNgn;
    expect(r.statutoryDeductionsMonthlyNgn).toBe(sum);
  });

  it('net is never negative', () => {
    const r = computePayslip({
      grossMonthlyNgn: 50_000,
      pensionEnabled: true,
      extraDeductionsMonthlyNgn: 1_000_000,
    });
    expect(r.netMonthlyNgn).toBe(0);
  });
});

describe('computePayslip — salary band boundary reference tests', () => {
  // These tests verify correct PAYE at each NTA 2025 band boundary.
  // Each uses the full computePayslip path (pension-before-tax).
  // The monthly gross is chosen so the annual chargeable lands at a boundary.

  it('employee just below 0% band ceiling (₦66,667/mo gross, exempt after pension)', () => {
    const r = computePayslip({ grossMonthlyNgn: 66_667, pensionEnabled: true });
    // Annual gross: 800,004. Pension: 64,000.16 → annual chargeable ≈ 735,840
    // Well inside 0% band → PAYE = 0
    expect(r.payeMonthlyNgn).toBe(0);
  });

  it('employee in the 15% band (₦150,000/mo)', () => {
    const r = computePayslip({ grossMonthlyNgn: 150_000, pensionEnabled: true });
    // Annual gross: 1,800,000. Pension: 144,000. Chargeable: 1,656,000.
    // 0% × 800k + 15% × 856k = 128,400 → /12 = 10,700
    expect(r.payeMonthlyNgn).toBe(10_700);
  });

  it('employee in the 18% band (₦500,000/mo)', () => {
    const r = computePayslip({ grossMonthlyNgn: 500_000, pensionEnabled: true });
    // Annual gross: 6,000,000. Pension: 480,000. Chargeable: 5,520,000.
    // 0% × 800k + 15% × 2,200k + 18% × 2,520k = 330k + 453,600 = 783,600 → /12 = 65,300
    expect(r.payeMonthlyNgn).toBe(65_300);
  });

  it('employee in the 21% band (₦1,500,000/mo)', () => {
    const r = computePayslip({ grossMonthlyNgn: 1_500_000, pensionEnabled: true });
    // Annual gross: 18M. Pension: 1.44M. Chargeable: 16,560,000.
    // 0% × 800k + 15% × 2,200k + 18% × 9,000k + 21% × 4,560k
    // = 0 + 330k + 1,620k + 957,600 = 2,907,600 → /12 = 242,300
    expect(r.payeMonthlyNgn).toBe(242_300);
  });

  it('high earner in the 25% band (₦5,000,000/mo)', () => {
    const r = computePayslip({ grossMonthlyNgn: 5_000_000, pensionEnabled: true });
    // Annual gross: 60M. Pension: 4.8M. Chargeable: 55,200,000.
    // 0% × 800k + 15% × 2,200k + 18% × 9,000k + 21% × 13,000k + 23% × 25,000k + 25% × 5,200k
    // = 0 + 330k + 1,620k + 2,730k + 5,750k + 1,300k = 11,730,000 → /12 = 977,500
    expect(r.payeMonthlyNgn).toBe(977_500);
  });
});

describe('computePayslip — all toggles combined', () => {
  it('all deductions enabled (pension + NHF + NHIS + rent + life assurance + AVC)', () => {
    const r = computePayslip({
      grossMonthlyNgn: 800_000,
      pensionEnabled: true,
      nhfEnabled: true,
      nhisEnabled: true,
      annualRentNgn: 2_400_000,
      annualLifeAssuranceNgn: 240_000,
      voluntaryPensionPct: 2,
      extraDeductionsMonthlyNgn: 30_000,
    });

    expect(r.pensionEmployeeMonthlyNgn).toBe(Math.round(800_000 * PENSION_EMPLOYEE_RATE));
    expect(r.nhfMonthlyNgn).toBe(Math.round(800_000 * NHF_RATE));
    expect(r.nhisEmployeeMonthlyNgn).toBe(Math.round(800_000 * NHIS_EMPLOYEE_RATE));
    expect(r.rentReliefMonthlyNgn).toBe(Math.round(2_400_000 * RENT_RELIEF_RATE / 12));
    expect(r.lifeAssuranceMonthlyNgn).toBe(20_000);
    expect(r.voluntaryPensionMonthlyNgn).toBe(Math.round(800_000 * 0.02));
    expect(r.extraDeductionsMonthlyNgn).toBe(30_000);
    expect(r.netMonthlyNgn).toBeGreaterThan(0);
    expect(r.netMonthlyNgn).toBeLessThan(800_000);
  });

  it('all deductions disabled', () => {
    const r = computePayslip({
      grossMonthlyNgn: 300_000,
      pensionEnabled: false,
      nhfEnabled: false,
      nhisEnabled: false,
      payeEnabled: false,
    });
    expect(r.pensionEmployeeMonthlyNgn).toBe(0);
    expect(r.nhfMonthlyNgn).toBe(0);
    expect(r.nhisEmployeeMonthlyNgn).toBe(0);
    expect(r.payeMonthlyNgn).toBe(0);
    expect(r.netMonthlyNgn).toBe(300_000);
  });
});

describe('AVC — Additional Voluntary Contribution (PRA 2014 s.4.3)', () => {
  it('deducts voluntary pension on pension base, pre-tax', () => {
    const base = computePayslip({ grossMonthlyNgn: 500_000, pensionEnabled: true });
    const withAvc = computePayslip({ grossMonthlyNgn: 500_000, pensionEnabled: true, voluntaryPensionPct: 5 });
    expect(withAvc.voluntaryPensionMonthlyNgn).toBeGreaterThan(0);
    // AVC reduces chargeable income → PAYE should be lower
    expect(withAvc.payeMonthlyNgn).toBeLessThan(base.payeMonthlyNgn);
    // Net is lower because AVC deduction exceeds the PAYE savings
    expect(withAvc.netMonthlyNgn).toBeLessThan(base.netMonthlyNgn);
  });

  it('is zero when voluntaryPensionPct is 0 or omitted', () => {
    const r1 = computePayslip({ grossMonthlyNgn: 500_000, voluntaryPensionPct: 0 });
    const r2 = computePayslip({ grossMonthlyNgn: 500_000 });
    expect(r1.voluntaryPensionMonthlyNgn).toBe(0);
    expect(r2.voluntaryPensionMonthlyNgn).toBe(0);
  });

  it('is zero when pension is disabled', () => {
    const r = computePayslip({ grossMonthlyNgn: 500_000, pensionEnabled: false, voluntaryPensionPct: 10 });
    expect(r.voluntaryPensionMonthlyNgn).toBe(0);
  });
});

describe('Employer-borne statutory contributions', () => {
  it('calculates 1% NSITF on monthly payroll', () => {
    expect(calculateNSITF(0)).toBe(0);
    expect(calculateNSITF(10_000_000)).toBe(100_000);
    expect(calculateNSITF(2_500_000)).toBe(25_000);
  });

  it('calculates 1% ITF only when the firm is eligible', () => {
    expect(calculateITF(120_000_000, true)).toBe(1_200_000);
    expect(calculateITF(120_000_000, false)).toBe(0);
    expect(calculateITF(0, true)).toBe(0);
  });
});

describe('computePayslip — rounding consistency', () => {
  it('all monetary outputs are whole naira (no decimals)', () => {
    const inputs = [
      { grossMonthlyNgn: 133_333, pensionEnabled: true, nhfEnabled: true },
      { grossMonthlyNgn: 77_777, pensionEnabled: true, nhisEnabled: true },
      { grossMonthlyNgn: 999_999, pensionEnabled: true, nhfEnabled: true, nhisEnabled: true },
      { grossMonthlyNgn: 1, pensionEnabled: true },
    ];
    for (const input of inputs) {
      const r = computePayslip(input);
      expect(Number.isInteger(r.grossMonthlyNgn)).toBe(true);
      expect(Number.isInteger(r.payableGrossMonthlyNgn)).toBe(true);
      expect(Number.isInteger(r.pensionEmployeeMonthlyNgn)).toBe(true);
      expect(Number.isInteger(r.pensionEmployerMonthlyNgn)).toBe(true);
      expect(Number.isInteger(r.nhfMonthlyNgn)).toBe(true);
      expect(Number.isInteger(r.nhisEmployeeMonthlyNgn)).toBe(true);
      expect(Number.isInteger(r.payeMonthlyNgn)).toBe(true);
      expect(Number.isInteger(r.netMonthlyNgn)).toBe(true);
      expect(Number.isInteger(r.statutoryDeductionsMonthlyNgn)).toBe(true);
      expect(Number.isInteger(r.nsitfMonthlyNgn)).toBe(true);
    }
  });

  it('aggregate rounding drift stays within ±₦1 per component per employee', () => {
    // Verify that sum-of-rounds ≈ round-of-sum for a typical payslip.
    const gross = 333_333;
    const r = computePayslip({ grossMonthlyNgn: gross, pensionEnabled: true, nhfEnabled: true, nhisEnabled: true });
    const recomputedNet = r.grossMonthlyNgn
      - r.unpaidLeaveDeductionMonthlyNgn
      - r.pensionEmployeeMonthlyNgn
      - r.voluntaryPensionMonthlyNgn
      - r.nhfMonthlyNgn
      - r.nhisEmployeeMonthlyNgn
      - r.payeMonthlyNgn
      - r.extraDeductionsMonthlyNgn;
    // Net should match the recomputed value exactly (sum-of-rounds identity)
    expect(r.netMonthlyNgn).toBe(Math.max(0, recomputedNet));
  });
});
