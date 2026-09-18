/**
 * Cumulative (year-to-date) PAYE — the correction for lumpy pay.
 *
 * WHY THIS EXISTS
 *
 * `computePayslip()` in tax.ts works out PAYE by annualising the month it is
 * looking at: `applyTaxBands(chargeableThisMonth * 12) / 12`. For a flat
 * salary that is exactly right, and it is what the engine has always done.
 *
 * It stops being right the moment pay is uneven. The bands are progressive,
 * so the tax function is convex, and by Jensen's inequality the average of
 * the tax on each month's annualised income is always at least the tax on
 * the average. Concretely, on the NTA 2025 bands:
 *
 *   flat NGN 400k/month, no bonus         over-withheld NGN 0
 *   the same + NGN 2.0m December bonus    over-withheld NGN 48,333   (4.8%)
 *   the same + NGN 6.0m December bonus    over-withheld NGN 293,000  (16.9%)
 *   NGN 60k/month + NGN 300k bonus        over-withheld NGN 14,300   (43.3%)
 *
 * The lowest earner is hurt worst in proportional terms, because a bonus is
 * what pushes them across the NGN 800k exemption: their bonus month is taxed
 * as though every month looked like it. Nothing later in the year gives the
 * money back — each month is computed from scratch — so the employee is out
 * of pocket until they file an annual return and claim it.
 *
 * THE METHOD
 *
 * Instead of pricing one month in isolation, look at the year so far:
 *
 *   1. cumulative chargeable = everything chargeable this tax year, this
 *      period included.
 *   2. project it to a full year: cumulative * 12 / periodIndex.
 *   3. full-year tax = applyTaxBands(projection).
 *   4. tax that should have been withheld by now = full-year tax
 *      * periodIndex / 12.
 *   5. withhold the difference between that and what has already been taken.
 *
 * A bonus therefore raises the projection in the month it is paid and the
 * excess unwinds over the remaining months, and in period 12 the projection
 * IS the actual year, so the final payslip trues the year up exactly. On a
 * flat salary every step collapses back to the existing behaviour, so
 * nothing changes for the employees whose pay never varies.
 *
 * NOT WIRED IN. `computePayslip()` still uses the per-month method. Switching
 * changes the take-home on every payslip where pay is uneven, which is a
 * decision for whoever owns payroll policy, not one to make inside a
 * refactor. This module is the tested implementation of the alternative.
 */
import { applyTaxBands } from '@/lib/tax';

export interface CumulativePayeInput {
  /** Chargeable income for THIS period, after statutory reliefs. */
  chargeableThisPeriodNgn: number;
  /** Chargeable income already taxed earlier in this SAME tax year. */
  chargeableYtdNgn?: number;
  /** PAYE already withheld earlier in this same tax year. */
  payeWithheldYtdNgn?: number;
  /** Which period of the tax year this is: 1 for January … 12 for December. */
  periodIndex: number;
  /** Periods in the tax year. 12 unless payroll runs on some other cadence. */
  periodsPerYear?: number;
}

export interface CumulativePayeResult {
  /** PAYE to withhold this period. Never negative — see creditCarriedNgn. */
  payeThisPeriodNgn: number;
  /** Chargeable income for the year so far, this period included. */
  chargeableYtdInclusiveNgn: number;
  /** The full-year income this period's figure was projected from. */
  projectedAnnualChargeableNgn: number;
  /** PAYE that should have been withheld by the end of this period. */
  payeDueToDateNgn: number;
  /**
   * Over-withholding this period would have had to refund to be exact.
   * Withholding cannot go negative on a payslip, so it is reported instead
   * and clears itself against later periods.
   */
  creditCarriedNgn: number;
}

const round = (n: number): number => Math.round(n);

export function computeCumulativePaye(input: CumulativePayeInput): CumulativePayeResult {
  const periodsPerYear = input.periodsPerYear && input.periodsPerYear > 0
    ? input.periodsPerYear
    : 12;

  // Clamp into the year: period 0 or 13 is a caller bug, and silently
  // projecting from it would produce a plausible-looking wrong number.
  const periodIndex = Math.min(
    Math.max(1, Math.round(input.periodIndex || 1)),
    periodsPerYear,
  );

  const thisPeriod = Math.max(0, input.chargeableThisPeriodNgn || 0);
  const priorChargeable = Math.max(0, input.chargeableYtdNgn || 0);
  const priorWithheld = Math.max(0, input.payeWithheldYtdNgn || 0);

  const chargeableYtdInclusiveNgn = priorChargeable + thisPeriod;

  const projectedAnnualChargeableNgn =
    chargeableYtdInclusiveNgn * (periodsPerYear / periodIndex);

  const fullYearPaye = applyTaxBands(projectedAnnualChargeableNgn);
  const payeDueToDateNgn = fullYearPaye * (periodIndex / periodsPerYear);

  const exactThisPeriod = payeDueToDateNgn - priorWithheld;

  return {
    payeThisPeriodNgn: round(Math.max(0, exactThisPeriod)),
    chargeableYtdInclusiveNgn: round(chargeableYtdInclusiveNgn),
    projectedAnnualChargeableNgn: round(projectedAnnualChargeableNgn),
    payeDueToDateNgn: round(payeDueToDateNgn),
    creditCarriedNgn: round(Math.max(0, -exactThisPeriod)),
  };
}
