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
}

/** Fetch the director's own personal transfers AND log that this list was
 *  viewed. RLS already scopes rows to `initiated_by = auth.uid()` for
 *  super_admin only, so no explicit filter is needed here — this just adds
 *  the mandatory view-log on top of a normal read. */
export async function fetchPersonalTransfers(actor: AuditActor | null): Promise<PersonalTransferRow[]> {
  const { data, error } = await supabase
    .from('personal_transfers')
    .select('*')
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
