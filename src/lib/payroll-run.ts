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
  is_auto_generated?: boolean;
}
