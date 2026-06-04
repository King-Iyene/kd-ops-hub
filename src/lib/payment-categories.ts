/**
 * Quick Pay categories — what an ad-hoc payment is FOR. Required at Quick Pay
 * time so every one-off transfer is properly classified and rolls up cleanly
 * in Transactions / Reports / month-end review instead of collapsing into one
 * undifferentiated "Quick Pay" bucket.
 *
 * Categories are persisted as payment_batches.payment_category and the
 * transactions_view already aggregates by this column, so no schema change
 * is needed.
 *
 * Stays separate from EXPENSE_CATEGORIES (which classify a submitted expense
 * line in the Expenses module — different domain, different lifecycle).
 */

import {
  Briefcase, Store, Receipt, Gift, Percent, HandCoins,
  Undo2, Package, Zap, MoreHorizontal,
  type LucideIcon,
} from 'lucide-react';

export interface PaymentCategoryDef {
  key: string;
  label: string;
  group: 'frequent' | 'compensation' | 'other';
  /** Small lucide icon for visual scanning in the dropdown. */
  icon: LucideIcon;
  /** One-line hint shown ONLY under the trigger when this category is
   *  selected — keeps the dropdown itself compact. */
  hint?: string;
}

export const PAYMENT_CATEGORIES: PaymentCategoryDef[] = [
  // ── Most common ──────────────────────────────────────────────────────────
  { key: 'contractor_payment', group: 'frequent', icon: Briefcase,
    label: 'Contractor / one-off pay',
    hint: 'Paying a freelancer, partner or contractor for work delivered.' },
  { key: 'vendor_payment',     group: 'frequent', icon: Store,
    label: 'Vendor / supplier',
    hint: 'Paying an external supplier (one-off, not a recurring invoice).' },
  { key: 'reimbursement',      group: 'frequent', icon: Receipt,
    label: 'Expense reimbursement',
    hint: 'Reimbursing someone for an expense they already paid.' },

  // ── Compensation ─────────────────────────────────────────────────────────
  { key: 'bonus_gift',         group: 'compensation', icon: Gift,
    label: 'Bonus / gift',
    hint: 'One-off appreciation, performance bonus, gift, etc.' },
  { key: 'commission',         group: 'compensation', icon: Percent,
    label: 'Commission / referral fee',
    hint: 'Sales commission, partner referral, finder fee.' },
  { key: 'employee_advance',   group: 'compensation', icon: HandCoins,
    label: 'Employee advance',
    hint: 'Ad-hoc salary advance; track repayment manually on the employee.' },

  // ── Other ────────────────────────────────────────────────────────────────
  { key: 'refund',             group: 'other', icon: Undo2,
    label: 'Refund',
    hint: 'Returning money to a customer or counterparty.' },
  { key: 'office_supply',      group: 'other', icon: Package,
    label: 'Office supply / equipment',
    hint: 'Direct pay-out for office items (not a reimbursement).' },
  { key: 'utility_one_off',    group: 'other', icon: Zap,
    label: 'Utility / one-off bill',
    hint: 'Diesel top-up, fuel station, internet credit, etc.' },
  { key: 'other',              group: 'other', icon: MoreHorizontal,
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

/** Look up a category def by key — handy for rendering the selected option's
 *  icon + hint above/below the dropdown trigger. Returns null when unknown. */
export const paymentCategoryDef = (key: string | null | undefined): PaymentCategoryDef | null => {
  if (!key) return null;
  return PAYMENT_CATEGORIES.find((c) => c.key === key) ?? null;
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
