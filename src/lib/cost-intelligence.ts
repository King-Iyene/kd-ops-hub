/**
 * Cost Intelligence & Forecasting — Phase 3 of the CFO Finance Module.
 *
 * Three capabilities:
 *   1. Salary change audit trail — every raise/cut in `salary_increments`,
 *      annotated with its fully-loaded cost impact (including employer
 *      pension + NSITF, not just the raw salary delta).
 *   2. What-if headcount planner — pure scenario engine: hire N people,
 *      raise a department X%, or remove headcount, and see the CTC delta
 *      before it happens. Built on top of the same
 *      `computeDepartmentCostBreakdown` used by the CFO dashboard, so the
 *      numbers always agree with what's already on screen.
 *   3. Payroll budget vs actual — compares budget_items tagged as payroll
 *      against real payroll_runs totals for the same period.
 *
 * As with cfo-dashboard.ts: every non-trivial calculation is a pure,
 * independently-testable function. `fetch*` wrappers only do I/O.
 */

import { supabase } from '@/lib/supabase';
import { PENSION_EMPLOYER_RATE, NSITF_RATE } from '@/lib/tax';
import {
  computeDepartmentCostBreakdown,
  type CostableEmployee,
  type DepartmentCostRow,
} from '@/lib/cfo-dashboard';

// ─── Salary change audit trail ─────────────────────────────────────────────

export interface SalaryChangeRecord {
  id: string;
  employee_id: string;
  employee_name: string;
  department_id: string | null;
  department_name: string;
  old_salary_ngn: number;
  new_salary_ngn: number;
  effective_date: string;
  reason: string | null;
  approved_by_name: string | null;
}

export interface SalaryChangeImpact extends SalaryChangeRecord {
  monthly_delta_ngn: number;
  annual_delta_ngn: number;
  pct_change: number | null;
  /** Annual delta including employer pension (10%) + NSITF (1%) riding on top of the raise. */
  fully_loaded_annual_delta_ngn: number;
  direction: 'increase' | 'decrease' | 'unchanged';
}

/**
 * Computes the cost impact of one salary change. `pensionEnabled` /
 * `nsitfEnabled` default to true — the common case — since the audit trail
 * doesn't retain the employee's statutory flags as they stood at the time
 * of the change.
 */
export function computeSalaryChangeImpact(
  change: SalaryChangeRecord,
  opts: { pensionEnabled?: boolean; nsitfEnabled?: boolean } = {},
): SalaryChangeImpact {
  const old_salary_ngn = Number(change.old_salary_ngn || 0);
  const new_salary_ngn = Number(change.new_salary_ngn || 0);
  const monthly_delta_ngn = new_salary_ngn - old_salary_ngn;
  const annual_delta_ngn = monthly_delta_ngn * 12;
  const pct_change = old_salary_ngn > 0 ? (monthly_delta_ngn / old_salary_ngn) * 100 : null;

  const loadFactor =
    1 +
    (opts.pensionEnabled !== false ? PENSION_EMPLOYER_RATE : 0) +
    (opts.nsitfEnabled !== false ? NSITF_RATE : 0);

  return {
    ...change,
    monthly_delta_ngn,
    annual_delta_ngn,
    pct_change,
    fully_loaded_annual_delta_ngn: annual_delta_ngn * loadFactor,
    direction: monthly_delta_ngn > 0 ? 'increase' : monthly_delta_ngn < 0 ? 'decrease' : 'unchanged',
  };
}

export async function fetchSalaryChangeHistory(months = 12): Promise<SalaryChangeImpact[]> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('salary_increments')
    .select(
      'id, employee_id, old_salary_ngn, new_salary_ngn, effective_date, reason, ' +
        'employee:profiles!salary_increments_employee_id_fkey(full_name, department_id, pension_enabled, department:departments!profiles_department_id_fkey(name)), ' +
        'approver:profiles!salary_increments_approved_by_fkey(full_name)',
    )
    .gte('effective_date', cutoffStr)
    .order('effective_date', { ascending: false });
  if (error) throw error;

  return ((data || []) as any[]).map((row) => {
    const record: SalaryChangeRecord = {
      id: row.id,
      employee_id: row.employee_id,
      employee_name: row.employee?.full_name ?? 'Unknown',
      department_id: row.employee?.department_id ?? null,
      department_name: row.employee?.department?.name ?? 'No department',
      old_salary_ngn: Number(row.old_salary_ngn || 0),
      new_salary_ngn: Number(row.new_salary_ngn || 0),
      effective_date: row.effective_date,
      reason: row.reason ?? null,
      approved_by_name: row.approver?.full_name ?? null,
    };
    return computeSalaryChangeImpact(record, { pensionEnabled: row.employee?.pension_enabled !== false });
  });
}

// ─── What-if headcount planner ─────────────────────────────────────────────

export interface ScenarioAction {
  type: 'hire' | 'raise' | 'remove';
  /** Scope to one department. Omit to apply across all departments. */
  department_id?: string | null;
  /** hire: number of new employees. remove: number to remove (used only when employee_ids is omitted). */
  count?: number;
  /** hire: assumed monthly salary per new hire. */
  avg_salary_ngn?: number;
  /** raise: percentage increase, e.g. 10 for +10%. */
  pct_increase?: number;
  /** raise / remove: target specific employees instead of a department/count. */
  employee_ids?: string[];
  /** Free-text label for display, e.g. "Hire 3 engineers". */
  label?: string;
}

export interface ScenarioResult {
  baseline_headcount: number;
  scenario_headcount: number;
  baseline_ctc_ngn: number;
  scenario_ctc_ngn: number;
  delta_ctc_ngn: number;
  delta_pct: number | null;
  by_department: Array<{
    department_id: string | null;
    department_name: string;
    baseline_ctc_ngn: number;
    scenario_ctc_ngn: number;
    delta_ctc_ngn: number;
  }>;
}

let scenarioSyntheticId = 0;

/**
 * Applies a list of hypothetical hires/raises/removals to a copy of the
 * current employee roster and diffs the resulting fully-loaded cost against
 * baseline. Never mutates the input array. Both baseline and scenario use
 * `computeDepartmentCostBreakdown` — the exact same math the CFO dashboard
 * already shows, so a planner number and the live dashboard number never
 * diverge.
 */
export function computeHeadcountScenario(
  employees: CostableEmployee[],
  departments: { id: string; name: string }[],
  actions: ScenarioAction[],
  includeNsitf = true,
): ScenarioResult {
  const baseline = computeDepartmentCostBreakdown(employees, departments, includeNsitf);

  let scenarioEmployees = [...employees];
  for (const action of actions) {
    if (action.type === 'hire') {
      const count = Math.max(0, Math.trunc(action.count || 0));
      const salary = Math.max(0, action.avg_salary_ngn || 0);
      for (let i = 0; i < count; i++) {
        scenarioEmployees.push({
          id: `__scenario_hire_${scenarioSyntheticId++}__`,
          salary_ngn: salary,
          department_id: action.department_id ?? null,
          pension_enabled: true,
          use_salary_components: false,
          basic_ngn: null,
          housing_ngn: null,
          transport_ngn: null,
        });
      }
    } else if (action.type === 'raise') {
      const factor = 1 + (action.pct_increase || 0) / 100;
      const targetIds = new Set(action.employee_ids || []);
      scenarioEmployees = scenarioEmployees.map((e) => {
        const matches = targetIds.size > 0
          ? targetIds.has(e.id)
          : action.department_id
            ? e.department_id === action.department_id
            : true;
        if (!matches) return e;
        return { ...e, salary_ngn: Number(e.salary_ngn || 0) * factor };
      });
    } else if (action.type === 'remove') {
      if (action.employee_ids && action.employee_ids.length > 0) {
        const targetIds = new Set(action.employee_ids);
        scenarioEmployees = scenarioEmployees.filter((e) => !targetIds.has(e.id));
      } else {
        const count = Math.max(0, Math.trunc(action.count || 0));
        let removed = 0;
        scenarioEmployees = scenarioEmployees.filter((e) => {
          if (removed >= count) return true;
          const matches = action.department_id ? e.department_id === action.department_id : true;
          if (matches) {
            removed += 1;
            return false;
          }
          return true;
        });
      }
    }
  }

  const scenario = computeDepartmentCostBreakdown(scenarioEmployees, departments, includeNsitf);

  const baselineById = new Map(baseline.map((r) => [r.department_id ?? '__none__', r]));
  const scenarioById = new Map(scenario.map((r) => [r.department_id ?? '__none__', r]));
  const allKeys = new Set([...baselineById.keys(), ...scenarioById.keys()]);

  const byDepartment = Array.from(allKeys).map((k) => {
    const b = baselineById.get(k);
    const s = scenarioById.get(k);
    const baseline_ctc_ngn = b?.total_ctc_ngn ?? 0;
    const scenario_ctc_ngn = s?.total_ctc_ngn ?? 0;
    return {
      department_id: b?.department_id ?? s?.department_id ?? null,
      department_name: b?.department_name ?? s?.department_name ?? 'Unknown department',
      baseline_ctc_ngn,
      scenario_ctc_ngn,
      delta_ctc_ngn: scenario_ctc_ngn - baseline_ctc_ngn,
    };
  }).sort((a, b) => b.scenario_ctc_ngn - a.scenario_ctc_ngn);

  const baseline_ctc_ngn = baseline.reduce((sum, r) => sum + r.total_ctc_ngn, 0);
  const scenario_ctc_ngn = scenario.reduce((sum, r) => sum + r.total_ctc_ngn, 0);
  const baseline_headcount = baseline.reduce((sum, r) => sum + r.headcount, 0);
  const scenario_headcount = scenario.reduce((sum, r) => sum + r.headcount, 0);

  return {
    baseline_headcount,
    scenario_headcount,
    baseline_ctc_ngn,
    scenario_ctc_ngn,
    delta_ctc_ngn: scenario_ctc_ngn - baseline_ctc_ngn,
    delta_pct: baseline_ctc_ngn > 0 ? ((scenario_ctc_ngn - baseline_ctc_ngn) / baseline_ctc_ngn) * 100 : null,
    by_department: byDepartment,
  };
}

export async function fetchScenarioBaseline(): Promise<{
  employees: CostableEmployee[];
  departments: { id: string; name: string }[];
  includeNsitf: boolean;
}> {
  const COMPANY_SETTINGS_ID = '00000000-0000-0000-0000-000000000001';
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

  return {
    employees: (employeesRes.data || []) as CostableEmployee[],
    departments: (departmentsRes.data || []) as { id: string; name: string }[],
    includeNsitf: (settingsRes.data as any)?.nsitf_enabled !== false,
  };
}

// ─── Payroll budget vs actual ──────────────────────────────────────────────

export interface PayrollBudgetRow {
  budget_id: string;
  name: string;
  period_start: string;
  period_end: string;
  planned_ngn: number;
  actual_ngn: number;
  utilization_pct: number | null;
}

const PAYROLL_CATEGORY_PATTERN = /payroll|salary|salaries|wage/i;

/**
 * Compares budget_items tagged as payroll-related (name matches
 * /payroll|salary|salaries|wage/i) against actual payroll_runs totals whose
 * period falls inside the budget window. Budgets with no payroll-tagged
 * line item are excluded — they have nothing to compare against.
 */
export function computePayrollBudgetVsActual(
  budgets: Array<{ id: string; name: string; period_start: string; period_end: string }>,
  budgetItems: Array<{ budget_id: string; category: string; allocated_ngn: number }>,
  payrollRuns: Array<{ period: string; total_burn_ngn: number }>,
): PayrollBudgetRow[] {
  const plannedByBudget = new Map<string, number>();
  for (const item of budgetItems) {
    if (!PAYROLL_CATEGORY_PATTERN.test(item.category)) continue;
    plannedByBudget.set(item.budget_id, (plannedByBudget.get(item.budget_id) ?? 0) + Number(item.allocated_ngn || 0));
  }

  const rows: PayrollBudgetRow[] = [];
  for (const budget of budgets) {
    const planned = plannedByBudget.get(budget.id);
    if (planned === undefined) continue;

    const start = new Date(budget.period_start).getTime();
    const end = new Date(budget.period_end).getTime() + 24 * 60 * 60 * 1000 - 1;
    let actual = 0;
    for (const run of payrollRuns) {
      const runDate = new Date(`${run.period}-01`).getTime();
      if (runDate >= start && runDate <= end) actual += Number(run.total_burn_ngn || 0);
    }

    rows.push({
      budget_id: budget.id,
      name: budget.name,
      period_start: budget.period_start,
      period_end: budget.period_end,
      planned_ngn: planned,
      actual_ngn: actual,
      utilization_pct: planned > 0 ? (actual / planned) * 100 : null,
    });
  }
  return rows.sort((a, b) => b.period_start.localeCompare(a.period_start));
}

export async function fetchPayrollBudgetVsActual(months = 12): Promise<PayrollBudgetRow[]> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const [budgetsRes, runsRes] = await Promise.all([
    supabase
      .from('budgets')
      .select('id, name, period_start, period_end')
      .is('deleted_at', null)
      .gte('period_end', cutoffStr)
      .order('period_start', { ascending: false }),
    supabase.from('payroll_runs').select('period, total_burn_ngn').in('status', ['approved', 'paid']),
  ]);
  if (budgetsRes.error) throw budgetsRes.error;
  if (runsRes.error) throw runsRes.error;

  const budgets = (budgetsRes.data || []) as Array<{ id: string; name: string; period_start: string; period_end: string }>;
  if (budgets.length === 0) return [];

  const { data: itemsData, error: itemsError } = await supabase
    .from('budget_items')
    .select('budget_id, category, allocated_ngn')
    .in('budget_id', budgets.map((b) => b.id));
  if (itemsError) throw itemsError;

  return computePayrollBudgetVsActual(
    budgets,
    (itemsData || []) as Array<{ budget_id: string; category: string; allocated_ngn: number }>,
    (runsRes.data || []) as Array<{ period: string; total_burn_ngn: number }>,
  );
}

export type { DepartmentCostRow };
