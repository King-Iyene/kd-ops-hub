/**
 * Director Disbursements — category taxonomy for "Company Disbursement"
 * payments (director salary / drawings / loan repayments).
 *
 * Deliberately kept OUT of src/lib/payment-categories.ts (the general Quick
 * Pay dropdown available to finance/admin/operations) — a director-only
 * category should never be selectable from the general Quick Pay flow.
 * These three values are additionally restricted at the database level via
 * RESTRICTIVE RLS policies on payment_batches/batch_items (see migration
 * 20260811184147_director_disbursements_v2.sql) — this file is the UI-side
 * half of that restriction, not a substitute for it.
 */

import { Wallet, HandCoins, Landmark, type LucideIcon } from 'lucide-react';

export interface DirectorDisbursementCategoryDef {
  key: 'director_salary' | 'director_drawings' | 'director_loan_repayment';
  label: string;
  icon: LucideIcon;
  hint: string;
}

export const DIRECTOR_DISBURSEMENT_CATEGORIES: DirectorDisbursementCategoryDef[] = [
  { key: 'director_salary', icon: Wallet, label: 'Salary',
    hint: 'Recurring or ad-hoc salary payment to the director.' },
  { key: 'director_drawings', icon: HandCoins, label: 'Drawings',
    hint: "Owner's drawings — money taken out against the director's equity in the company." },
  { key: 'director_loan_repayment', icon: Landmark, label: 'Loan repayment',
    hint: 'The company repaying money the director personally lent it.' },
];

export const DIRECTOR_DISBURSEMENT_CATEGORY_KEYS = DIRECTOR_DISBURSEMENT_CATEGORIES.map((c) => c.key);

export function directorDisbursementCategoryDef(
  key: string | null | undefined,
): DirectorDisbursementCategoryDef | null {
  if (!key) return null;
  return DIRECTOR_DISBURSEMENT_CATEGORIES.find((c) => c.key === key) ?? null;
}

export function directorDisbursementCategoryLabel(key: string | null | undefined): string {
  return directorDisbursementCategoryDef(key)?.label ?? '—';
}
