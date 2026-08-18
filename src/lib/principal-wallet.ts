/**
 * Principal Disbursements wallet — the internal ring-fenced ledger funded
 * by a real Paystack Dedicated Virtual Account (see migration
 * 20261105000400_principal_wallet_dva.sql). Paystack itself doesn't
 * segregate DVA funds from the rest of the merchant balance; this is an
 * internal accounting wall that KDOps tracks and enforces.
 *
 * Credits are written ONLY by the paystack-webhook edge function (via
 * credit_principal_wallet, a SECURITY DEFINER RPC not reachable from the
 * client) when the registered DVA receives a charge.success. Debits are
 * written by the webhook too, on confirmed transfer.success for a
 * director-only batch_item or a personal_transfer — never at send time —
 * so this file is read-mostly: balance/history reads, plus the one-time
 * account registration/removal flow.
 */
import { supabase } from '@/lib/supabase';

export interface PrincipalWalletDva {
  id: string;
  paystack_customer_code: string;
  account_number: string;
  bank_name: string;
  account_name: string | null;
  currency: string;
  created_at: string;
}

export interface PrincipalWalletLedgerRow {
  id: string;
  direction: 'credit' | 'debit';
  amount_ngn: number;
  source: 'dva_funding' | 'company_disbursement' | 'personal_transfer' | 'reversal_refund';
  reference: string | null;
  created_at: string;
}

export async function fetchDvaAccount(): Promise<PrincipalWalletDva | null> {
  const { data, error } = await supabase
    .from('principal_wallet_dva')
    .select('id, paystack_customer_code, account_number, bank_name, account_name, currency, created_at')
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as PrincipalWalletDva) ?? null;
}

export async function createDvaAccount(input: {
  paystackCustomerCode: string;
  accountNumber: string;
  bankName: string;
  accountName: string | null;
  createdBy: string;
}): Promise<PrincipalWalletDva> {
  const { data, error } = await supabase
    .from('principal_wallet_dva')
    .insert({
      paystack_customer_code: input.paystackCustomerCode,
      account_number: input.accountNumber,
      bank_name: input.bankName,
      account_name: input.accountName,
      created_by: input.createdBy,
    })
    .select('id, paystack_customer_code, account_number, bank_name, account_name, currency, created_at')
    .single();
  if (error) throw error;
  return data as unknown as PrincipalWalletDva;
}

export async function deleteDvaAccount(id: string): Promise<void> {
  const { error } = await supabase.from('principal_wallet_dva').delete().eq('id', id);
  if (error) throw error;
}

/** Balance = SUM(credit) - SUM(debit). RLS already scopes the ledger to
 *  super_admin, so this reads the whole (small) table client-side rather
 *  than adding a dedicated balance RPC. */
export async function fetchWalletBalance(): Promise<number> {
  const { data, error } = await supabase
    .from('principal_wallet_ledger')
    .select('direction, amount_ngn');
  if (error) throw error;
  return (data ?? []).reduce((sum: number, row: any) => (
    row.direction === 'credit' ? sum + Number(row.amount_ngn) : sum - Number(row.amount_ngn)
  ), 0);
}

/** Pre-send gate used by every Principal Disbursements send path as a
 *  final, server-side-adjacent safety net (the UI-level check lives in
 *  PaymentSummaryModal via fetchWalletBalanceOrNull below — this one
 *  catches the case where the wallet balance changed between opening
 *  that modal and actually clicking Send). No-op (always ok) if no DVA
 *  is registered yet. `totalNgn` must already include the Paystack
 *  transfer fee + stamp duty (see src/lib/paystack.ts totalChargeFor /
 *  batchCostBreakdown) — not just the raw transfer amount. */
export async function checkWalletCanCover(
  totalNgn: number,
): Promise<{ ok: boolean; reason?: string }> {
  const dva = await fetchDvaAccount();
  if (!dva) return { ok: true };
  const balance = await fetchWalletBalance();
  if (balance < totalNgn) {
    return {
      ok: false,
      reason: `Principal Disbursements wallet balance is ₦${balance.toLocaleString('en-NG', { minimumFractionDigits: 2 })} — fund ${dva.bank_name} ${dva.account_number} before sending ₦${totalNgn.toLocaleString('en-NG', { minimumFractionDigits: 2 })} (including fees).`,
    };
  }
  return { ok: true };
}

/** Used by PaymentSummaryModal's optional wallet-balance block — returns
 *  null (meaning "skip this check, no wallet configured") rather than
 *  throwing, so the modal can render its normal single-balance layout
 *  until a DVA is actually linked. */
export async function fetchWalletBalanceOrNull(): Promise<number | null> {
  const dva = await fetchDvaAccount();
  if (!dva) return null;
  return fetchWalletBalance();
}

export async function fetchWalletLedger(limit = 50): Promise<PrincipalWalletLedgerRow[]> {
  const { data, error } = await supabase
    .from('principal_wallet_ledger')
    .select('id, direction, amount_ngn, source, reference, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as PrincipalWalletLedgerRow[];
}
