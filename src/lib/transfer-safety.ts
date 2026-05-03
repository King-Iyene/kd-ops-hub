// Transfer safety helpers: threshold, caps, audit, and the new approval
// framework. Used by Settings, BatchDetail, Approvals, Expenses, and QuickPay
// — every surface that touches the dual-approval state machine.
//
// All approval-state mutations go through SECURITY DEFINER RPCs (defined in
// migration 20260811000000_approval_framework.sql); no surface should write
// status/approved_by directly. Direct writes are blocked by DB triggers, so
// any place that ignored this would surface as a runtime error anyway.

import { supabase } from '@/lib/supabase';

export const SETTINGS_SINGLETON_ID = '00000000-0000-0000-0000-000000000001';

export type ApproverActionType = 'payment_batch' | 'quick_pay' | 'expense_payment';
export type ApproverTier = 'first' | 'second';

export interface TransferLimit {
  id: string;
  role: 'super_admin' | 'admin' | 'finance' | null;
  user_id: string | null;
  single_txn_limit_ngn: number | null;
  daily_limit_ngn: number | null;
  monthly_limit_ngn: number | null;
  /**
   * Above this NGN amount, payment_batch / quick_pay / expense_payment requires
   * a second approver. NULL = co-approval never required for this row.
   */
  co_approval_threshold_ngn: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApproverPool {
  id: string;
  action_type: ApproverActionType;
  tier: ApproverTier;
  /** JSON array of role strings, e.g. ['admin','super_admin']. */
  eligible_roles: string[];
  created_at: string;
  updated_at: string;
}

export interface EligibleApprover {
  id: string;
  full_name: string | null;
  role: string | null;
  email: string | null;
}

export interface TransferAuditRow {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  outcome: 'ok' | 'denied' | 'error';
  amount_ngn: number | null;
  recipient_code: string | null;
  reference: string | null;
  ip_hash: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  reason: string | null;
  created_at: string;
}

export interface CapCheckResult {
  allowed: boolean;
  reason: string | null;
  applied_limit_kind: 'single' | 'daily' | 'monthly' | null;
  applied_limit_ngn: number | null;
  used_today_ngn: number;
  used_month_ngn: number;
}

export async function listTransferLimits(): Promise<TransferLimit[]> {
  const { data, error } = await supabase
    .from('transfer_limits')
    .select('*')
    .order('user_id', { nullsFirst: true })
    .order('role');
  if (error) throw error;
  return (data ?? []) as TransferLimit[];
}

export async function upsertTransferLimit(
  row: Partial<TransferLimit> & { id?: string }
): Promise<void> {
  if (row.id) {
    const { error } = await supabase
      .from('transfer_limits')
      .update({
        single_txn_limit_ngn: row.single_txn_limit_ngn ?? null,
        daily_limit_ngn: row.daily_limit_ngn ?? null,
        monthly_limit_ngn: row.monthly_limit_ngn ?? null,
        co_approval_threshold_ngn: row.co_approval_threshold_ngn ?? null,
        notes: row.notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('transfer_limits').insert({
    role: row.role ?? null,
    user_id: row.user_id ?? null,
    single_txn_limit_ngn: row.single_txn_limit_ngn ?? null,
    daily_limit_ngn: row.daily_limit_ngn ?? null,
    monthly_limit_ngn: row.monthly_limit_ngn ?? null,
    co_approval_threshold_ngn: row.co_approval_threshold_ngn ?? null,
    notes: row.notes ?? null,
  });
  if (error) throw error;
}

export async function deleteTransferLimit(id: string): Promise<void> {
  const { error } = await supabase.from('transfer_limits').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchRecentTransferAudit(
  limit = 50
): Promise<TransferAuditRow[]> {
  const { data, error } = await supabase
    .from('transfer_audit')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as TransferAuditRow[];
}

/**
 * Client-side preview of cap check. Calls the same RPC the edge function
 * uses, so what the UI shows matches what the server will do.
 */
export async function previewCapCheck(
  userId: string,
  amountNgn: number
): Promise<CapCheckResult | null> {
  const { data, error } = await supabase.rpc('check_transfer_caps', {
    p_user_id: userId,
    p_amount_ngn: amountNgn,
  });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    allowed: !!row.allowed,
    reason: row.reason ?? null,
    applied_limit_kind: row.applied_limit_kind ?? null,
    applied_limit_ngn: row.applied_limit_ngn ?? null,
    used_today_ngn: Number(row.used_today_ngn ?? 0),
    used_month_ngn: Number(row.used_month_ngn ?? 0),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Approver pools
// ──────────────────────────────────────────────────────────────────────────

const ALL_APPROVAL_ROLES = [
  'super_admin',
  'admin',
  'finance',
  'business_owner',
  'hr',
  'operations',
  'driver',
] as const;

export type ApprovalRole = (typeof ALL_APPROVAL_ROLES)[number];

export const APPROVAL_ROLE_OPTIONS: ApprovalRole[] = [...ALL_APPROVAL_ROLES];

export async function listApproverPools(): Promise<ApproverPool[]> {
  const { data, error } = await supabase
    .from('approver_pools')
    .select('*')
    .order('action_type')
    .order('tier');
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => ({
    ...row,
    eligible_roles: Array.isArray(row.eligible_roles)
      ? row.eligible_roles
      : (() => {
          try {
            return JSON.parse(row.eligible_roles ?? '[]');
          } catch {
            return [];
          }
        })(),
  })) as ApproverPool[];
}

export async function updateApproverPool(
  id: string,
  eligibleRoles: string[]
): Promise<void> {
  const { error } = await supabase
    .from('approver_pools')
    .update({
      eligible_roles: eligibleRoles,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Server-derived eligible-approver list for a given action+tier+creator.
 * Always prefer this over a client-side filter — the server narrows the
 * first-tier pool to ['super_admin'] when the creator is admin/super_admin.
 */
export async function fetchEligibleApprovers(
  actionType: ApproverActionType,
  tier: ApproverTier,
  creatorId: string,
  firstApproverId?: string | null
): Promise<EligibleApprover[]> {
  const { data, error } = await supabase.rpc('get_eligible_approvers', {
    p_action_type: actionType,
    p_tier: tier,
    p_creator_id: creatorId,
    p_first_approver_id: firstApproverId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as EligibleApprover[];
}

// ──────────────────────────────────────────────────────────────────────────
// Approval RPCs — payment batches
// ──────────────────────────────────────────────────────────────────────────

export interface PaymentBatchRow {
  id: string;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  second_approver_id: string | null;
  second_approved_at: string | null;
  payload_hash_at_approval: string | null;
  co_approval_required: boolean;
  total_amount: number | null;
  created_by: string | null;
  [key: string]: unknown;
}

export async function approvePaymentBatch(
  batchId: string,
  idempotencyKey?: string
): Promise<PaymentBatchRow> {
  const { data, error } = await supabase.rpc('approve_payment_batch', {
    p_batch_id: batchId,
    p_idempotency_key: idempotencyKey ?? null,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as PaymentBatchRow;
}

export async function confirmSecondApproval(
  batchId: string,
  idempotencyKey?: string
): Promise<PaymentBatchRow> {
  const { data, error } = await supabase.rpc('confirm_second_approval', {
    p_batch_id: batchId,
    p_idempotency_key: idempotencyKey ?? null,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as PaymentBatchRow;
}

export async function rejectPaymentBatch(
  batchId: string,
  reason: string
): Promise<PaymentBatchRow> {
  const { data, error } = await supabase.rpc('reject_payment_batch', {
    p_batch_id: batchId,
    p_reason: reason,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as PaymentBatchRow;
}

export async function resetBatchToDraft(batchId: string): Promise<PaymentBatchRow> {
  const { data, error } = await supabase.rpc('reset_batch_to_draft', {
    p_batch_id: batchId,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as PaymentBatchRow;
}

// ──────────────────────────────────────────────────────────────────────────
// Approval RPCs — expenses
// ──────────────────────────────────────────────────────────────────────────

export interface ExpenseRow {
  id: string;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  second_approver_id: string | null;
  second_approved_at: string | null;
  approved_by_secondary: string | null;
  approved_by_secondary_at: string | null;
  payload_hash_at_approval: string | null;
  co_approval_required: boolean;
  amount_ngn: number | null;
  submitted_by: string | null;
  [key: string]: unknown;
}

export async function approveExpense(
  expenseId: string,
  idempotencyKey?: string
): Promise<ExpenseRow> {
  const { data, error } = await supabase.rpc('approve_expense', {
    p_expense_id: expenseId,
    p_idempotency_key: idempotencyKey ?? null,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as ExpenseRow;
}

export async function confirmSecondExpenseApproval(
  expenseId: string,
  idempotencyKey?: string
): Promise<ExpenseRow> {
  const { data, error } = await supabase.rpc('confirm_second_expense_approval', {
    p_expense_id: expenseId,
    p_idempotency_key: idempotencyKey ?? null,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as ExpenseRow;
}

export async function rejectExpense(
  expenseId: string,
  reason: string
): Promise<ExpenseRow> {
  const { data, error } = await supabase.rpc('reject_expense', {
    p_expense_id: expenseId,
    p_reason: reason,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as ExpenseRow;
}

// ──────────────────────────────────────────────────────────────────────────
// Quick Pay master switch
// ──────────────────────────────────────────────────────────────────────────

export async function isQuickPayEnabled(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_quick_pay_enabled');
  if (error) return false;
  return !!data;
}

// ──────────────────────────────────────────────────────────────────────────
// Pure helper used by tests + the approval banner UI
// ──────────────────────────────────────────────────────────────────────────

/**
 * Decide whether co-approval is required given the caller's effective
 * threshold and the amount on the line. Mirrors the RPC's logic so the
 * UI can show an accurate "this needs a second approver" hint before the
 * call. Treat NULL threshold as "no co-approval ever required".
 */
export function isCoApprovalRequired(
  thresholdNgn: number | null | undefined,
  amountNgn: number
): boolean {
  if (thresholdNgn === null || thresholdNgn === undefined) return false;
  if (!Number.isFinite(thresholdNgn) || thresholdNgn <= 0) return false;
  return amountNgn > thresholdNgn;
}
