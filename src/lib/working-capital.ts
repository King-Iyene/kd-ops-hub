/**
 * Working Capital Monitor — current ratio, quick ratio, and weekly waterfall.
 *
 * Working capital = current assets − current liabilities.
 *   Current assets:  cash on hand + accounts receivable (outstanding invoices)
 *   Current liabilities:  accounts payable (approved unpaid expenses +
 *                          approved/funded payment batches) + next payroll estimate
 *
 * Ratios:
 *   Current ratio = current assets / current liabilities (healthy > 1.5)
 *   Quick ratio   = (cash + receivables) / current liabilities (healthy > 1.0)
 *
 * The weekly waterfall projects how working capital evolves over the next
 * 4 weeks based on known inflows (invoice due dates) and outflows
 * (payroll schedule, batch payment dates).
 *
 * Pure functions are independently tested in working-capital.test.ts.
 */

import { supabase } from '@/lib/supabase';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface WorkingCapitalSnapshot {
  cash_on_hand_ngn: number;
  accounts_receivable_ngn: number;
  current_assets_ngn: number;
  accounts_payable_ngn: number;
  upcoming_payroll_ngn: number;
  current_liabilities_ngn: number;
  working_capital_ngn: number;
  current_ratio: number | null;
  quick_ratio: number | null;
}

export type WcBand = 'strong' | 'adequate' | 'tight' | 'negative';

export interface WorkingCapitalResult {
  snapshot: WorkingCapitalSnapshot;
  band: WcBand;
  waterfall: WaterfallWeek[];
}

export interface WaterfallWeek {
  week_start: string;
  label: string;
  inflows_ngn: number;
  outflows_ngn: number;
  net_ngn: number;
  running_wc_ngn: number;
}

// ─── Pure functions ────────────────────────────────────────────────────────

export interface WorkingCapitalInput {
  cashOnHand: number;
  accountsReceivable: number;
  accountsPayable: number;
  upcomingPayroll: number;
}

export function bandForCurrentRatio(ratio: number | null): WcBand {
  if (ratio == null) return 'tight';
  if (ratio >= 2.0) return 'strong';
  if (ratio >= 1.5) return 'adequate';
  if (ratio >= 1.0) return 'tight';
  return 'negative';
}

export function computeWorkingCapital(input: WorkingCapitalInput): WorkingCapitalSnapshot {
  const currentAssets = input.cashOnHand + input.accountsReceivable;
  const currentLiabilities = input.accountsPayable + input.upcomingPayroll;
  const wc = currentAssets - currentLiabilities;
  const currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : null;
  const quickRatio = currentLiabilities > 0 ? (input.cashOnHand + input.accountsReceivable) / currentLiabilities : null;

  return {
    cash_on_hand_ngn: input.cashOnHand,
    accounts_receivable_ngn: input.accountsReceivable,
    current_assets_ngn: currentAssets,
    accounts_payable_ngn: input.accountsPayable,
    upcoming_payroll_ngn: input.upcomingPayroll,
    current_liabilities_ngn: currentLiabilities,
    working_capital_ngn: wc,
    current_ratio: currentRatio,
    quick_ratio: quickRatio,
  };
}

export interface WaterfallInput {
  startingWc: number;
  weeklyInflows: number[];
  weeklyOutflows: number[];
  startDate: Date;
}

export function computeWaterfall(input: WaterfallInput): WaterfallWeek[] {
  const weeks: WaterfallWeek[] = [];
  let running = input.startingWc;

  const numWeeks = Math.max(input.weeklyInflows.length, input.weeklyOutflows.length);
  for (let i = 0; i < numWeeks; i++) {
    const inflows = input.weeklyInflows[i] ?? 0;
    const outflows = input.weeklyOutflows[i] ?? 0;
    const net = inflows - outflows;
    running += net;

    const weekStart = new Date(input.startDate.getTime() + i * 7 * 86_400_000);
    weeks.push({
      week_start: weekStart.toISOString().slice(0, 10),
      label: i === 0 ? 'This week' : `Week ${i + 1}`,
      inflows_ngn: inflows,
      outflows_ngn: outflows,
      net_ngn: net,
      running_wc_ngn: running,
    });
  }

  return weeks;
}

// ─── Fetch ─────────────────────────────────────────────────────────────────

const COMPANY_SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

export async function fetchWorkingCapitalData(): Promise<WorkingCapitalResult> {
  const fourWeeksOut = new Date(Date.now() + 28 * 86_400_000).toISOString().slice(0, 10);

  const [settingsRes, arRes, apExpRes, apBatchRes, payrollRes, dueSoonRes] = await Promise.all([
    supabase.from('company_settings').select('cash_on_hand_ngn').eq('id', COMPANY_SETTINGS_ID).maybeSingle(),

    supabase.from('invoices').select('total_ngn, due_date')
      .in('status', ['sent', 'overdue']).is('deleted_at', null),

    supabase.from('expenses').select('amount_ngn')
      .eq('status', 'approved').is('deleted_at', null).is('payment_status', null),

    supabase.from('payment_batches').select('total_amount')
      .in('status', ['approved', 'funded']).is('deleted_at', null),

    supabase.from('payroll_runs').select('total_burn_ngn')
      .in('status', ['approved', 'paid']).order('period', { ascending: false }).limit(1).maybeSingle(),

    supabase.from('invoices').select('total_ngn, due_date')
      .in('status', ['sent', 'overdue']).is('deleted_at', null)
      .lte('due_date', fourWeeksOut),
  ]);

  if (settingsRes.error) throw settingsRes.error;
  if (arRes.error) throw arRes.error;
  if (apExpRes.error) throw apExpRes.error;
  if (apBatchRes.error) throw apBatchRes.error;

  const cashOnHand = Number((settingsRes.data as any)?.cash_on_hand_ngn || 0);
  const ar = (arRes.data || []).reduce((s, r) => s + Number((r as any).total_ngn || 0), 0);
  const apExp = (apExpRes.data || []).reduce((s, r) => s + Number((r as any).amount_ngn || 0), 0);
  const apBatch = (apBatchRes.data || []).reduce((s, r) => s + Number((r as any).total_amount || 0), 0);
  const latestPayroll = payrollRes.data ? Number((payrollRes.data as any).total_burn_ngn || 0) : 0;

  const snapshot = computeWorkingCapital({
    cashOnHand,
    accountsReceivable: ar,
    accountsPayable: apExp + apBatch,
    upcomingPayroll: latestPayroll,
  });

  const now = new Date();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueSoonInvoices = (dueSoonRes.data || []) as Array<{ total_ngn: number; due_date: string }>;
  const weeklyInflows = [0, 0, 0, 0];
  for (const inv of dueSoonInvoices) {
    const dueMs = new Date(inv.due_date).getTime() - weekStart.getTime();
    const weekIdx = Math.max(0, Math.min(3, Math.floor(dueMs / (7 * 86_400_000))));
    weeklyInflows[weekIdx] += Number(inv.total_ngn || 0);
  }

  const weeklyPayroll = latestPayroll / 4;
  const weeklyOutflows = [
    (apExp + apBatch) * 0.4 + weeklyPayroll,
    (apExp + apBatch) * 0.3 + weeklyPayroll,
    (apExp + apBatch) * 0.2 + weeklyPayroll,
    (apExp + apBatch) * 0.1 + weeklyPayroll,
  ];

  const waterfall = computeWaterfall({
    startingWc: snapshot.working_capital_ngn,
    weeklyInflows,
    weeklyOutflows,
    startDate: weekStart,
  });

  return {
    snapshot,
    band: bandForCurrentRatio(snapshot.current_ratio),
    waterfall,
  };
}
