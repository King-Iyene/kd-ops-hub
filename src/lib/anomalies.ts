import { supabase } from '@/lib/supabase';

export type AnomalySeverity = 'low' | 'medium' | 'high' | 'critical';
export type AnomalyStatus = 'open' | 'acknowledged' | 'dismissed' | 'escalated';
export type AnomalyModule = 'payroll' | 'payments' | 'ewa' | 'profile' | 'compliance' | 'expenses';

export type AnomalyRuleCode =
  | 'salary_spike_30pct'
  | 'salary_drop_50pct'
  | 'zero_deductions'
  | 'round_number_salary'
  | 'off_hours_approval'
  | 'fast_approval'
  | 'long_dormant_first_payment'
  | 'shared_bank_account'
  | 'account_changed_then_paid'
  | 'duplicate_payment'
  | 'new_beneficiary_paid'
  | 'ewa_velocity_3in7d'
  | 'ewa_at_max_eligibility'
  | 'ewa_after_status_inactive'
  | 'expense_above_category_avg'
  | 'duplicate_expense_claim'
  | 'expense_backdated_over_60d';

export interface PaymentAnomaly {
  id: string;
  rule_code: AnomalyRuleCode;
  severity: AnomalySeverity;
  status: AnomalyStatus;
  module: AnomalyModule;
  subject_type: string;
  subject_id: string;
  employee_id: string | null;
  payroll_run_id: string | null;
  payment_batch_id: string | null;
  ewa_request_id: string | null;
  amount_ngn: number;
  title: string;
  description: string;
  evidence_json: Record<string, any>;
  detected_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_note: string | null;
  fingerprint: string;
}

/** Human-friendly labels per rule_code, used by the queue UI. */
export const RULE_LABEL: Record<AnomalyRuleCode, string> = {
  salary_spike_30pct: 'Salary jumped > 30%',
  salary_drop_50pct: 'Salary dropped > 50%',
  zero_deductions: 'No PAYE or pension deducted',
  round_number_salary: 'Round-number salary',
  off_hours_approval: 'Approved outside business hours',
  fast_approval: 'Approved within 5 minutes of creation',
  long_dormant_first_payment: 'First payment to dormant profile',
  shared_bank_account: 'Bank account on multiple profiles',
  account_changed_then_paid: 'Bank account changed before payment',
  duplicate_payment: 'Duplicate payment',
  new_beneficiary_paid: 'New recipient paid immediately',
  ewa_velocity_3in7d: 'Frequent EWA requests',
  ewa_at_max_eligibility: 'EWA at maximum eligibility',
  ewa_after_status_inactive: 'EWA approved for inactive employee',
  expense_above_category_avg: 'Expense far above category average',
  duplicate_expense_claim: 'Possible duplicate expense claim',
  expense_backdated_over_60d: 'Expense claimed long after spend date',
};

export const SEVERITY_ORDER: AnomalySeverity[] = ['critical', 'high', 'medium', 'low'];

export interface AnomalyFilters {
  status?: AnomalyStatus | 'all';
  severity?: AnomalySeverity | 'all';
  module?: AnomalyModule | 'all';
  ruleCode?: AnomalyRuleCode;
  employeeId?: string;
  limit?: number;
}

export async function fetchAnomalies(filters: AnomalyFilters = {}): Promise<PaymentAnomaly[]> {
  let q = supabase
    .from('payment_anomalies')
    .select('*')
    .order('detected_at', { ascending: false })
    .limit(filters.limit ?? 200);
  if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status);
  if (filters.severity && filters.severity !== 'all') q = q.eq('severity', filters.severity);
  if (filters.module && filters.module !== 'all') q = q.eq('module', filters.module);
  if (filters.ruleCode) q = q.eq('rule_code', filters.ruleCode);
  if (filters.employeeId) q = q.eq('employee_id', filters.employeeId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as PaymentAnomaly[];
}

export async function countOpenAnomalies(): Promise<{
  total: number;
  critical: number;
  high: number;
}> {
  const { data, error } = await supabase
    .from('payment_anomalies')
    .select('severity', { count: 'exact' })
    .eq('status', 'open');
  if (error) return { total: 0, critical: 0, high: 0 };
  const rows = (data ?? []) as { severity: AnomalySeverity }[];
  return {
    total: rows.length,
    critical: rows.filter((r) => r.severity === 'critical').length,
    high: rows.filter((r) => r.severity === 'high').length,
  };
}

export async function reviewAnomaly(
  id: string,
  status: AnomalyStatus,
  note?: string,
): Promise<PaymentAnomaly> {
  const { data, error } = await supabase.rpc('review_anomaly', {
    p_id: id,
    p_status: status,
    p_note: note ?? null,
  });
  if (error) throw new Error(error.message);
  return data as PaymentAnomaly;
}

/**
 * Fire-and-forget scan after an EWA approval. Errors are swallowed so a scan
 * failure can never block the operator action.
 */
export async function scanEwaAnomaliesSafe(ewaRequestId: string): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('scan_ewa_anomalies', { p_ewa_id: ewaRequestId });
    if (error) {
      console.warn('[anomalies] scan_ewa_anomalies failed:', error.message);
      return 0;
    }
    return Number(data ?? 0);
  } catch (err: any) {
    console.warn('[anomalies] scan_ewa_anomalies threw:', err?.message);
    return 0;
  }
}

/** Fire-and-forget expense sweep. Runs nightly via cron; this lets a caller trigger it on demand too. */
export async function scanExpenseAnomaliesSafe(): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('scan_expense_anomalies');
    if (error) {
      console.warn('[anomalies] scan_expense_anomalies failed:', error.message);
      return 0;
    }
    return Number(data ?? 0);
  } catch (err: any) {
    console.warn('[anomalies] scan_expense_anomalies threw:', err?.message);
    return 0;
  }
}

export async function scanPayrollRunAnomaliesSafe(payrollRunId: string): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('scan_payroll_run_anomalies', {
      p_run_id: payrollRunId,
    });
    if (error) {
      console.warn('[anomalies] scan_payroll_run_anomalies failed:', error.message);
      return 0;
    }
    return Number(data ?? 0);
  } catch (err: any) {
    console.warn('[anomalies] scan_payroll_run_anomalies threw:', err?.message);
    return 0;
  }
}
