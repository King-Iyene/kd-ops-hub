/**
 * Translates raw Postgres / PostgREST error messages into human-friendly UI
 * copy. Most useful around money inputs where DB CHECK constraints fire on
 * typo amounts and the default error
 *   `new row for relation "payment_batches" violates check constraint
 *    "payment_batches_total_amount_sane"`
 * means nothing to a finance user.
 */

const MONEY_CAPS: Record<string, string> = {
  payment_batches_total_amount_sane: '₦5 billion per batch',
  batch_items_amount_ngn_sane:        '₦100 million per single transfer',
  expenses_amount_ngn_sane:           '₦100 million per expense',
  fuel_requests_amount_ngn_sane:      '₦5 million per fuel request',
  subscriptions_amount_ngn_sane:      '₦50 million per subscription',
  revenue_entries_amount_ngn_sane:    '₦5 billion per revenue entry',
  budgets_total_amount_ngn_sane:      '₦5 billion per budget',
  employee_advances_amount_ngn_sane:  '₦50 million per advance',
  salary_increments_new_salary_ngn_sane: '₦100 million annual salary',
};

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  // Supabase's PostgrestError (and most thrown API error shapes) is a plain
  // object — { message, details, hint, code } — not an Error instance, so
  // `String(err)` falls through to the useless "[object Object]". Every
  // `throw error` from a Supabase call across the app hits this path.
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return String(err);
}

export function friendlyDbError(input: unknown): string {
  const raw =
    typeof input === 'string'
      ? input
      : (input as { message?: string })?.message ?? 'Operation failed';

  // Money sanity-cap violations
  for (const [constraint, cap] of Object.entries(MONEY_CAPS)) {
    if (raw.includes(constraint)) {
      return `Amount is too large — must be no more than ${cap}. Please double-check the amount.`;
    }
  }
  if (raw.includes('violates check constraint') && raw.includes('_sane')) {
    return 'The amount you entered is outside the allowed range. Please double-check it.';
  }

  // Negative-amount guards
  if (raw.includes('violates check constraint') && raw.includes('positive')) {
    return 'Amount must be greater than zero.';
  }

  // RLS denials
  if (raw.includes('row-level security') || raw.includes('permission denied')) {
    return 'You don\'t have permission to do that. Ask an admin if this seems wrong.';
  }

  // FK / orphan errors
  if (raw.includes('violates foreign key constraint')) {
    return 'Could not save — a linked record is missing. Refresh and try again.';
  }

  // Unique violations (often "already exists")
  if (raw.includes('duplicate key') || raw.includes('violates unique constraint')) {
    return 'This record already exists.';
  }

  // Network / timeouts
  if (raw.toLowerCase().includes('failed to fetch') || raw.includes('network')) {
    return 'Connection problem. Check your internet and try again.';
  }

  return raw;
}
