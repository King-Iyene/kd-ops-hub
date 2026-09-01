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

/** NHIS contribution — NHIA Act 2022 s.26: 5% employee + 10% employer of basic salary. */
export const NHIS_EMPLOYEE_RATE = 0.05;
export const NHIS_EMPLOYER_RATE = 0.10;

/** Rent relief — NTA 2025 s.30: 20% of annual rent paid, capped at ₦500,000/year. */
export const RENT_RELIEF_RATE = 0.20;
export const RENT_RELIEF_CAP_ANNUAL = 500_000;

/** Assumed working days per calendar month, used to derive a daily rate for unpaid leave. */
export const DEFAULT_WORKING_DAYS_PER_MONTH = 22;

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
  /** Whether PAYE applies (default true). When false, PAYE is 0 and excluded
   *  from statutory deductions and net — e.g. an employee exempted from PAYE. */
  payeEnabled?: boolean;
  /** Whether to deduct 5% NHIS employee contribution (default false; sectoral). */
  nhisEnabled?: boolean;
  /** Annual rent paid by the employee, in NGN. Used for the 20% rent relief. */
  annualRentNgn?: number;
  /** Annual life-assurance / annuity premium paid (NTA s.31 — deductible). */
  annualLifeAssuranceNgn?: number;
  /** Other extra deductions (loans, advances, etc.) — applied AFTER tax. */
  extraDeductionsMonthlyNgn?: number;
  /** Approved unpaid-leave days this period. Deducted from gross BEFORE tax
   *  at a daily rate of grossMonthlyNgn / workingDaysPerMonth (default 22). */
  unpaidLeaveDays?: number;
  /** Working days assumed per month for the unpaid-leave daily rate. Default 22. */
  workingDaysPerMonth?: number;

  // ─── NEW (Sprint A): salary component breakdown ─────────────────────────
  // When `useComponents` is TRUE these override the statutory bases:
  //   pension base = basic + housing + transport       (PRA 2014 s.4)
  //   NHF base     = basic only                         (NHF Act s.4)
  // When FALSE (default), pension and NHF still apply to full gross —
  // preserves the legacy (and over-conservative) behavior.
  useComponents?: boolean;
  basicMonthlyNgn?: number;
  housingMonthlyNgn?: number;
  transportMonthlyNgn?: number;
  otherAllowancesMonthlyNgn?: number;
  /** Additional Voluntary Contribution (AVC) — percentage of pension base
   *  above the statutory 8%. PRA 2014 s.4(3). Applied on top of the mandatory
   *  8% and deducted pre-tax like the mandatory pension contribution. */
  voluntaryPensionPct?: number;
}

export interface PayslipBreakdown {
  grossMonthlyNgn: number;
  /** Gross after subtracting the unpaid-leave deduction — the amount that
   *  actually flows into statutory bases and tax. Equals grossMonthlyNgn
   *  when unpaidLeaveDays is 0. */
  payableGrossMonthlyNgn: number;
  /** Daily rate used for the unpaid-leave deduction (payableGross basis: grossMonthlyNgn / workingDaysPerMonth). */
  dailyRateMonthlyNgn: number;
  /** unpaidLeaveDays × dailyRateMonthlyNgn. */
  unpaidLeaveDeductionMonthlyNgn: number;
  pensionEmployeeMonthlyNgn: number;
  pensionEmployerMonthlyNgn: number;
  nhfMonthlyNgn: number;
  nhisEmployeeMonthlyNgn: number;
  nhisEmployerMonthlyNgn: number;
  /** AVC — Additional Voluntary Contribution above mandatory 8%. */
  voluntaryPensionMonthlyNgn: number;
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

  // ─── NEW: bases used for statutory calcs (transparency for audit/payslip) ──
  pensionBaseMonthlyNgn: number;
  nhfBaseMonthlyNgn: number;
  usedComponents: boolean;

  // ─── NEW: employer-borne costs surfaced on payslip ─────────────────────
  nsitfMonthlyNgn: number;
}

/**
 * Compute a full payslip breakdown using the NTA 2025 regime.
 *
 * Order of operations (NTA 2025 s.30 + Pension Reform Act 2014):
 *   1. Compute gross.
 *   2. Subtract approved unpaid leave (days × gross/workingDaysPerMonth) to
 *      get the payable gross — everything below is based on this figure.
 *   3. Subtract employee pension (8%) and NHF (2.5%) if applicable.
 *   4. Subtract employee NHIS (5%) if applicable.
 *   5. Subtract rent relief: min(20% × annual rent, ₦500,000) / 12.
 *   6. Subtract life-assurance / annuity premiums (annual / 12).
 *   7. Apply NTA 2025 bands to the resulting chargeable income.
 *   8. Net pay = gross − unpaid leave − statutory deductions − PAYE − extra deductions.
 *
 * All results are returned as monthly NGN values, rounded to whole Naira.
 */
export function computePayslip(input: PayslipInput): PayslipBreakdown {
  const grossMonthlyNgn = Math.max(0, input.grossMonthlyNgn || 0);

  // Unpaid leave: deduct daily-rate × days from gross BEFORE tax so it
  // reduces the taxable (and pensionable) base, not just take-home.
  const workingDaysPerMonth = input.workingDaysPerMonth && input.workingDaysPerMonth > 0
    ? input.workingDaysPerMonth
    : DEFAULT_WORKING_DAYS_PER_MONTH;
  const unpaidLeaveDays = Math.max(0, input.unpaidLeaveDays || 0);
  const dailyRateMonthlyNgn = grossMonthlyNgn / workingDaysPerMonth;
  const unpaidLeaveDeductionMonthlyNgn = Math.min(
    grossMonthlyNgn,
    unpaidLeaveDays * dailyRateMonthlyNgn,
  );
  const payableGrossMonthlyNgn = grossMonthlyNgn - unpaidLeaveDeductionMonthlyNgn;

  // Resolve the statutory deduction bases. With components enabled:
  //   pension base = basic + housing + transport
  //   NHF base     = basic only
  // Without components (legacy): both bases = gross.
  // Both fall back to the post-unpaid-leave gross so leave days also
  // reduce pension/NHF contributions proportionally.
  const usedComponents = !!input.useComponents;
  const basicComp     = Math.max(0, input.basicMonthlyNgn      || 0);
  const housingComp   = Math.max(0, input.housingMonthlyNgn    || 0);
  const transportComp = Math.max(0, input.transportMonthlyNgn  || 0);

  // When the employee is on the salary-components plan, prorate the
  // components sum by the same leave factor that already reduced the
  // flat-gross path via payableGrossMonthlyNgn. Without this, a
  // components-plan employee taking unpaid leave would have pension/NHF
  // calculated on the full unreduced components sum even though PAYE
  // correctly prorates — over-deducting roughly ₦10k per 5-day absence.
  const leaveFactor = grossMonthlyNgn > 0
    ? payableGrossMonthlyNgn / grossMonthlyNgn
    : 1;

  const pensionBaseMonthlyNgn = usedComponents
    ? (basicComp + housingComp + transportComp) * leaveFactor
    : payableGrossMonthlyNgn;
  const nhfBaseMonthlyNgn = usedComponents
    ? basicComp * leaveFactor
    : payableGrossMonthlyNgn;

  const pensionEmployeeMonthlyNgn = input.pensionEnabled !== false
    ? pensionBaseMonthlyNgn * PENSION_EMPLOYEE_RATE
    : 0;
  const pensionEmployerMonthlyNgn = input.pensionEnabled !== false
    ? pensionBaseMonthlyNgn * PENSION_EMPLOYER_RATE
    : 0;

  const voluntaryPensionPct = Math.max(0, input.voluntaryPensionPct || 0) / 100;
  const voluntaryPensionMonthlyNgn = input.pensionEnabled !== false
    ? pensionBaseMonthlyNgn * voluntaryPensionPct
    : 0;

  const nhfMonthlyNgn = input.nhfEnabled
    ? nhfBaseMonthlyNgn * NHF_RATE
    : 0;

  // NHIS employee/employer is calculated on basic salary when components
  // are active; otherwise gross (legacy behavior). Prorated by leave
  // factor so unpaid leave reduces the NHIS base consistently.
  const nhisBase = usedComponents ? basicComp * leaveFactor : payableGrossMonthlyNgn;
  const nhisEmployeeMonthlyNgn = input.nhisEnabled
    ? nhisBase * NHIS_EMPLOYEE_RATE
    : 0;
  const nhisEmployerMonthlyNgn = input.nhisEnabled
    ? nhisBase * NHIS_EMPLOYER_RATE
    : 0;

  // NSITF — 1% of payable gross, employer-borne. Always shown for
  // transparency; payroll consumer decides whether to add it to employer cost.
  const nsitfMonthlyNgn = payableGrossMonthlyNgn * NSITF_RATE;

  const annualRent = Math.max(0, input.annualRentNgn || 0);
  const rentReliefAnnual = Math.min(annualRent * RENT_RELIEF_RATE, RENT_RELIEF_CAP_ANNUAL);
  const rentReliefMonthlyNgn = rentReliefAnnual / 12;

  const lifeAssuranceMonthlyNgn = Math.max(0, (input.annualLifeAssuranceNgn || 0) / 12);

  const chargeableMonthlyNgn = Math.max(
    0,
    payableGrossMonthlyNgn
      - pensionEmployeeMonthlyNgn
      - voluntaryPensionMonthlyNgn
      - nhfMonthlyNgn
      - nhisEmployeeMonthlyNgn
      - rentReliefMonthlyNgn
      - lifeAssuranceMonthlyNgn,
  );

  const annualPaye = applyTaxBands(chargeableMonthlyNgn * 12);
  const payeMonthlyNgn = input.payeEnabled !== false ? annualPaye / 12 : 0;

  const rPension = round(pensionEmployeeMonthlyNgn);
  const rAvc = round(voluntaryPensionMonthlyNgn);
  const rNhf = round(nhfMonthlyNgn);
  const rNhis = round(nhisEmployeeMonthlyNgn);
  const rPaye = round(payeMonthlyNgn);
  const rUnpaidLeave = round(unpaidLeaveDeductionMonthlyNgn);
  const statutoryDeductionsMonthlyNgn = rPension + rAvc + rNhf + rNhis + rPaye;

  const extraDeductionsMonthlyNgn = Math.max(0, input.extraDeductionsMonthlyNgn || 0);

  const netMonthlyNgn = Math.max(
    0,
    round(grossMonthlyNgn) - rUnpaidLeave - statutoryDeductionsMonthlyNgn - round(extraDeductionsMonthlyNgn),
  );

  const effectiveTaxRate = payableGrossMonthlyNgn > 0 ? payeMonthlyNgn / payableGrossMonthlyNgn : 0;

  return {
    grossMonthlyNgn: round(grossMonthlyNgn),
    payableGrossMonthlyNgn: round(payableGrossMonthlyNgn),
    dailyRateMonthlyNgn: round(dailyRateMonthlyNgn),
    unpaidLeaveDeductionMonthlyNgn: rUnpaidLeave,
    pensionEmployeeMonthlyNgn: round(pensionEmployeeMonthlyNgn),
    pensionEmployerMonthlyNgn: round(pensionEmployerMonthlyNgn),
    voluntaryPensionMonthlyNgn: round(voluntaryPensionMonthlyNgn),
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
    pensionBaseMonthlyNgn: round(pensionBaseMonthlyNgn),
    nhfBaseMonthlyNgn: round(nhfBaseMonthlyNgn),
    usedComponents,
    nsitfMonthlyNgn: round(nsitfMonthlyNgn),
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
