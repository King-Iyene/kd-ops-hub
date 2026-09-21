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

import { Wallet, HandCoins, Landmark, BookOpen, Settings, Users, Banknote, type LucideIcon } from 'lucide-react';

export interface DirectorDisbursementCategoryDef {
  key: string;
  label: string;
  icon: LucideIcon;
  hint: string;
  companyScope?: 'KDS' | 'NDI';
}

const KDS_CATEGORIES: DirectorDisbursementCategoryDef[] = [
  { key: 'director_salary', icon: Wallet, label: 'Salary',
    hint: 'Recurring or ad-hoc salary payment to the director.', companyScope: 'KDS' },
  { key: 'director_drawings', icon: HandCoins, label: 'Drawings',
    hint: "Owner's drawings — money taken out against the director's equity in the company.", companyScope: 'KDS' },
  { key: 'director_loan_repayment', icon: Landmark, label: 'Loan repayment',
    hint: 'The company repaying money the director personally lent it.', companyScope: 'KDS' },
];

const NDI_CATEGORIES: DirectorDisbursementCategoryDef[] = [
  { key: 'ndi_program_expense', icon: BookOpen, label: 'Program expense',
    hint: 'Direct programme costs — training, materials, fieldwork, beneficiary support.', companyScope: 'NDI' },
  { key: 'ndi_admin', icon: Settings, label: 'Admin & overhead',
    hint: 'Office rent, utilities, insurance, professional services.', companyScope: 'NDI' },
  { key: 'ndi_payroll', icon: Users, label: 'Staff payroll',
    hint: 'NDI employee salaries and statutory remittances.', companyScope: 'NDI' },
  { key: 'ndi_grant_disbursement', icon: Banknote, label: 'Grant disbursement',
    hint: 'Sub-grants or direct disbursements to grant beneficiaries.', companyScope: 'NDI' },
];

export const DIRECTOR_DISBURSEMENT_CATEGORIES: DirectorDisbursementCategoryDef[] = [
  ...KDS_CATEGORIES,
  ...NDI_CATEGORIES,
];

export function categoriesForCompany(shortCode: string | null | undefined): DirectorDisbursementCategoryDef[] {
  if (shortCode === 'NDI') return NDI_CATEGORIES;
  return KDS_CATEGORIES;
}

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
