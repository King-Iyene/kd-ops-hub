/**
 * Discretionary-deduction capping — kept as its own small, pure module
 * (rather than inlined in Payroll.tsx or folded into tax.ts) so the
 * "how much of a debt repayment could this payslip actually afford"
 * question is one isolated, unit-testable concern, separate from both the
 * statutory tax engine (tax.ts) and the run-level disbursement-category
 * aggregation (contractor payouts / expenses / payroll cost) fixed
 * alongside this. Loosely inspired by the wage-type/collector separation in
 * payroll engines like github.com/Payroll-Engine/PayrollEngine — a
 * "collector" is just a named bucket a wage type feeds into so different
 * kinds of pay/deductions never get silently summed together. No code or
 * architecture from that project is used here, just the separation idea,
 * expressed as a plain TypeScript function.
 *
 * Deductions fall into two kinds with very different rules when money is
 * short:
 *   - MANDATORY (statutory tax/contributions, unpaid-leave proration): these
 *     always apply in full. They're period obligations, not debts, so
 *     there's nothing to defer.
 *   - DISCRETIONARY (recurring deductions/loans, salary-advance repayments,
 *     EWA settlements, one-off deduction adjustments): these are debts
 *     against pay. If they'd add up to more than what's left after
 *     mandatory reductions, each line must be scaled down proportionally so
 *     net pay never goes negative — and, critically, so nothing records a
 *     debt as "collected" beyond what was actually withheld. The unpaid
 *     remainder simply stays on the underlying deduction/advance/loan
 *     balance, to be collected in a future period.
 */

export interface DiscretionaryFactorResult {
  /** What's left for discretionary deductions after mandatory reductions (never negative). */
  availableNgn: number;
  /** Sum of every discretionary line as originally scheduled, before capping. */
  requestedTotalNgn: number;
  /** Multiplier to apply to each discretionary line's amount. 1 when nothing needed capping. */
  factor: number;
  /** True when factor < 1 — at least one line had to be reduced. */
  wasCapped: boolean;
}

/**
 * Computes the proportional-capping factor for a single employee's
 * discretionary deductions this pay period.
 *
 * @param grossTotalNgn this period's gross pay plus any taxable/non-taxable earnings add-ons
 * @param mandatoryReductionsNgn sum of unpaid-leave deduction + PAYE + pension (employee + AVC) + NHF + NHIS (employee) + development levy
 * @param requestedTotalNgn sum of every discretionary line as scheduled (recurring deductions + advance/loan repayments + EWA settlements + one-off deduction adjustments)
 */
export function computeDiscretionaryCapFactor(
  grossTotalNgn: number,
  mandatoryReductionsNgn: number,
  requestedTotalNgn: number,
): DiscretionaryFactorResult {
  const availableNgn = Math.max(0, grossTotalNgn - mandatoryReductionsNgn);
  const factor =
    requestedTotalNgn > 0 && requestedTotalNgn > availableNgn
      ? availableNgn / requestedTotalNgn
      : 1;
  return {
    availableNgn,
    requestedTotalNgn,
    factor,
    wasCapped: factor < 1,
  };
}

/** Applies a capping factor to one line's amount, rounded to the nearest whole Naira. */
export function capDiscretionaryAmount(amountNgn: number, factor: number): number {
  return factor < 1 ? Math.round(amountNgn * factor) : amountNgn;
}
