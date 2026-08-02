/**
 * CFO Dashboard — the board-level aggregation layer.
 *
 * Airtable stays the granular base for ad-hoc financial planning; this
 * module pulls together numbers KDOps already tracks (payroll, cash flow,
 * compliance, subscriptions, budgets) into a single high-level view.
 *
 * Design rule: every aggregation that isn't a straight passthrough of one
 * query is a pure, independently-testable function. The `fetch*` wrappers
 * do the I/O and hand plain data to those pure functions — see
 * cfo-dashboard.test.ts.
 *
 * Money math here deliberately mirrors existing, already-verified logic
 * elsewhere in the app rather than inventing new formulas:
 *   - runway            → reuses fetchForecast() / forecast_cashflow() RPC (src/lib/cashflow.ts)
 *   - employer pension / NSITF rates → imported from src/lib/tax.ts, not redefined
 *   - "actual disbursed" for budgets → the same actualDisbursed/fetchSucceededSums
 *     pattern as Reports.tsx's BudgetReport (the more accurate of two formulas
 *     that exist in this codebase — see that file before changing this one)
 */

import { supabase } from '@/lib/supabase';
import { fetchForecast, bandForRunwayWeeks, type RunwayBand } from '@/lib/cashflow';
import { PENSION_EMPLOYER_RATE, NSITF_RATE } from '@/lib/tax';

const COMPANY_SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

// ─── Financial pulse (top KPI strip) ───────────────────────────────────────

export interface FinancialPulse {
  cash_on_hand_ngn: number;
  cash_updated_at: string | null;
  cash_is_stale: boolean; // no update in > 7 days
  net_monthly_burn_ngn: number;
  runway_weeks: number | null;
  runway_band: RunwayBand;
  total_headcount: number;
  monthly_revenue_estimate_ngn: number;
  revenue_per_employee_ngn: number | null;
  latest_payroll_burn_ngn: number | null;
  payroll_pct_of_revenue: number | null;
}

export async function fetchFinancialPulse(): Promise<FinancialPulse> {
  const [settingsRes, forecast, headcountRes, latestRunRes] = await Promise.all([
    supabase
      .from('company_settings')
      .select('cash_on_hand_ngn, cash_updated_at, external_monthly_burn_ngn, monthly_revenue_estimate_ngn')
      .eq('id', COMPANY_SETTINGS_ID)
      .maybeSingle(),
    fetchForecast(1),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .neq('role', 'driver')
      .gt('salary_ngn', 0),
    supabase
      .from('payroll_runs')
      .select('total_burn_ngn')
      .in('status', ['approved', 'paid'])
      .order('period', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (settingsRes.error) throw settingsRes.error;
  if (headcountRes.error) throw headcountRes.error;
  if (latestRunRes.error) throw latestRunRes.error;

  const s = settingsRes.data as any;
  const cashOnHand = Number(s?.cash_on_hand_ngn || 0);
  const externalBurn = Number(s?.external_monthly_burn_ngn || 0);
  const revenue = Number(s?.monthly_revenue_estimate_ngn || 0);
  const netBurn = Math.max(0, externalBurn - revenue);
  const runwayWeeks = forecast[0]?.runway_weeks_remaining ?? null;
  const headcount = headcountRes.count ?? 0;
  const latestBurn = latestRunRes.data ? Number((latestRunRes.data as any).total_burn_ngn || 0) : null;

  let cashIsStale = false;
  if (s?.cash_updated_at) {
    cashIsStale = Date.now() - new Date(s.cash_updated_at).getTime() > 7 * 86_400_000;
  }

  return {
    cash_on_hand_ngn: cashOnHand,
    cash_updated_at: s?.cash_updated_at ?? null,
    cash_is_stale: cashIsStale,
    net_monthly_burn_ngn: netBurn,
    runway_weeks: runwayWeeks,
    runway_band: bandForRunwayWeeks(runwayWeeks),
    total_headcount: headcount,
    monthly_revenue_estimate_ngn: revenue,
    revenue_per_employee_ngn: headcount > 0 ? revenue / headcount : null,
    latest_payroll_burn_ngn: latestBurn,
    payroll_pct_of_revenue: latestBurn !== null && revenue > 0 ? (latestBurn / revenue) * 100 : null,
  };
}

// ─── Department cost breakdown ─────────────────────────────────────────────

export interface DepartmentCostRow {
  department_id: string | null;
  department_name: string;
  headcount: number;
  total_gross_ngn: number;
  total_employer_pension_ngn: number;
  total_nsitf_ngn: number;
  /** Fully-loaded employer cost: gross + employer pension + NSITF. */
  total_ctc_ngn: number;
}

export interface CostableEmployee {
  id: string;
  salary_ngn: number | null;
  department_id: string | null;
  pension_enabled: boolean | null;
  use_salary_components: boolean | null;
  basic_ngn: number | null;
  housing_ngn: number | null;
  transport_ngn: number | null;
}

/** PRA 2014 pension base: basic+housing+transport when components are configured, else gross. */
function pensionBaseFor(e: CostableEmployee): number {
  if (e.use_salary_components) {
    return Number(e.basic_ngn || 0) + Number(e.housing_ngn || 0) + Number(e.transport_ngn || 0);
  }
  return Number(e.salary_ngn || 0);
}

/**
 * Groups employees by department and totals gross salary + employer-side
 * statutory cost (pension 10%, NSITF 1%) per department. Employees with no
 * department are grouped under "No department" rather than dropped.
 */
export function computeDepartmentCostBreakdown(
  employees: CostableEmployee[],
  departments: { id: string; name: string }[],
  includeNsitf = true,
): DepartmentCostRow[] {
  const deptNameById = new Map(departments.map((d) => [d.id, d.name]));
  const rows = new Map<string, DepartmentCostRow>();

  for (const e of employees) {
    const k = e.department_id ?? '__none__';
    if (!rows.has(k)) {
      rows.set(k, {
        department_id: e.department_id,
        department_name: e.department_id
          ? (deptNameById.get(e.department_id) ?? 'Unknown department')
          : 'No department',
        headcount: 0,
        total_gross_ngn: 0,
        total_employer_pension_ngn: 0,
        total_nsitf_ngn: 0,
        total_ctc_ngn: 0,
      });
    }
    const row = rows.get(k)!;
    const gross = Number(e.salary_ngn || 0);
    const employerPension = e.pension_enabled !== false ? pensionBaseFor(e) * PENSION_EMPLOYER_RATE : 0;
    const nsitf = includeNsitf ? gross * NSITF_RATE : 0;

    row.headcount += 1;
    row.total_gross_ngn += gross;
    row.total_employer_pension_ngn += employerPension;
    row.total_nsitf_ngn += nsitf;
    row.total_ctc_ngn += gross + employerPension + nsitf;
  }

  return Array.from(rows.values()).sort((a, b) => b.total_ctc_ngn - a.total_ctc_ngn);
}

export async function fetchDepartmentCostBreakdown(): Promise<DepartmentCostRow[]> {
  const [employeesRes, departmentsRes, settingsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, salary_ngn, department_id, pension_enabled, use_salary_components, basic_ngn, housing_ngn, transport_ngn')
      .eq('status', 'active')
      .neq('role', 'driver')
      .gt('salary_ngn', 0),
    supabase.from('departments').select('id, name'),
    supabase.from('company_settings').select('nsitf_enabled').eq('id', COMPANY_SETTINGS_ID).maybeSingle(),
  ]);
  if (employeesRes.error) throw employeesRes.error;
  if (departmentsRes.error) throw departmentsRes.error;

  const includeNsitf = (settingsRes.data as any)?.nsitf_enabled !== false;
  return computeDepartmentCostBreakdown(
    (employeesRes.data || []) as CostableEmployee[],
    (departmentsRes.data || []) as { id: string; name: string }[],
    includeNsitf,
  );
}

// ─── Payroll trend (month-over-month) ──────────────────────────────────────

export interface PayrollRunTotals {
  period: string; // "YYYY-MM"
  total_burn_ngn: number;
  total_employee_ngn: number;
  employee_count: number | null;
}

export interface PayrollTrendPoint extends PayrollRunTotals {
  /** Change vs the previous period in this series. Null for the first point. */
  delta_ngn: number | null;
  delta_pct: number | null;
}

/**
 * Computes period-over-period deltas directly from payroll_runs totals.
 * Deliberately does NOT depend on payroll_run_variance — that table is only
 * populated going forward from when it was introduced (no backfill), so a
 * dashboard spanning older runs would silently show gaps if it relied on it.
 */
export function computePayrollTrend(runs: PayrollRunTotals[]): PayrollTrendPoint[] {
  const sorted = [...runs].sort((a, b) => a.period.localeCompare(b.period));
  return sorted.map((run, i) => {
    const prev = i > 0 ? sorted[i - 1] : null;
    const delta = prev ? run.total_burn_ngn - prev.total_burn_ngn : null;
    const deltaPct = prev && prev.total_burn_ngn > 0 && delta !== null
      ? (delta / prev.total_burn_ngn) * 100
      : null;
    return { ...run, delta_ngn: delta, delta_pct: deltaPct };
  });
}

export async function fetchPayrollTrend(months = 12): Promise<PayrollTrendPoint[]> {
  const { data, error } = await supabase
    .from('payroll_runs')
    .select('period, total_burn_ngn, total_employee_ngn, employee_count')
    .in('status', ['approved', 'paid'])
    .order('period', { ascending: false })
    .limit(months);
  if (error) throw error;
  return computePayrollTrend((data || []) as PayrollRunTotals[]);
}

// ─── Upcoming obligations & compliance ─────────────────────────────────────

export interface ComplianceAlert {
  id: string;
  kind: string;
  period: string;
  due_date: string;
  amount_ngn: number | null;
  status: string;
}

/** Filings that are due today or earlier and not yet filed. */
export async function fetchOverdueCompliance(): Promise<ComplianceAlert[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('compliance_filings')
    .select('id, kind, period, due_date, amount_ngn, status')
    .neq('status', 'filed')
    .lte('due_date', today)
    .order('due_date', { ascending: true });
  if (error) throw error;
  return (data || []) as ComplianceAlert[];
}

export interface UpcomingRenewal {
  id: string;
  name: string;
  amount_ngn: number;
  next_renewal_date: string;
}

export async function fetchUpcomingRenewals(days = 30): Promise<UpcomingRenewal[]> {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const untilStr = new Date(today.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, name, amount_ngn, next_renewal_date')
    .eq('status', 'active')
    .gte('next_renewal_date', todayStr)
    .lte('next_renewal_date', untilStr)
    .order('next_renewal_date', { ascending: true });
  if (error) throw error;
  return (data || []) as UpcomingRenewal[];
}

// ─── Budget utilization (current period) ───────────────────────────────────
//
// Mirrors Reports.tsx's BudgetReport calculation exactly (actualDisbursed +
// fetchSucceededSums), scoped to whichever approved budget(s) cover today.

export interface BudgetUtilization {
  budget_id: string;
  name: string;
  planned_ngn: number;
  actual_ngn: number;
  utilization_pct: number | null;
}

function actualDisbursedForBatch(
  batch: { id: string; status: string; total_amount: number },
  succeededByBatch: Map<string, number>,
): number {
  if (batch.status === 'processed') return Number(batch.total_amount || 0);
  if (batch.status === 'partially_processed') return succeededByBatch.get(batch.id) ?? 0;
  return 0;
}

async function fetchSucceededBatchSums(
  batches: Array<{ id: string; status: string }>,
): Promise<Map<string, number>> {
  const partialIds = batches.filter((b) => b.status === 'partially_processed').map((b) => b.id);
  if (partialIds.length === 0) return new Map();
  const { data: items } = await supabase
    .from('batch_items')
    .select('batch_id, amount_ngn, status')
    .in('batch_id', partialIds);
  const sums = new Map<string, number>();
  for (const it of (items || []) as any[]) {
    if (it.status === 'succeeded') {
      sums.set(it.batch_id, (sums.get(it.batch_id) ?? 0) + Number(it.amount_ngn || 0));
    }
  }
  return sums;
}

export async function fetchCurrentBudgetUtilization(): Promise<BudgetUtilization[]> {
  const today = new Date().toISOString().slice(0, 10);
  const [budgetsRes, expensesRes, batchesRes] = await Promise.all([
    supabase
      .from('budgets')
      .select('id, name, total_amount_ngn, period_start, period_end, status')
      .eq('status', 'approved')
      .is('deleted_at', null)
      .lte('period_start', today)
      .gte('period_end', today),
    supabase.from('expenses').select('amount_ngn, date').eq('status', 'approved').is('deleted_at', null).limit(2000),
    supabase
      .from('payment_batches')
      .select('id, total_amount, payment_date, status')
      .in('status', ['processed', 'partially_processed'])
      .is('deleted_at', null),
  ]);
  if (budgetsRes.error) throw budgetsRes.error;
  if (expensesRes.error) throw expensesRes.error;
  if (batchesRes.error) throw batchesRes.error;

  const budgets = (budgetsRes.data || []) as any[];
  if (budgets.length === 0) return [];

  const succeededByBatch = await fetchSucceededBatchSums((batchesRes.data || []) as any[]);
  const expenses = (expensesRes.data || []) as any[];
  const batches = (batchesRes.data || []) as any[];

  return budgets.map((b) => {
    const s = new Date(b.period_start).getTime();
    const e = new Date(b.period_end).getTime() + 24 * 60 * 60 * 1000 - 1;
    let actual = 0;
    for (const ex of expenses) {
      const t = new Date(ex.date).getTime();
      if (t >= s && t <= e) actual += Number(ex.amount_ngn || 0);
    }
    for (const bx of batches) {
      const t = new Date(bx.payment_date).getTime();
      if (t >= s && t <= e) actual += actualDisbursedForBatch(bx, succeededByBatch);
    }
    const planned = Number(b.total_amount_ngn || 0);
    return {
      budget_id: b.id,
      name: b.name,
      planned_ngn: planned,
      actual_ngn: actual,
      utilization_pct: planned > 0 ? (actual / planned) * 100 : null,
    };
  });
}
