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

/**
 * NTA 2025 s.58 — no PAYE at or below the national minimum wage.
 *
 * Figures worked out by hand from the Act, not from the engine's constants,
 * so a wrong threshold or a wrong base fails here instead of moving with it.
 */
describe('NTA 2025 s.58 — national minimum wage exemption', () => {
  it('charges nothing at exactly the minimum wage when no statutory deductions apply', () => {
    // NGN 70,000 x 12 = NGN 840,000 chargeable with pension/NHF/NHIS all off.
    // The bands alone would take 15% of the NGN 40,000 above the NGN 800,000
    // zero-rated band = NGN 6,000 a year, NGN 500 a month. s.58 says nil.
    const r = computePayslip({
      grossMonthlyNgn: 70_000,
      pensionEnabled: false,
      nhfEnabled: false,
      nhisEnabled: false,
    });
    expect(r.payeMonthlyNgn).toBe(0);
  });

  it('charges nothing below the minimum wage', () => {
    const r = computePayslip({
      grossMonthlyNgn: 55_000,
      pensionEnabled: false,
      nhfEnabled: false,
      nhisEnabled: false,
    });
    expect(r.payeMonthlyNgn).toBe(0);
  });

  it('still charges the person one Naira above the threshold', () => {
    // The exemption is a cliff in the Act, not a taper: NGN 70,001 is taxed
    // normally. Pinned so nobody "smooths" it into a taper later.
    const r = computePayslip({
      grossMonthlyNgn: 70_001,
      pensionEnabled: false,
      nhfEnabled: false,
      nhisEnabled: false,
    });
    expect(r.payeMonthlyNgn).toBeGreaterThan(0);
  });

  it('does not exempt a high earner whose month was shortened by unpaid leave', () => {
    // The trap, with figures chosen so only the trap can explain the result.
    // NGN 770,000 a month, 20 of 22 days unpaid, leaves exactly NGN 70,000
    // payable — right on the threshold. Had the exemption been tested against
    // the payable figure instead of the wage, this NGN 9.24m-a-year earner
    // would walk away untaxed for the month.
    //
    // Taxed properly: NGN 70,000 x 12 = NGN 840,000 chargeable, of which
    // NGN 40,000 sits above the zero-rated band at 15% = NGN 6,000 a year,
    // NGN 500 a month.
    const r = computePayslip({
      grossMonthlyNgn: 770_000,
      unpaidLeaveDays: 20,
      workingDaysPerMonth: 22,
      pensionEnabled: false,
      nhfEnabled: false,
      nhisEnabled: false,
    });
    expect(r.payeMonthlyNgn).toBe(500);
  });

  it('leaves an ordinary salary untouched', () => {
    const r = computePayslip({ grossMonthlyNgn: 450_000 });
    expect(r.payeMonthlyNgn).toBeGreaterThan(0);
  });
});

/**
 * Does the payslip add up as printed?
 *
 * Every figure on a payslip is rounded to whole Naira on its own. Round the
 * parts independently and the printed sum can land a Naira away from the
 * printed total — which to the person holding it is simply an arithmetic
 * error, and the one kind of mistake that costs trust instantly even though
 * the amount is trivial.
 *
 * Swept rather than sampled: a rounding seam shows up at specific figures,
 * not at the round numbers a hand-written test would reach for.
 */
describe('a payslip reconciles as printed', () => {
  it('gross minus every deduction shown equals the net shown, across the salary range', () => {
    const offenders: string[] = [];
    let checked = 0;

    for (let gross = 71_000; gross <= 2_000_000; gross += 1_237) {
      for (const useComponents of [false, true]) {
        const r = computePayslip({
          grossMonthlyNgn: gross,
          useComponents,
          basicMonthlyNgn: Math.round(gross * 0.5),
          housingMonthlyNgn: Math.round(gross * 0.2),
          transportMonthlyNgn: Math.round(gross * 0.1),
          nhfEnabled: true,
          nhisEnabled: true,
        });

        const shownDeductions =
          r.payeMonthlyNgn +
          r.pensionEmployeeMonthlyNgn +
          r.nhfMonthlyNgn +
          r.nhisEmployeeMonthlyNgn +
          r.voluntaryPensionMonthlyNgn +
          r.unpaidLeaveDeductionMonthlyNgn;

        checked++;
        const drift = gross - shownDeductions - r.netMonthlyNgn;
        if (drift !== 0 && offenders.length < 5) {
          offenders.push(`gross ${gross}, components=${useComponents}, off by ${drift}`);
        }
      }
    }

    expect(checked).toBeGreaterThan(3_000);
    expect(offenders).toEqual([]);
  });
});

/**
 * Per-employee statutory switches.
 *
 * Every one of these is exposed per employee, because real payrolls have
 * exemptions: someone already contributing to a scheme elsewhere, a
 * non-resident, a director outside NHF. The switches are easy to get right
 * on the line they name and easy to get wrong everywhere else, so what is
 * pinned here is the side effects:
 *
 *   - switching off an employee contribution must also stop the EMPLOYER
 *     being charged its matching share; billing the company for a scheme
 *     nobody is enrolled in is money out the door for nothing.
 *   - pension, NHF and NHIS are deductible before tax, so switching one off
 *     must RAISE PAYE. If it does not, the deduction was never reaching the
 *     chargeable-income calculation in the first place.
 *   - NSITF is an employer levy with no per-employee opt-out, so it must
 *     survive every switch being off.
 */
describe('per-employee statutory switches', () => {
  const base = {
    grossMonthlyNgn: 450_000,
    useComponents: true,
    basicMonthlyNgn: 225_000,
    housingMonthlyNgn: 90_000,
    transportMonthlyNgn: 45_000,
    nhfEnabled: true,
    nhisEnabled: true,
  };
  const allOn = computePayslip(base);

  it('switches PAYE off without disturbing anything else', () => {
    const r = computePayslip({ ...base, payeEnabled: false });
    expect(r.payeMonthlyNgn).toBe(0);
    expect(r.pensionEmployeeMonthlyNgn).toBe(allOn.pensionEmployeeMonthlyNgn);
    expect(r.nhfMonthlyNgn).toBe(allOn.nhfMonthlyNgn);
  });

  it('stops charging the employer when the employee is out of pension', () => {
    const r = computePayslip({ ...base, pensionEnabled: false });
    expect(r.pensionEmployeeMonthlyNgn).toBe(0);
    expect(r.pensionEmployerMonthlyNgn).toBe(0);
    // Pension is deductible, so losing it makes more income chargeable.
    expect(r.payeMonthlyNgn).toBeGreaterThan(allOn.payeMonthlyNgn);
  });

  it('stops charging the employer when the employee is out of NHIS', () => {
    const r = computePayslip({ ...base, nhisEnabled: false });
    expect(r.nhisEmployeeMonthlyNgn).toBe(0);
    expect(r.nhisEmployerMonthlyNgn).toBe(0);
    expect(r.payeMonthlyNgn).toBeGreaterThan(allOn.payeMonthlyNgn);
  });

  it('raises PAYE when NHF is switched off', () => {
    const r = computePayslip({ ...base, nhfEnabled: false });
    expect(r.nhfMonthlyNgn).toBe(0);
    expect(r.payeMonthlyNgn).toBeGreaterThan(allOn.payeMonthlyNgn);
  });

  it('pays the full gross when every switch is off', () => {
    const r = computePayslip({
      ...base,
      payeEnabled: false,
      pensionEnabled: false,
      nhfEnabled: false,
      nhisEnabled: false,
    });
    expect(r.netMonthlyNgn).toBe(450_000);
  });

  it('keeps NSITF, which is an employer levy and not a per-employee choice', () => {
    const r = computePayslip({
      ...base,
      payeEnabled: false,
      pensionEnabled: false,
      nhfEnabled: false,
      nhisEnabled: false,
    });
    expect(r.nsitfMonthlyNgn).toBe(4_500); // 1% of NGN 450,000
  });
});
