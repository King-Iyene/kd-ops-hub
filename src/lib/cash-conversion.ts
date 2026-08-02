/**
 * Cash Conversion Cycle — DSO, DPO, and CCC metrics.
 *
 * DSO (Days Sales Outstanding): how quickly the company collects on invoices.
 *   Formula: (accounts receivable / trailing daily revenue) in days.
 *
 * DPO (Days Payable Outstanding): how long the company takes to pay suppliers.
 *   Formula: (accounts payable / trailing daily cost of goods) in days.
 *   Here "accounts payable" = approved-but-unpaid expenses + approved/funded
 *   payment batches, and "cost of goods" ≈ trailing expense + batch outflows.
 *
 * CCC = DSO − DPO. A lower (or negative) CCC means the company gets paid
 * before it has to pay out — the ideal cash position.
 *
 * Pure functions are independently tested in cash-conversion.test.ts.
 */

import { supabase } from '@/lib/supabase';

// ─── DSO ───────────────────────────────────────────────────────────────────

export interface DsoInput {
  outstandingReceivables: number;
  trailingRevenue: number;
  trailingDays: number;
}

export interface DsoResult {
  dso_days: number | null;
  outstanding_receivables_ngn: number;
  trailing_revenue_ngn: number;
  trailing_days: number;
}

export function computeDso(input: DsoInput): DsoResult {
  const { outstandingReceivables, trailingRevenue, trailingDays } = input;
  const dailyRevenue = trailingDays > 0 ? trailingRevenue / trailingDays : 0;
  return {
    dso_days: dailyRevenue > 0 ? outstandingReceivables / dailyRevenue : null,
    outstanding_receivables_ngn: outstandingReceivables,
    trailing_revenue_ngn: trailingRevenue,
    trailing_days: trailingDays,
  };
}

// ─── DPO ───────────────────────────────────────────────────────────────────

export interface DpoInput {
  outstandingPayables: number;
  trailingCost: number;
  trailingDays: number;
}

export interface DpoResult {
  dpo_days: number | null;
  outstanding_payables_ngn: number;
  trailing_cost_ngn: number;
  trailing_days: number;
}

export function computeDpo(input: DpoInput): DpoResult {
  const { outstandingPayables, trailingCost, trailingDays } = input;
  const dailyCost = trailingDays > 0 ? trailingCost / trailingDays : 0;
  return {
    dpo_days: dailyCost > 0 ? outstandingPayables / dailyCost : null,
    outstanding_payables_ngn: outstandingPayables,
    trailing_cost_ngn: trailingCost,
    trailing_days: trailingDays,
  };
}

// ─── CCC ───────────────────────────────────────────────────────────────────

export type CccBand = 'excellent' | 'good' | 'fair' | 'poor';

export interface CashConversionResult {
  dso: DsoResult;
  dpo: DpoResult;
  ccc_days: number | null;
  band: CccBand;
}

export function bandForCcc(cccDays: number | null): CccBand {
  if (cccDays == null) return 'fair';
  if (cccDays <= 0) return 'excellent';
  if (cccDays <= 30) return 'good';
  if (cccDays <= 60) return 'fair';
  return 'poor';
}

export function computeCashConversion(dsoInput: DsoInput, dpoInput: DpoInput): CashConversionResult {
  const dso = computeDso(dsoInput);
  const dpo = computeDpo(dpoInput);
  const ccc_days = dso.dso_days != null && dpo.dpo_days != null
    ? dso.dso_days - dpo.dpo_days
    : dso.dso_days != null ? dso.dso_days
    : null;
  return { dso, dpo, ccc_days, band: bandForCcc(ccc_days) };
}

// ─── Fetch ─────────────────────────────────────────────────────────────────

export async function fetchCashConversionData(trailingDays = 90): Promise<CashConversionResult> {
  const since = new Date(Date.now() - trailingDays * 86_400_000).toISOString().slice(0, 10);
  const sinceMonth = since.slice(0, 7);

  const [arRes, revenueRes, apExpensesRes, apBatchesRes, costExpensesRes, costBatchesRes] = await Promise.all([
    supabase
      .from('invoices')
      .select('total_ngn')
      .in('status', ['sent', 'overdue'])
      .is('deleted_at', null),

    supabase
      .from('revenue_entries')
      .select('amount_ngn, month')
      .gte('month', sinceMonth),

    supabase
      .from('expenses')
      .select('amount_ngn')
      .eq('status', 'approved')
      .is('deleted_at', null)
      .is('payment_status', null),

    supabase
      .from('payment_batches')
      .select('total_amount')
      .in('status', ['approved', 'funded'])
      .is('deleted_at', null),

    supabase
      .from('expenses')
      .select('amount_ngn, date')
      .in('status', ['approved', 'paid'])
      .is('deleted_at', null)
      .gte('date', since),

    supabase
      .from('payment_batches')
      .select('total_amount, payment_date')
      .in('status', ['processed', 'partially_processed'])
      .is('deleted_at', null)
      .gte('payment_date', since),
  ]);

  if (arRes.error) throw arRes.error;
  if (revenueRes.error) throw revenueRes.error;
  if (apExpensesRes.error) throw apExpensesRes.error;
  if (apBatchesRes.error) throw apBatchesRes.error;
  if (costExpensesRes.error) throw costExpensesRes.error;
  if (costBatchesRes.error) throw costBatchesRes.error;

  const outstandingReceivables = (arRes.data || []).reduce((s, r) => s + Number((r as any).total_ngn || 0), 0);
  const trailingRevenue = (revenueRes.data || []).reduce((s, r) => s + Number((r as any).amount_ngn || 0), 0);

  const apExpenses = (apExpensesRes.data || []).reduce((s, r) => s + Number((r as any).amount_ngn || 0), 0);
  const apBatches = (apBatchesRes.data || []).reduce((s, r) => s + Number((r as any).total_amount || 0), 0);
  const outstandingPayables = apExpenses + apBatches;

  const costExpenses = (costExpensesRes.data || []).reduce((s, r) => s + Number((r as any).amount_ngn || 0), 0);
  const costBatches = (costBatchesRes.data || []).reduce((s, r) => s + Number((r as any).total_amount || 0), 0);
  const trailingCost = costExpenses + costBatches;

  return computeCashConversion(
    { outstandingReceivables, trailingRevenue, trailingDays },
    { outstandingPayables, trailingCost, trailingDays },
  );
}
