/**
 * Total Cost of Talent Intelligence — Phase 6 of the CFO Finance Module.
 *
 * Three capabilities:
 *   1. Attrition cost — what an exit actually costs: the recorded final
 *      settlement plus an ADJUSTABLE backfill-cost estimate (there is no
 *      real "cost per hire" figure tracked anywhere in this codebase, so
 *      the estimate is shown as an assumption the user controls, never as
 *      a hard fact).
 *   2. Contractor vs employee cost comparison — average fully-loaded
 *      employee cost (gross + employer pension 10% + NSITF 1%) vs average
 *      contractor monthly pay (NGN direct, or USD converted at the live
 *      FX rate — contractors carry no statutory employer cost).
 *   3. Compensation bands — min / median / max monthly salary per
 *      department. Grouped by department, not free-text job_title, since
 *      job_title is unstructured free text in this schema and a band
 *      chart built on messy text would mislead rather than inform.
 *
 * Pure functions are independently tested in talent-cost.test.ts; `fetch*`
 * wrappers only do I/O.
 */

import { supabase } from '@/lib/supabase';
import { PENSION_EMPLOYER_RATE, NSITF_RATE } from '@/lib/tax';
import { usdMinorToNgnMinor, toMajor } from '@/lib/money';

const COMPANY_SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

// ─── Attrition cost ─────────────────────────────────────────────────────────

export interface TerminationRecord {
  id: string;
  employee_id: string;
  employee_name: string;
  department_name: string;
  termination_type: string;
  start_date: string | null;
  last_working_day: string | null;
  monthly_salary_ngn: number;
  final_settlement_ngn: number;
}

export interface AttritionCostResult extends TerminationRecord {
  tenure_months: number | null;
  /** Assumption-driven backfill estimate — NOT a tracked cost, purely modeled. */
  estimated_backfill_cost_ngn: number;
  total_cost_ngn: number;
}

/**
 * Computes the cost of one exit. `replacementCostMonths` is an explicit,
 * adjustable assumption (default 3 months of gross salary — a conservative
 * placeholder covering vacancy productivity loss + hiring effort) since
 * KDOps doesn't track a real recruiting-spend figure per hire yet.
 */
export function computeAttritionCost(
  record: TerminationRecord,
  replacementCostMonths = 3,
): AttritionCostResult {
  let tenure_months: number | null = null;
  if (record.start_date && record.last_working_day) {
    const start = new Date(record.start_date).getTime();
    const end = new Date(record.last_working_day).getTime();
    tenure_months = Math.max(0, (end - start) / (1000 * 60 * 60 * 24 * 30.44));
  }

  const estimated_backfill_cost_ngn = Math.max(0, record.monthly_salary_ngn) * Math.max(0, replacementCostMonths);
  const total_cost_ngn = Math.max(0, record.final_settlement_ngn) + estimated_backfill_cost_ngn;

  return { ...record, tenure_months, estimated_backfill_cost_ngn, total_cost_ngn };
}

/** Raw termination records for the trailing `months`, cost not yet computed. */
export async function fetchTerminationRecords(months = 12): Promise<TerminationRecord[]> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('terminations')
    .select(
      'id, employee_id, termination_type, last_working_day, final_settlement_ngn, ' +
        'employee:profiles!terminations_employee_id_fkey(full_name, salary_ngn, start_date, department:departments(name))',
    )
    .eq('status', 'completed')
    .gte('last_working_day', cutoffStr)
    .order('last_working_day', { ascending: false });
  if (error) throw error;

  return ((data || []) as any[]).map((row) => ({
    id: row.id,
    employee_id: row.employee_id,
    employee_name: row.employee?.full_name ?? 'Unknown',
    department_name: row.employee?.department?.name ?? 'No department',
    termination_type: row.termination_type,
    start_date: row.employee?.start_date ?? null,
    last_working_day: row.last_working_day,
    monthly_salary_ngn: Number(row.employee?.salary_ngn || 0),
    final_settlement_ngn: Number(row.final_settlement_ngn || 0),
  }));
}

/** Convenience one-shot fetch for non-interactive contexts (assumption baked in at call time). */
export async function fetchAttritionHistory(months = 12, replacementCostMonths = 3): Promise<AttritionCostResult[]> {
  const records = await fetchTerminationRecords(months);
  return records.map((r) => computeAttritionCost(r, replacementCostMonths));
}

// ─── Contractor vs employee cost comparison ────────────────────────────────

export interface CostComparisonEmployee {
  salary_ngn: number | null;
  pension_enabled: boolean | null;
}

export interface CostComparisonContractor {
  id: string;
  monthly_cost_ngn: number;
}

export interface CostComparisonResult {
  employee_count: number;
  employee_avg_monthly_cost_ngn: number;
  employee_total_monthly_cost_ngn: number;
  contractor_count: number;
  contractor_avg_monthly_cost_ngn: number;
  contractor_total_monthly_cost_ngn: number;
  /** Average employee cost ÷ average contractor cost. Null if either side is empty. */
  employee_to_contractor_ratio: number | null;
}

/**
 * Compares average fully-loaded employee cost against average contractor
 * pay. Employee cost includes employer pension (10%) + NSITF (1%);
 * contractor cost does not, by design — contractors aren't payroll.
 */
export function computeCostComparison(
  employees: CostComparisonEmployee[],
  contractors: CostComparisonContractor[],
): CostComparisonResult {
  const employeeCosts = employees.map((e) => {
    const gross = Number(e.salary_ngn || 0);
    const employerPension = e.pension_enabled !== false ? gross * PENSION_EMPLOYER_RATE : 0;
    const nsitf = gross * NSITF_RATE;
    return gross + employerPension + nsitf;
  });
  const employee_total_monthly_cost_ngn = employeeCosts.reduce((s, c) => s + c, 0);
  const employee_count = employees.length;
  const employee_avg_monthly_cost_ngn = employee_count > 0 ? employee_total_monthly_cost_ngn / employee_count : 0;

  const contractor_total_monthly_cost_ngn = contractors.reduce((s, c) => s + Number(c.monthly_cost_ngn || 0), 0);
  const contractor_count = contractors.length;
  const contractor_avg_monthly_cost_ngn = contractor_count > 0 ? contractor_total_monthly_cost_ngn / contractor_count : 0;

  return {
    employee_count,
    employee_avg_monthly_cost_ngn,
    employee_total_monthly_cost_ngn,
    contractor_count,
    contractor_avg_monthly_cost_ngn,
    contractor_total_monthly_cost_ngn,
    employee_to_contractor_ratio:
      employee_count > 0 && contractor_count > 0 && contractor_avg_monthly_cost_ngn > 0
        ? employee_avg_monthly_cost_ngn / contractor_avg_monthly_cost_ngn
        : null,
  };
}

export async function fetchCostComparison(): Promise<CostComparisonResult> {
  const [employeesRes, contractorsRes, settingsRes, rateRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('salary_ngn, pension_enabled')
      .eq('status', 'active')
      .neq('role', 'driver')
      .gt('salary_ngn', 0),
    supabase.from('contractors').select('id, default_amount_ngn, pay_amount_usd_minor').eq('status', 'active'),
    supabase.from('company_settings').select('partner_pay_usd_minor').eq('id', COMPANY_SETTINGS_ID).maybeSingle(),
    supabase.rpc('get_current_rate', { p_base: 'USD', p_quote: 'NGN' }),
  ]);
  if (employeesRes.error) throw employeesRes.error;
  if (contractorsRes.error) throw contractorsRes.error;

  const globalUsdMinor = Number((settingsRes.data as any)?.partner_pay_usd_minor || 0);
  const ngnPerUsd = Number(rateRes.data || 0);

  const contractors: CostComparisonContractor[] = ((contractorsRes.data || []) as any[]).map((c) => {
    const usdMinor = c.pay_amount_usd_minor != null ? Number(c.pay_amount_usd_minor) : globalUsdMinor;
    const monthly_cost_ngn = usdMinor > 0 && ngnPerUsd > 0
      ? toMajor(usdMinorToNgnMinor(usdMinor, ngnPerUsd))
      : Number(c.default_amount_ngn || 0);
    return { id: c.id, monthly_cost_ngn };
  });

  return computeCostComparison((employeesRes.data || []) as CostComparisonEmployee[], contractors);
}

// ─── Compensation bands ─────────────────────────────────────────────────────

export interface CompBandEmployee {
  salary_ngn: number | null;
  department_id: string | null;
}

export interface CompensationBand {
  department_id: string | null;
  department_name: string;
  headcount: number;
  min_ngn: number;
  median_ngn: number;
  max_ngn: number;
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Min / median / max monthly salary per department. */
export function computeCompensationBands(
  employees: CompBandEmployee[],
  departments: { id: string; name: string }[],
): CompensationBand[] {
  const deptNameById = new Map(departments.map((d) => [d.id, d.name]));
  const salariesByDept = new Map<string, number[]>();

  for (const e of employees) {
    const salary = Number(e.salary_ngn || 0);
    if (salary <= 0) continue;
    const k = e.department_id ?? '__none__';
    if (!salariesByDept.has(k)) salariesByDept.set(k, []);
    salariesByDept.get(k)!.push(salary);
  }

  const bands: CompensationBand[] = [];
  for (const [key, salaries] of salariesByDept) {
    const sorted = [...salaries].sort((a, b) => a - b);
    const department_id = key === '__none__' ? null : key;
    bands.push({
      department_id,
      department_name: department_id ? (deptNameById.get(department_id) ?? 'Unknown department') : 'No department',
      headcount: sorted.length,
      min_ngn: sorted[0],
      median_ngn: median(sorted),
      max_ngn: sorted[sorted.length - 1],
    });
  }

  return bands.sort((a, b) => b.median_ngn - a.median_ngn);
}

export async function fetchCompensationBands(): Promise<CompensationBand[]> {
  const [employeesRes, departmentsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('salary_ngn, department_id')
      .eq('status', 'active')
      .neq('role', 'driver')
      .gt('salary_ngn', 0),
    supabase.from('departments').select('id, name'),
  ]);
  if (employeesRes.error) throw employeesRes.error;
  if (departmentsRes.error) throw departmentsRes.error;

  return computeCompensationBands(
    (employeesRes.data || []) as CompBandEmployee[],
    (departmentsRes.data || []) as { id: string; name: string }[],
  );
}
