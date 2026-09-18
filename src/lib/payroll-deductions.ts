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

/**
 * Hands out the capped amounts for one employee's discretionary lines while
 * keeping a running budget, so the lines can never collectively exceed what
 * was actually available to withhold.
 *
 * Why this is needed on top of capDiscretionaryAmount: that function rounds
 * each line independently, and Math.round breaks ties upward. The rounded
 * lines can therefore sum to more than `availableNgn` — by up to half a Naira
 * per line. Two 1-Naira debts against 1 Naira of available pay is the
 * smallest case: factor is 0.5, each line rounds to 1, and 2 Naira gets
 * recorded as collected against balances when only 1 Naira existed.
 *
 * That breaks the guarantee this module is built to provide — that nothing is
 * recorded as collected beyond what was withheld — and it fails in the
 * direction that quietly forgives debt: the employee's advance or loan
 * balance drops by more than came out of their pay, so the shortfall is never
 * collected in a later period either.
 *
 * Net pay itself was never at risk; the caller clamps it at zero. The damage
 * is confined to the balances the settlement step then writes down.
 *
 * Allocation is greedy in call order: each line gets its proportional rounded
 * share, truncated to whatever budget is left. Whichever line happens to be
 * last absorbs the rounding shortfall, which is correct in the only sense
 * that matters here — the remainder stays on the underlying balance and is
 * collected next period, exactly as the module documents.
 */
export interface DiscretionaryAllocator {
  /** Capped amount for one line, never more than the remaining budget. */
  take(amountNgn: number): number;
  /** Budget not yet handed out — exposed for assertions and diagnostics. */
  remainingNgn(): number;
}

export function createDiscretionaryAllocator(
  availableNgn: number,
  factor: number,
): DiscretionaryAllocator {
  // Floor, not round: a fraction of a Naira cannot be withheld, and rounding
  // a fractional budget up would reintroduce the very overshoot this exists
  // to prevent.
  let remaining = Math.max(0, Math.floor(availableNgn));
  return {
    take(amountNgn: number): number {
      const want = capDiscretionaryAmount(amountNgn, factor);
      const give = Math.max(0, Math.min(want, remaining));
      remaining -= give;
      return give;
    },
    remainingNgn: () => remaining,
  };
}
