export interface BonusLine {
  type: string;
  amount: number;
}

export interface AllowancesSnapshot {
  housing_pct: number;
  transport_per_emp: number;
  meal_per_emp: number;
  total: number;
}

export interface PayrollRun {
  id: string;
  period: string;
  period_type?: 'monthly' | 'quarterly' | 'annual';
  employee_count?: number;
  total_contractor_ngn: number;
  total_employee_ngn: number;
  total_expenses_ngn: number;
  paye_ngn: number;
  pension_ngn: number;
  nhf_ngn: number;
  total_burn_ngn: number;
  employer_pension_ngn?: number | null;
  bonuses_json?: BonusLine[] | null;
  allowances_json?: AllowancesSnapshot | null;
  status: 'draft' | 'pending_approval' | 'approved' | 'processing' | 'paid';
  created_at: string;
  created_by: string | null;
  approved_by: string | null;
  payroll_segment_id?: string | null;
  scheduled_disburse_at?: string | null;
  /** Set (with a reason) whenever the most recent disbursement attempt —
   * scheduled or manual — failed to pay anyone. Cleared back to null the
   * moment a later attempt succeeds. Drives a persistent warning banner so
   * a failed attempt can never go unnoticed the way it did before this
   * existed (a failed scheduled run used to just silently look identical
   * to "never scheduled"). */
  last_disbursement_attempted_at?: string | null;
  last_disbursement_error?: string | null;
  is_auto_generated?: boolean;
  run_options?: {
    include_paye?: boolean;
    include_pension?: boolean;
    include_nhf?: boolean;
    include_nhis?: boolean;
    include_dev_levy?: boolean;
    include_advances?: boolean;
    include_deductions?: boolean;
    include_ewa?: boolean;
  } | null;
}
