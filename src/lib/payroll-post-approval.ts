/**
 * Detecting figures that changed after a payroll run was approved.
 *
 * Per-employee adjustments (bonus, overtime, allowance, deduction) are read
 * when payslips are generated and land in `payslips.net_ngn`, which is the
 * figure disbursement actually pays. Nothing restricts when an adjustment can
 * be added: the table's RLS checks the caller's role and nothing else, and the
 * UI offers "Add adjustment" on any run that is not yet paid.
 *
 * So an approved run can have its amounts changed, payslips regenerated, and
 * be disbursed for a different total than the one that was approved — with no
 * second approval and nothing on screen saying so.
 *
 * Whether that should be blocked outright is a policy decision for the
 * business (a last-minute bonus after approval is a legitimate thing to want).
 * What is not defensible is it being invisible. This makes it visible, which
 * only became possible once payroll_runs.approved_at existed to compare
 * against — before that there was no recorded approval time to be "after".
 */

export interface AdjustmentLike {
  id: string;
  created_at: string;
  amount_ngn: number | string | null;
  kind?: string | null;
  description?: string | null;
}

export interface PostApprovalChanges {
  /** Adjustments created strictly after the run was approved. */
  adjustments: AdjustmentLike[];
  /** Their combined value, in NGN. */
  totalNgn: number;
}

/**
 * Adjustments added after `approvedAt`.
 *
 * Returns null — meaning "no claim either way" — when there is nothing to
 * compare against: the run was never approved, or it was approved before
 * stage timestamps started being recorded so `approved_at` is null. Returning
 * an empty result in those cases would read as "nothing changed after
 * approval", which is a stronger statement than the data supports.
 */
export function findPostApprovalAdjustments(
  adjustments: readonly AdjustmentLike[],
  approvedAt: string | null | undefined,
): PostApprovalChanges | null {
  if (!approvedAt) return null;

  const approvedMs = new Date(approvedAt).getTime();
  if (Number.isNaN(approvedMs)) return null;

  const after = adjustments.filter((a) => {
    const t = new Date(a.created_at).getTime();
    return !Number.isNaN(t) && t > approvedMs;
  });

  return {
    adjustments: after,
    totalNgn: after.reduce((sum, a) => sum + Number(a.amount_ngn ?? 0), 0),
  };
}
