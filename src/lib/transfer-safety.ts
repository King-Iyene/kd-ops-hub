// Transfer safety helpers: threshold, caps, audit, and the new approval
// framework. Used by Settings, BatchDetail, Approvals, Expenses, and QuickPay
// — every surface that touches the dual-approval state machine.
//
// All approval-state mutations go through SECURITY DEFINER RPCs (defined in
// migration 20260811000000_approval_framework.sql); no surface should write
// status/approved_by directly. Direct writes are blocked by DB triggers, so
// any place that ignored this would surface as a runtime error anyway.

import { supabase } from '@/lib/supabase';
import { requestStepUp } from '@/hooks/use-step-up';

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
  /** Max total amount for a single payment batch (M-2). NULL = no cap. */
  single_batch_limit_ngn: number | null;
  /** Per-user overrides auto-expire at this timestamp (M-1). NULL on role rows. */
  expires_at: string | null;
  /** Who granted the per-user override. */
  granted_by: string | null;
  /** Required justification for per-user overrides. */
  granted_reason: string | null;
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
  applied_limit_kind: 'single' | 'daily' | 'monthly' | 'batch' | 'platform_single' | null;
  applied_limit_ngn: number | null;
  used_today_ngn: number;
  used_month_ngn: number;
  /** UUID of the intent audit row inserted by the server (B-5). Only set when p_intent=true and allowed=true. */
  intent_audit_id: string | null;
}

export interface SetTransferLimitParams {
  id?: string | null;
  role?: 'super_admin' | 'admin' | 'finance' | null;
  user_id?: string | null;
  single_txn_limit_ngn?: number | null;
  daily_limit_ngn?: number | null;
  monthly_limit_ngn?: number | null;
  co_approval_threshold_ngn?: number | null;
  single_batch_limit_ngn?: number | null;
  expires_at?: string | null;
  granted_reason?: string | null;
}

export interface TransferAuditFilters {
  startDate?: string;
  endDate?: string;
  actionType?: 'all' | 'transfers' | 'cap_changes' | 'denials';
  limit?: number;
  offset?: number;
}

export async function listTransferLimits(): Promise<TransferLimit[]> {
  const { data, error } = await supabase
    .from('transfer_limits')
    .select('id, role, user_id, single_txn_limit_ngn, daily_limit_ngn, monthly_limit_ngn, co_approval_threshold_ngn, single_batch_limit_ngn, expires_at, granted_by, granted_reason, notes, created_at, updated_at')
    .order('user_id', { nullsFirst: true })
    .order('role');
  if (error) throw error;
  return (data ?? []) as TransferLimit[];
}

/** Route all cap edits through the set_transfer_limit SECURITY DEFINER RPC (B-3, M-4). */
export async function setTransferLimit(params: SetTransferLimitParams): Promise<TransferLimit> {
  const { data, error } = await supabase.rpc('set_transfer_limit', {
    p_id: params.id ?? null,
    p_role: params.role ?? null,
    p_user_id: params.user_id ?? null,
    p_single: params.single_txn_limit_ngn ?? null,
    p_daily: params.daily_limit_ngn ?? null,
    p_monthly: params.monthly_limit_ngn ?? null,
    p_co_approval: params.co_approval_threshold_ngn ?? null,
    p_batch: params.single_batch_limit_ngn ?? null,
    p_expires_at: params.expires_at ?? null,
    p_reason: params.granted_reason ?? null,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as TransferLimit;
}

export async function deleteTransferLimit(id: string): Promise<void> {
  const { data, error } = await supabase.rpc('delete_transfer_limit', { p_id: id });
  if (error) throw error;
  void data;
}

export async function fetchRecentTransferAudit(
  limit = 50
): Promise<TransferAuditRow[]> {
  const { data, error } = await supabase
    .from('transfer_audit')
    .select('id, actor_id, actor_role, action, outcome, amount_ngn, recipient_code, reference, ip_hash, user_agent, metadata, reason, created_at')
    .not('outcome', 'in', '(intent,abandoned)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as TransferAuditRow[];
}

export async function fetchTransferAuditPaginated(
  filters: TransferAuditFilters
): Promise<{ rows: TransferAuditRow[]; total: number }> {
  let q = supabase
    .from('transfer_audit')
    .select('id, actor_id, actor_role, action, outcome, amount_ngn, recipient_code, reference, ip_hash, user_agent, metadata, reason, created_at', { count: 'exact' })
    .not('outcome', 'in', '(intent,abandoned)')
    .order('created_at', { ascending: false });

  if (filters.startDate) q = q.gte('created_at', filters.startDate);
  if (filters.endDate) {
    const end = new Date(filters.endDate);
    end.setDate(end.getDate() + 1);
    q = q.lt('created_at', end.toISOString());
  }
  if (filters.actionType === 'transfers') {
    q = q.in('action', ['initiate_transfer', 'bulk_transfer']);
  } else if (filters.actionType === 'cap_changes') {
    q = q.eq('action', 'cap_changed');
  } else if (filters.actionType === 'denials') {
    q = q.in('outcome', ['denied', 'error']);
  }

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  q = q.range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as TransferAuditRow[], total: count ?? 0 };
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
    p_intent: false,   // preview only — never create an intent row
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
    intent_audit_id: null,
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
] as const;

export type ApprovalRole = (typeof ALL_APPROVAL_ROLES)[number];

export const APPROVAL_ROLE_OPTIONS: ApprovalRole[] = [...ALL_APPROVAL_ROLES];

export async function listApproverPools(): Promise<ApproverPool[]> {
  const { data, error } = await supabase
    .from('approver_pools')
    .select('id, action_type, tier, eligible_roles, created_at, updated_at')
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
  const stepUpToken = await requestStepUp('approve_batch', batchId);
  const { data, error } = await supabase.rpc('approve_payment_batch', {
    p_batch_id: batchId,
    p_step_up_token: stepUpToken,
    p_idempotency_key: idempotencyKey ?? null,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as PaymentBatchRow;
}

export async function confirmSecondApproval(
  batchId: string,
  idempotencyKey?: string
): Promise<PaymentBatchRow> {
  const stepUpToken = await requestStepUp('approve_batch', batchId);
  const { data, error } = await supabase.rpc('confirm_second_approval', {
    p_batch_id: batchId,
    p_step_up_token: stepUpToken,
    p_idempotency_key: idempotencyKey ?? null,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as PaymentBatchRow;
}

export async function rejectPaymentBatch(
  batchId: string,
  reason: string
): Promise<PaymentBatchRow> {
  const stepUpToken = await requestStepUp('reject_batch', batchId);
  const { data, error } = await supabase.rpc('reject_payment_batch', {
    p_batch_id: batchId,
    p_reason: reason,
    p_step_up_token: stepUpToken,
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
  const stepUpToken = await requestStepUp('approve_expense', expenseId);
  const { data, error } = await supabase.rpc('approve_expense', {
    p_expense_id: expenseId,
    p_step_up_token: stepUpToken,
    p_idempotency_key: idempotencyKey ?? null,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as ExpenseRow;
}

export async function confirmSecondExpenseApproval(
  expenseId: string,
  idempotencyKey?: string
): Promise<ExpenseRow> {
  const stepUpToken = await requestStepUp('approve_expense', expenseId);
  const { data, error } = await supabase.rpc('confirm_second_expense_approval', {
    p_expense_id: expenseId,
    p_step_up_token: stepUpToken,
    p_idempotency_key: idempotencyKey ?? null,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as ExpenseRow;
}

export async function rejectExpense(
  expenseId: string,
  reason: string
): Promise<ExpenseRow> {
  const stepUpToken = await requestStepUp('reject_expense', expenseId);
  const { data, error } = await supabase.rpc('reject_expense', {
    p_expense_id: expenseId,
    p_reason: reason,
    p_step_up_token: stepUpToken,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as ExpenseRow;
}

// ──────────────────────────────────────────────────────────────────────────
// Lifecycle RPCs — funded → processing → finalized (close B-2 / H-7)
// ──────────────────────────────────────────────────────────────────────────

export async function markBatchFunded(
  batchId: string,
  fundingEvidence?: Record<string, unknown> | null
): Promise<PaymentBatchRow> {
  const { data, error } = await supabase.rpc('mark_batch_funded', {
    p_batch_id: batchId,
    p_funding_evidence: fundingEvidence ?? null,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as PaymentBatchRow;
}

export async function startBatchProcessing(batchId: string): Promise<PaymentBatchRow> {
  const { data, error } = await supabase.rpc('start_batch_processing', {
    p_batch_id: batchId,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as PaymentBatchRow;
}

export async function finalizeBatch(batchId: string): Promise<PaymentBatchRow> {
  const { data, error } = await supabase.rpc('finalize_batch', {
    p_batch_id: batchId,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as PaymentBatchRow;
}

export async function syncBatchStatusFromItems(batchId: string): Promise<PaymentBatchRow> {
  const { data, error } = await supabase.rpc('sync_batch_status_from_items', {
    p_batch_id: batchId,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as PaymentBatchRow;
}

export async function markExpensePaid(
  expenseId: string,
  batchId: string
): Promise<ExpenseRow> {
  const { data, error } = await supabase.rpc('mark_expense_paid', {
    p_expense_id: expenseId,
    p_batch_id: batchId,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as ExpenseRow;
}

export async function createExpensePaymentBatch(expenseId: string): Promise<PaymentBatchRow> {
  const { data, error } = await supabase.rpc('create_expense_payment_batch', {
    p_expense_id: expenseId,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as PaymentBatchRow;
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
