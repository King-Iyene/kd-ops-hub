/**
 * NDI Finance — client-side data layer for Niger Delta Innovate's
 * standalone financial module. Completely independent from Principal
 * Disbursements (src/lib/principal-wallet.ts).
 */
import { supabase } from '@/lib/supabase';
import { formatNaira } from '@/lib/format';

export interface NdiDedicatedAccount {
  id: string;
  company_id: string;
  paystack_customer_code: string;
  account_number: string;
  bank_name: string;
  account_name: string | null;
  currency: string;
  created_at: string;
}

export interface NdiLedgerRow {
  id: string;
  company_id: string;
  direction: 'credit' | 'debit';
  amount_ngn: number;
  category: string;
  description: string | null;
  reference: string | null;
  created_at: string;
}

export interface NdiBeneficiary {
  id: string;
  company_id: string;
  name: string;
  bank_name: string;
  account_number: string;
  bank_code: string | null;
  paystack_recipient_code: string | null;
  is_active: boolean;
  created_at: string;
}

export interface NdiTransfer {
  id: string;
  company_id: string;
  beneficiary_id: string | null;
  amount_ngn: number;
  category: string;
  description: string | null;
  narration: string | null;
  paystack_reference: string | null;
  status: 'pending' | 'processing' | 'success' | 'failed' | 'reversed';
  created_at: string;
  completed_at: string | null;
}

export const NDI_CATEGORIES = [
  { key: 'program_expense', label: 'Program Expense', hint: 'Direct programme costs — training, materials, fieldwork, beneficiary support.' },
  { key: 'admin_overhead', label: 'Admin & Overhead', hint: 'Office rent, utilities, insurance, professional services.' },
  { key: 'staff_payroll', label: 'Staff Payroll', hint: 'NDI employee salaries and statutory remittances.' },
  { key: 'grant_disbursement', label: 'Grant Disbursement', hint: 'Sub-grants or direct disbursements to grant beneficiaries.' },
  { key: 'travel', label: 'Travel & Transport', hint: 'Staff travel, fieldwork transport, per diems.' },
  { key: 'equipment', label: 'Equipment & Supplies', hint: 'Laptops, office supplies, programme materials.' },
  { key: 'consultancy', label: 'Consultancy Fees', hint: 'External consultant and contractor payments.' },
  { key: 'other', label: 'Other', hint: 'Miscellaneous disbursements not covered by other categories.' },
] as const;

export function ndiCategoryLabel(key: string | null | undefined): string {
  if (!key) return '—';
  return NDI_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

// ── Dedicated Account ────────────────────────────────────────────

export async function fetchNdiAccount(companyId: string): Promise<NdiDedicatedAccount | null> {
  const { data, error } = await supabase
    .from('ndi_dedicated_account')
    .select('id, company_id, paystack_customer_code, account_number, bank_name, account_name, currency, created_at')
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw error;
  return data as NdiDedicatedAccount | null;
}

export async function createNdiAccount(input: {
  companyId: string;
  paystackCustomerCode: string;
  accountNumber: string;
  bankName: string;
  accountName: string | null;
  createdBy: string;
}): Promise<NdiDedicatedAccount> {
  const { data, error } = await supabase
    .from('ndi_dedicated_account')
    .insert({
      company_id: input.companyId,
      paystack_customer_code: input.paystackCustomerCode,
      account_number: input.accountNumber,
      bank_name: input.bankName,
      account_name: input.accountName,
      created_by: input.createdBy,
    })
    .select('id, company_id, paystack_customer_code, account_number, bank_name, account_name, currency, created_at')
    .single();
  if (error) throw error;
  return data as NdiDedicatedAccount;
}

export async function deleteNdiAccount(id: string): Promise<void> {
  const { error } = await supabase.from('ndi_dedicated_account').delete().eq('id', id);
  if (error) throw error;
}

// ── Wallet Balance ───────────────────────────────────────────────

export async function fetchNdiBalance(companyId: string): Promise<number> {
  const { data, error } = await supabase
    .from('ndi_wallet_ledger')
    .select('direction, amount_ngn')
    .eq('company_id', companyId);
  if (error) throw error;
  return (data ?? []).reduce((sum: number, row: any) => (
    row.direction === 'credit' ? sum + Number(row.amount_ngn) : sum - Number(row.amount_ngn)
  ), 0);
}

export async function checkNdiCanCover(
  totalNgn: number,
  companyId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const acct = await fetchNdiAccount(companyId);
  if (!acct) return { ok: true };
  const balance = await fetchNdiBalance(companyId);
  if (balance < totalNgn) {
    return {
      ok: false,
      reason: `NDI wallet balance is ${formatNaira(balance)} — fund ${acct.bank_name} ${acct.account_number} before sending ${formatNaira(totalNgn)} (including fees).`,
    };
  }
  return { ok: true };
}

// ── Ledger ───────────────────────────────────────────────────────

export async function fetchNdiLedger(companyId: string, limit = 100): Promise<NdiLedgerRow[]> {
  const { data, error } = await supabase
    .from('ndi_wallet_ledger')
    .select('id, company_id, direction, amount_ngn, category, description, reference, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as NdiLedgerRow[];
}

export async function insertNdiLedgerEntry(input: {
  companyId: string;
  direction: 'credit' | 'debit';
  amountNgn: number;
  category: string;
  description?: string;
  reference?: string;
  createdBy: string;
}): Promise<NdiLedgerRow> {
  const { data, error } = await supabase
    .from('ndi_wallet_ledger')
    .insert({
      company_id: input.companyId,
      direction: input.direction,
      amount_ngn: input.amountNgn,
      category: input.category,
      description: input.description ?? null,
      reference: input.reference ?? null,
      created_by: input.createdBy,
    })
    .select('id, company_id, direction, amount_ngn, category, description, reference, created_at')
    .single();
  if (error) throw error;
  return data as NdiLedgerRow;
}

// ── Beneficiaries ────────────────────────────────────────────────

export async function fetchNdiBeneficiaries(companyId: string): Promise<NdiBeneficiary[]> {
  const { data, error } = await supabase
    .from('ndi_beneficiaries')
    .select('id, company_id, name, bank_name, account_number, bank_code, paystack_recipient_code, is_active, created_at')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return (data ?? []) as NdiBeneficiary[];
}

export async function createNdiBeneficiary(input: {
  companyId: string;
  name: string;
  bankName: string;
  accountNumber: string;
  bankCode?: string;
  paystackRecipientCode?: string;
  createdBy: string;
}): Promise<NdiBeneficiary> {
  const { data, error } = await supabase
    .from('ndi_beneficiaries')
    .insert({
      company_id: input.companyId,
      name: input.name,
      bank_name: input.bankName,
      account_number: input.accountNumber,
      bank_code: input.bankCode ?? null,
      paystack_recipient_code: input.paystackRecipientCode ?? null,
      created_by: input.createdBy,
    })
    .select('id, company_id, name, bank_name, account_number, bank_code, paystack_recipient_code, is_active, created_at')
    .single();
  if (error) throw error;
  return data as NdiBeneficiary;
}

export async function deactivateNdiBeneficiary(id: string): Promise<void> {
  const { error } = await supabase
    .from('ndi_beneficiaries')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ── Transfers ────────────────────────────────────────────────────

export async function fetchNdiTransfers(companyId: string, limit = 100): Promise<NdiTransfer[]> {
  const { data, error } = await supabase
    .from('ndi_transfers')
    .select('id, company_id, beneficiary_id, amount_ngn, category, description, narration, paystack_reference, status, created_at, completed_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as NdiTransfer[];
}

export async function createNdiTransfer(input: {
  companyId: string;
  beneficiaryId?: string;
  amountNgn: number;
  category: string;
  description?: string;
  narration?: string;
  createdBy: string;
}): Promise<NdiTransfer> {
  const { data, error } = await supabase
    .from('ndi_transfers')
    .insert({
      company_id: input.companyId,
      beneficiary_id: input.beneficiaryId ?? null,
      amount_ngn: input.amountNgn,
      category: input.category,
      description: input.description ?? null,
      narration: input.narration ?? null,
      created_by: input.createdBy,
    })
    .select('id, company_id, beneficiary_id, amount_ngn, category, description, narration, paystack_reference, status, created_at, completed_at')
    .single();
  if (error) throw error;
  return data as NdiTransfer;
}

// ── CSV Export ────────────────────────────────────────────────────

export interface NdiGrantReportData {
  generatedAt: string;
  account: NdiDedicatedAccount | null;
  balance: number;
  totalCredits: number;
  totalDebits: number;
  transactionCount: number;
  categoryBreakdown: { category: string; label: string; credits: number; debits: number; net: number; count: number }[];
  recentTransactions: NdiLedgerRow[];
  beneficiaryCount: number;
  transfersSummary: { total: number; successful: number; pending: number; failed: number; totalAmount: number };
}

export async function generateNdiGrantReport(companyId: string): Promise<NdiGrantReportData> {
  const [account, rows, beneficiaries, transfers] = await Promise.all([
    fetchNdiAccount(companyId),
    fetchNdiLedger(companyId, 10000),
    fetchNdiBeneficiaries(companyId),
    fetchNdiTransfers(companyId, 10000),
  ]);

  const totalCredits = rows.filter((r) => r.direction === 'credit').reduce((s, r) => s + Number(r.amount_ngn), 0);
  const totalDebits = rows.filter((r) => r.direction === 'debit').reduce((s, r) => s + Number(r.amount_ngn), 0);

  const catMap = new Map<string, { credits: number; debits: number; count: number }>();
  for (const r of rows) {
    const key = r.category || 'other';
    const entry = catMap.get(key) ?? { credits: 0, debits: 0, count: 0 };
    if (r.direction === 'credit') entry.credits += Number(r.amount_ngn);
    else entry.debits += Number(r.amount_ngn);
    entry.count++;
    catMap.set(key, entry);
  }

  const categoryBreakdown = Array.from(catMap.entries())
    .map(([cat, v]) => ({ category: cat, label: ndiCategoryLabel(cat), credits: v.credits, debits: v.debits, net: v.credits - v.debits, count: v.count }))
    .sort((a, b) => b.debits - a.debits);

  return {
    generatedAt: new Date().toISOString(),
    account,
    balance: totalCredits - totalDebits,
    totalCredits,
    totalDebits,
    transactionCount: rows.length,
    categoryBreakdown,
    recentTransactions: rows.slice(0, 20),
    beneficiaryCount: beneficiaries.length,
    transfersSummary: {
      total: transfers.length,
      successful: transfers.filter((t) => t.status === 'success').length,
      pending: transfers.filter((t) => t.status === 'pending' || t.status === 'processing').length,
      failed: transfers.filter((t) => t.status === 'failed').length,
      totalAmount: transfers.filter((t) => t.status === 'success').reduce((s, t) => s + Number(t.amount_ngn), 0),
    },
  };
}

export async function exportNdiLedgerCsv(companyId: string): Promise<string> {
  const rows = await fetchNdiLedger(companyId, 10000);
  const balance = await fetchNdiBalance(companyId);
  const acct = await fetchNdiAccount(companyId);
  const header = 'Date,Direction,Amount (NGN),Category,Description,Reference';
  const lines = rows.map((r) =>
    `${r.created_at},${r.direction},${r.amount_ngn},${ndiCategoryLabel(r.category)},"${(r.description ?? '').replace(/"/g, '""')}",${r.reference ?? ''}`
  );
  const summary = [
    '',
    `Account,${acct?.bank_name ?? 'N/A'} ${acct?.account_number ?? 'N/A'}`,
    `Balance,${balance}`,
    `Exported,${new Date().toISOString()}`,
  ];
  return [header, ...lines, ...summary].join('\n');
}
