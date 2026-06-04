/**
 * Quick Pay categories — what an ad-hoc payment is FOR. Required at Quick Pay
 * time so every one-off transfer is properly classified and rolls up cleanly
 * in Transactions / Reports / month-end review instead of collapsing into one
 * undifferentiated "Quick Pay" bucket.
 *
 * Two-tier list, kept deliberately short so the dropdown stays scannable:
 *   • PAYMENT — the most common Quick Pay reasons (contractor, vendor,
 *     reimbursement, bonus, etc.)
 *   • OTHER   — explicit catch-all that forces a free-text description
 *
 * Categories are persisted as payment_batches.payment_category and the
 * transactions_view already aggregates by this column, so no schema change
 * is needed.
 *
 * Stays separate from EXPENSE_CATEGORIES (which classify a submitted expense
 * line in the Expenses module — different domain, different lifecycle).
 * Where the two semantically overlap — reimbursing a paid expense — the
 * `reimbursement` payment category here is the right key; the underlying
 * expense already carries its own granular category.
 */

export interface PaymentCategoryDef {
  key: string;
  label: string;
  group: 'frequent' | 'compensation' | 'other';
  /** One-line hint shown under the label in the dropdown so an operator
   *  who isn't sure picks the right key the first time. */
  hint?: string;
}

export const PAYMENT_CATEGORIES: PaymentCategoryDef[] = [
  // ── Most common ──────────────────────────────────────────────────────────
  { key: 'contractor_payment', group: 'frequent',
    label: 'Contractor / one-off pay',
    hint: 'Paying a freelancer, partner or contractor for work delivered.' },
  { key: 'vendor_payment',     group: 'frequent',
    label: 'Vendor / supplier',
    hint: 'Paying an external supplier (one-off, not a recurring invoice).' },
  { key: 'reimbursement',      group: 'frequent',
    label: 'Expense reimbursement',
    hint: 'Reimbursing someone for an expense they already paid.' },

  // ── Compensation ─────────────────────────────────────────────────────────
  { key: 'bonus_gift',         group: 'compensation',
    label: 'Bonus / gift',
    hint: 'One-off appreciation, performance bonus, gift, etc.' },
  { key: 'commission',         group: 'compensation',
    label: 'Commission / referral fee',
    hint: 'Sales commission, partner referral, finder fee.' },
  { key: 'employee_advance',   group: 'compensation',
    label: 'Employee advance',
    hint: 'Ad-hoc salary advance; track repayment manually on the employee.' },

  // ── Other ────────────────────────────────────────────────────────────────
  { key: 'refund',             group: 'other',
    label: 'Refund',
    hint: 'Returning money to a customer or counterparty.' },
  { key: 'office_supply',      group: 'other',
    label: 'Office supply / equipment',
    hint: 'Direct pay-out for office items (not a reimbursement).' },
  { key: 'utility_one_off',    group: 'other',
    label: 'Utility / one-off bill',
    hint: 'Diesel top-up, fuel station, internet credit, etc.' },
  { key: 'other',              group: 'other',
    label: 'Other',
    hint: 'Use only when nothing above fits — and add a clear description.' },
];

export const PAYMENT_CATEGORY_KEYS = PAYMENT_CATEGORIES.map((c) => c.key);

export const paymentCategoryLabel = (key: string | null | undefined): string => {
  if (!key) return '—';
  const found = PAYMENT_CATEGORIES.find((c) => c.key === key);
  if (found) return found.label;
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

/** Smart default when the QuickPay recipient lookup already identified a
 *  contractor or employee. Lets operators click through without re-picking
 *  the obvious category 70% of the time. */
export function defaultCategoryFor(opts: {
  hasContractor: boolean;
  hasEmployee: boolean;
}): string | null {
  if (opts.hasContractor) return 'contractor_payment';
  if (opts.hasEmployee)   return 'reimbursement';
  return null;
}

/** Group label for the SelectGroup header in the dropdown. */
export const paymentCategoryGroupLabel: Record<PaymentCategoryDef['group'], string> = {
  frequent:     'Most common',
  compensation: 'Compensation',
  other:        'Other',
};
