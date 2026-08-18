/**
 * Personal Transfer — the director's own post-salary money, moved via
 * Paystack as a pure transfer utility. Lives in its own personal_transfers
 * table (see migration 20260811184147_director_disbursements_v2.sql) with
 * no foreign key to any company-ledger/reporting table — that table is the
 * wall; this file is just the read/write surface for it.
 *
 * Every read here goes through fetchPersonalTransfers()/logPersonalTransferView()
 * so "log every view of past records" (not just every send) is a single,
 * hard-to-forget code path rather than a convention scattered across the UI.
 */

import { supabase } from '@/lib/supabase';
import { logAudit, type AuditActor } from '@/lib/audit';

export interface PersonalTransferRow {
  id: string;
  initiated_by: string;
  recipient_name: string;
  recipient_account_number: string;
  recipient_bank_code: string;
  recipient_bank_name: string | null;
  recipient_account_name: string | null;
  amount_ngn: number;
  memo: string | null;
  status: 'pending' | 'succeeded' | 'failed' | 'reversed';
  paystack_recipient_code: string | null;
  paystack_transfer_code: string | null;
  paystack_reference: string | null;
  failure_reason: string | null;
  created_at: string;
  processed_at: string | null;
  beneficiary_id: string | null;
  batch_label: string | null;
}

export interface PersonalTransferBeneficiaryRow {
  id: string;
  owner_id: string;
  label: string;
  account_number: string;
  bank_code: string;
  bank_name: string | null;
  account_name: string | null;
  paystack_recipient_code: string | null;
  created_at: string;
}

/** Saved recipients for Personal Transfer — Paystack's own documented
 *  guidance is "save recipient_code to your database and reuse it rather
 *  than repeatedly calling the API", so paystack_recipient_code is cached
 *  here the first time a beneficiary is verified, and reused on every
 *  subsequent send without re-creating the recipient. Owner-scoped, no
 *  view-logging (these are contacts, not financial records). */
export async function fetchPersonalTransferBeneficiaries(): Promise<PersonalTransferBeneficiaryRow[]> {
  const { data, error } = await supabase
    .from('personal_transfer_beneficiaries')
    .select('id, label, account_number, bank_code, bank_name, account_name, paystack_recipient_code, created_at')
    .order('label', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as PersonalTransferBeneficiaryRow[];
}

export async function createPersonalTransferBeneficiary(input: {
  ownerId: string;
  label: string;
  accountNumber: string;
  bankCode: string;
  bankName: string;
  accountName: string;
  paystackRecipientCode: string | null;
}): Promise<PersonalTransferBeneficiaryRow> {
  const { data, error } = await supabase
    .from('personal_transfer_beneficiaries')
    .insert({
      owner_id: input.ownerId,
      label: input.label,
      account_number: input.accountNumber,
      bank_code: input.bankCode,
      bank_name: input.bankName,
      account_name: input.accountName,
      paystack_recipient_code: input.paystackRecipientCode,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data as unknown as PersonalTransferBeneficiaryRow;
}

export async function updatePersonalTransferBeneficiary(
  id: string,
  updates: { label?: string; paystack_recipient_code?: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('personal_transfer_beneficiaries')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

export async function deletePersonalTransferBeneficiary(id: string): Promise<void> {
  const { error } = await supabase.from('personal_transfer_beneficiaries').delete().eq('id', id);
  if (error) throw error;
}

/** Fetch the director's own personal transfers AND log that this list was
 *  viewed. RLS already scopes rows to `initiated_by = auth.uid()` for
 *  super_admin only, so no explicit filter is needed here — this just adds
 *  the mandatory view-log on top of a normal read. */
export async function fetchPersonalTransfers(actor: AuditActor | null): Promise<PersonalTransferRow[]> {
  const { data, error } = await supabase
    .from('personal_transfers')
    .select('id, recipient_name, recipient_account_number, recipient_bank_code, recipient_bank_name, recipient_account_name, amount_ngn, memo, status, paystack_reference, failure_reason, created_at, processed_at, beneficiary_id, batch_label')
    .order('created_at', { ascending: false });
  if (error) throw error;
  await logAudit(
    'personal_transfer_list_viewed',
    `Viewed Personal Transfers list (${data?.length ?? 0} records)`,
    actor,
  );
  return (data ?? []) as unknown as PersonalTransferRow[];
}

/** Log opening a single transfer's detail — separate from the list-view log
 *  so "log every view" covers both the list and the detail drill-in. */
export async function logPersonalTransferDetailView(
  row: PersonalTransferRow,
  actor: AuditActor | null,
): Promise<void> {
  await logAudit(
    'personal_transfer_viewed',
    `Viewed Personal Transfer detail: ${row.recipient_name} — ₦${row.amount_ngn.toLocaleString()}`,
    actor,
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Recurring schedules + drafts
   ═══════════════════════════════════════════════════════════════════════ */

export interface PersonalRecurringScheduleRow {
  id: string;
  created_by: string;
  beneficiary_id: string;
  amount_ngn: number;
  memo: string | null;
  day_of_month: number;
  next_run_date: string;
  last_run_date: string | null;
  status: 'active' | 'paused' | 'cancelled';
  created_at: string;
  updated_at: string;
  beneficiary?: PersonalTransferBeneficiaryRow;
}

export interface PersonalTransferDraftRow {
  id: string;
  schedule_id: string | null;
  created_by: string;
  beneficiary_id: string | null;
  amount_ngn: number;
  memo: string | null;
  created_at: string;
  beneficiary?: PersonalTransferBeneficiaryRow;
}

export async function fetchPersonalRecurringSchedules(): Promise<PersonalRecurringScheduleRow[]> {
  const { data, error } = await supabase
    .from('personal_transfer_recurring_schedules')
    .select('*, beneficiary:personal_transfer_beneficiaries(*)')
    .order('next_run_date', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as PersonalRecurringScheduleRow[];
}

export async function createPersonalRecurringSchedule(input: {
  createdBy: string;
  beneficiaryId: string;
  amountNgn: number;
  memo: string | null;
  dayOfMonth: number;
}): Promise<void> {
  const today = new Date();
  const nextMonth = today.getDate() >= input.dayOfMonth ? today.getMonth() + 1 : today.getMonth();
  const nextDate = new Date(today.getFullYear(), nextMonth, input.dayOfMonth);
  const { error } = await supabase
    .from('personal_transfer_recurring_schedules')
    .insert({
      created_by: input.createdBy,
      beneficiary_id: input.beneficiaryId,
      amount_ngn: input.amountNgn,
      memo: input.memo || null,
      day_of_month: input.dayOfMonth,
      next_run_date: nextDate.toISOString().slice(0, 10),
    });
  if (error) throw error;
}

export async function togglePersonalRecurringSchedule(id: string, currentStatus: string): Promise<void> {
  const next = currentStatus === 'paused' ? 'active' : 'paused';
  const { error } = await supabase
    .from('personal_transfer_recurring_schedules')
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deletePersonalRecurringSchedule(id: string): Promise<void> {
  const { error } = await supabase
    .from('personal_transfer_recurring_schedules')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function fetchPersonalTransferDrafts(): Promise<PersonalTransferDraftRow[]> {
  const { data, error } = await supabase
    .from('personal_transfer_drafts')
    .select('*, beneficiary:personal_transfer_beneficiaries(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PersonalTransferDraftRow[];
}

export async function deletePersonalTransferDraft(id: string): Promise<void> {
  const { error } = await supabase
    .from('personal_transfer_drafts')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

/* ═══════════════════════════════════════════════════════════════════════
   CSV statement export
   ═══════════════════════════════════════════════════════════════════════ */

function csvEscape(v: string): string {
  if (/[,"\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function exportPersonalTransfersCsv(rows: PersonalTransferRow[], filename?: string): void {
  const header = ['Date', 'Recipient', 'Account', 'Bank', 'Amount (NGN)', 'Memo', 'Batch', 'Status', 'Reference'];
  const lines = rows.map((r) => [
    r.created_at ? new Date(r.created_at).toISOString().slice(0, 19).replace('T', ' ') : '',
    r.recipient_account_name || r.recipient_name || '',
    r.recipient_account_number || '',
    r.recipient_bank_name || '',
    String(r.amount_ngn),
    r.memo || '',
    r.batch_label || '',
    r.status,
    r.paystack_reference || '',
  ].map(csvEscape).join(','));

  const csv = [header.join(','), ...lines].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `personal-transfers-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
