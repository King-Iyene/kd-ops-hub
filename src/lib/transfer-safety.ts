// Transfer safety helpers: threshold, caps, and audit. Used by Settings,
// BatchDetail, and any component that needs to know if a transfer would be
// flagged "high value" or blocked by a cap.

import { supabase } from '@/lib/supabase';

export const SETTINGS_SINGLETON_ID = '00000000-0000-0000-0000-000000000001';

export interface TransferLimit {
  id: string;
  role: 'super_admin' | 'admin' | 'finance' | null;
  user_id: string | null;
  single_txn_limit_ngn: number | null;
  daily_limit_ngn: number | null;
  monthly_limit_ngn: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
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

export async function fetchHighValueThreshold(): Promise<number> {
  const { data } = await supabase
    .from('company_settings')
    .select('transfer_high_value_threshold_ngn')
    .eq('id', SETTINGS_SINGLETON_ID)
    .maybeSingle();
  const v = (data as any)?.transfer_high_value_threshold_ngn;
  return typeof v === 'number' ? v : Number(v) || 1_000_000;
}

export async function updateHighValueThreshold(value: number): Promise<void> {
  const { error } = await supabase
    .from('company_settings')
    .update({ transfer_high_value_threshold_ngn: value })
    .eq('id', SETTINGS_SINGLETON_ID);
  if (error) throw error;
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
