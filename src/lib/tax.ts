/**
 * Nigerian statutory deductions engine — Nigeria Tax Act 2025.
 * Effective 1 January 2026, signed into law June 2025.
 *
 * What changed from the pre-2026 PITA regime:
 *   - Consolidated Relief Allowance (CRA) was ABOLISHED.
 *     Old formula deducted ₦200,000 + 20% of gross before applying bands;
 *     under NTA 2025 there is no flat allowance.
 *   - First ₦800,000/year is fully exempt (was ₦300,000 at 7%).
 *   - Six new bands rising from 15% to 25% (was 7%–24%).
 *   - New rent relief: 20% of annual rent paid, capped at ₦500,000/year.
 *   - Pension, NHF and life-assurance contributions remain deductible
 *     before tax (Pension Reform Act 2014, NHF Act, NTA s.31).
 *
 * Statutory rates kept centralised here so payroll, payslip rendering and
 * the compliance autopilot all read from one source of truth.
 *
 * Tax bands (annual chargeable income, NGN) — NTA 2025 First Schedule:
 *   ₦0 – 800,000           → 0%   (exempt)
 *   ₦800,001 – 3,000,000   → 15%  (next ₦2,200,000)
 *   ₦3,000,001 – 12,000,000 → 18%  (next ₦9,000,000)
 *   ₦12,000,001 – 25,000,000 → 21%  (next ₦13,000,000)
 *   ₦25,000,001 – 50,000,000 → 23%  (next ₦25,000,000)
 *   above ₦50,000,000      → 25%
 */

// ---------------------------------------------------------------------------
// Tax bands — Nigeria Tax Act 2025
// ---------------------------------------------------------------------------

export interface TaxBand {
  /** Width of the slice in NGN (use Infinity for the topmost band). */
  limit: number;
  /** Marginal rate as a decimal (0.15 = 15%). */
  rate: number;
}

/** Annual PIT bands per NTA 2025 First Schedule. Width-based (slice form). */
export const TAX_BANDS_NTA_2025: ReadonlyArray<TaxBand> = [
  { limit:    800_000, rate: 0.00 },
  { limit:  2_200_000, rate: 0.15 },
  { limit:  9_000_000, rate: 0.18 },
  { limit: 13_000_000, rate: 0.21 },
  { limit: 25_000_000, rate: 0.23 },
  { limit:   Infinity, rate: 0.25 },
];

/** Date the NTA 2025 bands took effect. */
export const TAX_REGIME_EFFECTIVE_DATE = '2026-01-01';

// ---------------------------------------------------------------------------
// Statutory deduction rates
// ---------------------------------------------------------------------------

/** Pension Reform Act 2014 — minimum employee contribution. */
export const PENSION_EMPLOYEE_RATE = 0.08;
/** Pension Reform Act 2014 — minimum employer contribution. */
export const PENSION_EMPLOYER_RATE = 0.10;

/** NHF Act — 2.5% of monthly basic salary, employee-borne. Voluntary for some sectors. */
export const NHF_RATE = 0.025;

/** NSITF Employee Compensation Act — 1% of total monthly payroll, employer-borne only. */
export const NSITF_RATE = 0.01;

/** ITF Act — 1% of annual payroll, employer-only. Applies to firms with ≥ 5 staff or ≥ ₦50M turnover. */
export const ITF_RATE = 0.01;

/** NHIS contribution — typically 5% employer + 5% employee of basic salary. Sectoral. */
export const NHIS_EMPLOYEE_RATE = 0.05;
export const NHIS_EMPLOYER_RATE = 0.05;

/** Rent relief — NTA 2025 s.30: 20% of annual rent paid, capped at ₦500,000/year. */
export const RENT_RELIEF_RATE = 0.20;
export const RENT_RELIEF_CAP_ANNUAL = 500_000;

// ---------------------------------------------------------------------------
// PAYE — bands-only path (the public, simple API)
// ---------------------------------------------------------------------------

/**
 * Apply the NTA 2025 bands to an annual chargeable income.
 * Returns annual PAYE in NGN. Negative inputs return 0.
 */
export function applyTaxBands(annualChargeable: number): number {
  if (annualChargeable <= 0) return 0;
  let remaining = annualChargeable;
  let tax = 0;
  for (const { limit, rate } of TAX_BANDS_NTA_2025) {
    if (remaining <= 0) break;
    const slice = Math.min(remaining, limit);
    tax += slice * rate;
    remaining -= slice;
  }
  return tax;
}

/**
 * Calculate monthly PAYE for a monthly gross salary, ASSUMING no other
 * pre-tax deductions. Use {@link computePayslip} for the accurate
 * full-breakdown computation that subtracts pension and NHF first.
 *
 * Kept for backwards-compatibility with call sites that only know gross.
 *
 * @param monthlySalaryNgn Monthly gross in NGN. Negative → 0.
 */
export function calculatePAYE(monthlySalaryNgn: number): number {
  if (monthlySalaryNgn <= 0) return 0;
  const annualTax = applyTaxBands(monthlySalaryNgn * 12);
  return Math.round(annualTax / 12);
}

/** Effective PAYE rate as a percentage string for UI display. */
export function effectivePAYERate(grossMonthly: number): string {
  if (grossMonthly <= 0) return '0.00%';
  return ((calculatePAYE(grossMonthly) / grossMonthly) * 100).toFixed(2) + '%';
}

// ---------------------------------------------------------------------------
// Full payslip computation — the accurate path
// ---------------------------------------------------------------------------

export interface PayslipInput {
  /** Monthly gross salary in NGN. */
  grossMonthlyNgn: number;
  /** Whether to deduct 8% pension (default true; PRA exempts firms with < 3 staff). */
  pensionEnabled?: boolean;
  /** Whether to deduct 2.5% NHF (default false; voluntary for some employees). */
  nhfEnabled?: boolean;
  /** Whether to deduct 5% NHIS employee contribution (default false; sectoral). */
  nhisEnabled?: boolean;
  /** Annual rent paid by the employee, in NGN. Used for the 20% rent relief. */
  annualRentNgn?: number;
  /** Annual life-assurance / annuity premium paid (NTA s.31 — deductible). */
  annualLifeAssuranceNgn?: number;
  /** Other extra deductions (loans, advances, etc.) — applied AFTER tax. */
  extraDeductionsMonthlyNgn?: number;
}

export interface PayslipBreakdown {
  grossMonthlyNgn: number;
  pensionEmployeeMonthlyNgn: number;
  pensionEmployerMonthlyNgn: number;
  nhfMonthlyNgn: number;
  nhisEmployeeMonthlyNgn: number;
  nhisEmployerMonthlyNgn: number;
  /** Monthly rent relief (annual relief / 12). */
  rentReliefMonthlyNgn: number;
  /** Monthly life-assurance relief (annual / 12). */
  lifeAssuranceMonthlyNgn: number;
  /** Monthly chargeable income after pre-tax deductions/reliefs. */
  chargeableMonthlyNgn: number;
  payeMonthlyNgn: number;
  /** Sum of statutory employee deductions taken from gross. */
  statutoryDeductionsMonthlyNgn: number;
  /** Operator-specified extras (loans, advances, garnishments). */
  extraDeductionsMonthlyNgn: number;
  /** Take-home pay. */
  netMonthlyNgn: number;
  /** Effective tax rate (PAYE / gross), as a decimal. */
  effectiveTaxRate: number;
}

/**
 * Compute a full payslip breakdown using the NTA 2025 regime.
 *
 * Order of operations (NTA 2025 s.30 + Pension Reform Act 2014):
 *   1. Compute gross.
 *   2. Subtract employee pension (8%) and NHF (2.5%) if applicable.
 *   3. Subtract employee NHIS (5%) if applicable.
 *   4. Subtract rent relief: min(20% × annual rent, ₦500,000) / 12.
 *   5. Subtract life-assurance / annuity premiums (annual / 12).
 *   6. Apply NTA 2025 bands to the resulting chargeable income.
 *   7. Net pay = gross − statutory deductions − PAYE − extra deductions.
 *
 * All results are returned as monthly NGN values, rounded to whole Naira.
 */
export function computePayslip(input: PayslipInput): PayslipBreakdown {
  const grossMonthlyNgn = Math.max(0, input.grossMonthlyNgn || 0);

  const pensionEmployeeMonthlyNgn = input.pensionEnabled !== false
    ? grossMonthlyNgn * PENSION_EMPLOYEE_RATE
    : 0;
  const pensionEmployerMonthlyNgn = input.pensionEnabled !== false
    ? grossMonthlyNgn * PENSION_EMPLOYER_RATE
    : 0;

  const nhfMonthlyNgn = input.nhfEnabled
    ? grossMonthlyNgn * NHF_RATE
    : 0;

  const nhisEmployeeMonthlyNgn = input.nhisEnabled
    ? grossMonthlyNgn * NHIS_EMPLOYEE_RATE
    : 0;
  const nhisEmployerMonthlyNgn = input.nhisEnabled
    ? grossMonthlyNgn * NHIS_EMPLOYER_RATE
    : 0;

  const annualRent = Math.max(0, input.annualRentNgn || 0);
  const rentReliefAnnual = Math.min(annualRent * RENT_RELIEF_RATE, RENT_RELIEF_CAP_ANNUAL);
  const rentReliefMonthlyNgn = rentReliefAnnual / 12;

  const lifeAssuranceMonthlyNgn = Math.max(0, (input.annualLifeAssuranceNgn || 0) / 12);

  const chargeableMonthlyNgn = Math.max(
    0,
    grossMonthlyNgn
      - pensionEmployeeMonthlyNgn
      - nhfMonthlyNgn
      - nhisEmployeeMonthlyNgn
      - rentReliefMonthlyNgn
      - lifeAssuranceMonthlyNgn,
  );

  const annualPaye = applyTaxBands(chargeableMonthlyNgn * 12);
  const payeMonthlyNgn = annualPaye / 12;

  const statutoryDeductionsMonthlyNgn =
    pensionEmployeeMonthlyNgn + nhfMonthlyNgn + nhisEmployeeMonthlyNgn + payeMonthlyNgn;

  const extraDeductionsMonthlyNgn = Math.max(0, input.extraDeductionsMonthlyNgn || 0);

  const netMonthlyNgn = Math.max(
    0,
    grossMonthlyNgn - statutoryDeductionsMonthlyNgn - extraDeductionsMonthlyNgn,
  );

  const effectiveTaxRate = grossMonthlyNgn > 0 ? payeMonthlyNgn / grossMonthlyNgn : 0;

  return {
    grossMonthlyNgn: round(grossMonthlyNgn),
    pensionEmployeeMonthlyNgn: round(pensionEmployeeMonthlyNgn),
    pensionEmployerMonthlyNgn: round(pensionEmployerMonthlyNgn),
    nhfMonthlyNgn: round(nhfMonthlyNgn),
    nhisEmployeeMonthlyNgn: round(nhisEmployeeMonthlyNgn),
    nhisEmployerMonthlyNgn: round(nhisEmployerMonthlyNgn),
    rentReliefMonthlyNgn: round(rentReliefMonthlyNgn),
    lifeAssuranceMonthlyNgn: round(lifeAssuranceMonthlyNgn),
    chargeableMonthlyNgn: round(chargeableMonthlyNgn),
    payeMonthlyNgn: round(payeMonthlyNgn),
    statutoryDeductionsMonthlyNgn: round(statutoryDeductionsMonthlyNgn),
    extraDeductionsMonthlyNgn: round(extraDeductionsMonthlyNgn),
    netMonthlyNgn: round(netMonthlyNgn),
    effectiveTaxRate: Number(effectiveTaxRate.toFixed(4)),
  };
}

// ---------------------------------------------------------------------------
// Employer-borne contributions (not deducted from employee pay)
// ---------------------------------------------------------------------------

/** Employer NSITF contribution for one month, given total monthly payroll. */
export function calculateNSITF(totalMonthlyPayrollNgn: number): number {
  if (totalMonthlyPayrollNgn <= 0) return 0;
  return Math.round(totalMonthlyPayrollNgn * NSITF_RATE);
}

/**
 * Employer ITF contribution. ITF is annual and only applies to firms with
 * ≥ 5 staff or ≥ ₦50M turnover. Pass `eligible=false` to skip.
 */
export function calculateITF(annualPayrollNgn: number, eligible = true): number {
  if (!eligible || annualPayrollNgn <= 0) return 0;
  return Math.round(annualPayrollNgn * ITF_RATE);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round(n: number): number {
  return Math.round(n);
}
