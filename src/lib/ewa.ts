/**
 * Earned Wage Access (EWA) — client helpers.
 * The math lives in the SQL RPCs (see 20260803000000_earned_wage_access.sql);
 * this module is a typed wrapper so the React page can stay tidy.
 */

import { supabase } from '@/lib/supabase';

export interface EwaEligibility {
  employee_id: string;
  period: string;
  monthly_salary_ngn: number;
  days_in_month: number;
  day_of_month: number;
  accrued_to_date_ngn: number;
  max_for_month_ngn: number;
  already_drawn_ngn: number;
  available_now_ngn: number;
  min_draw_ngn: number;
  max_draw_percent: number;
  open_request_id: string | null;
  can_request: boolean;
  blockers: string[];
}

export type EwaStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'disbursed'
  | 'settled'
  | 'cancelled';

export interface EwaRequest {
  id: string;
  employee_id: string;
  amount_ngn: number;
  reason: string | null;
  status: EwaStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  disbursed_batch_item_id: string | null;
  disbursed_at: string | null;
  settled_payroll_run_id: string | null;
  settled_at: string | null;
  notes: string | null;
  salary_at_request_ngn: number;
  accrued_at_request_ngn: number;
  settlement_period: string;
  created_at: string;
  updated_at: string;
}

export async function fetchEligibility(employeeId?: string): Promise<EwaEligibility> {
  const { data, error } = await supabase.rpc('compute_ewa_eligibility', {
    p_employee_id: employeeId ?? null,
  });
  if (error) throw error;
  return data as EwaEligibility;
}

export async function requestEwa(amountNgn: number, reason?: string): Promise<string> {
  const { data, error } = await supabase.rpc('request_ewa', {
    p_amount_ngn: amountNgn,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function approveEwa(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('approve_ewa', { p_request_id: requestId });
  if (error) throw error;
}

export async function rejectEwa(requestId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('reject_ewa', {
    p_request_id: requestId,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function cancelEwa(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_ewa', { p_request_id: requestId });
  if (error) throw error;
}

export const EWA_STATUS_LABEL: Record<EwaStatus, string> = {
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
  disbursed: 'Disbursed',
  settled: 'Settled in payroll',
  cancelled: 'Cancelled',
};
