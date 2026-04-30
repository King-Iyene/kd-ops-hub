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
  calculateNSITF,
  calculateITF,
  TAX_BANDS_NTA_2025,
  PENSION_EMPLOYEE_RATE,
  NHF_RATE,
  RENT_RELIEF_CAP_ANNUAL,
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
