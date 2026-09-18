/**
 * Independent arithmetic verification of the payroll engine.
 *
 * Every expected figure here is derived by hand from the regulations —
 * Nigeria Tax Act 2025 bands, Pension Reform Act 2014 s.4, NHF Act s.4 —
 * and written out as an explicit calculation rather than read off what
 * computePayslip() happens to return. That is the whole point: tests that
 * assert the implementation against itself cannot catch a wrong rate or a
 * wrong base, and this is the code that decides what real people are paid.
 *
 * Working is shown in comments so the next person can re-derive it without
 * trusting either the code or this file.
 */
import { describe, it, expect } from 'vitest';
import { computePayslip, applyTaxBands } from '@/lib/tax';

describe('payroll arithmetic, verified against the regulations', () => {
  it('KD Squares staff on N500,000 with components', () => {
    const r = computePayslip({
      grossMonthlyNgn: 500_000,
      useComponents: true,
      basicMonthlyNgn: 250_000,
      housingMonthlyNgn: 125_000,
      transportMonthlyNgn: 75_000,
      otherAllowancesMonthlyNgn: 50_000,
      pensionEnabled: true,
      nhfEnabled: true,
      payeEnabled: true,
    });
    // Hand-derived:
    // pension base = 250k+125k+75k = 450,000 -> 8% = 36,000 ; employer 10% = 45,000
    // NHF = 2.5% of basic 250,000 = 6,250
    expect(r.pensionEmployeeMonthlyNgn).toBe(36_000);
    expect(r.pensionEmployerMonthlyNgn).toBe(45_000);
    expect(r.nhfMonthlyNgn).toBe(6_250);

    // chargeable annual = (500,000 - 36,000 - 6,250) * 12 = 5,493,000
    const chargeableAnnual = (500_000 - 36_000 - 6_250) * 12;
    expect(chargeableAnnual).toBe(5_493_000);
    // bands: 0 on first 800k; 15% on 2.2m = 330,000; 18% on 2,493,000 = 448,740
    const expectedAnnualTax = 0 + 2_200_000 * 0.15 + 2_493_000 * 0.18;
    expect(expectedAnnualTax).toBe(778_740);
    expect(applyTaxBands(chargeableAnnual)).toBeCloseTo(778_740, 2);
    expect(r.payeMonthlyNgn).toBe(Math.round(778_740 / 12)); // 64,895

    // net = gross - pension - nhf - paye
    expect(r.netMonthlyNgn).toBe(500_000 - 36_000 - 6_250 - 64_895);

    // identity: net = gross - statutory - extras
    expect(r.netMonthlyNgn).toBe(
      r.payableGrossMonthlyNgn - r.statutoryDeductionsMonthlyNgn - r.extraDeductionsMonthlyNgn,
    );
  });

  it('low earner below the 0% threshold pays no PAYE', () => {
    const r = computePayslip({ grossMonthlyNgn: 60_000, pensionEnabled: true });
    // 60,000*12 = 720,000 gross annual; after 8% pension it is well under 800,000
    expect(r.payeMonthlyNgn).toBe(0);
    expect(r.netMonthlyNgn).toBe(60_000 - r.pensionEmployeeMonthlyNgn);
  });

  it('director on N2,000,000 reaches the 21% band', () => {
    const r = computePayslip({
      grossMonthlyNgn: 2_000_000,
      useComponents: true,
      basicMonthlyNgn: 1_000_000,
      housingMonthlyNgn: 500_000,
      transportMonthlyNgn: 300_000,
      otherAllowancesMonthlyNgn: 200_000,
      pensionEnabled: true,
      nhfEnabled: false,
    });
    expect(r.pensionEmployeeMonthlyNgn).toBe(Math.round(1_800_000 * 0.08)); // 144,000
    const chargeableAnnual = (2_000_000 - 144_000) * 12; // 22,272,000
    expect(chargeableAnnual).toBe(22_272_000);
    // 0 + 2.2m*.15=330,000 + 9m*.18=1,620,000 + (22,272,000-12,000,000)=10,272,000*.21=2,157,120
    const expected = 330_000 + 1_620_000 + 10_272_000 * 0.21;
    expect(applyTaxBands(chargeableAnnual)).toBeCloseTo(expected, 2);
    expect(r.payeMonthlyNgn).toBe(Math.round(expected / 12));
  });

  it('true cost to company = gross + employer contributions', () => {
    const r = computePayslip({
      grossMonthlyNgn: 500_000,
      useComponents: true,
      basicMonthlyNgn: 250_000, housingMonthlyNgn: 125_000,
      transportMonthlyNgn: 75_000, otherAllowancesMonthlyNgn: 50_000,
      pensionEnabled: true,
    });
    expect(r.pensionEmployerMonthlyNgn).toBe(45_000);
    expect(500_000 + r.pensionEmployerMonthlyNgn).toBe(545_000);
  });
});
