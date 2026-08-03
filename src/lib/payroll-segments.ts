/**
 * Payroll segments — reusable, named filters that pick which employees are
 * included in a given payroll run.
 *
 * Filter evaluation happens entirely here in application code, not in SQL,
 * so the logic stays simple to read, test, and reason about. A segment with
 * an empty (or missing) filter_rules object matches everyone — the exact
 * behavior payroll had before segments existed.
 */

import { supabase } from '@/lib/supabase';

export interface PayrollSegmentFilterRules {
  include_employee_categories?: string[];
  exclude_employee_categories?: string[];
  include_department_ids?: string[];
  exclude_department_ids?: string[];
  include_employment_types?: string[];
  exclude_employment_types?: string[];
  include_pay_group_ids?: string[];
  exclude_pay_group_ids?: string[];
  exclude_employee_ids?: string[];
}

export interface PayrollSegment {
  id: string;
  name: string;
  description: string | null;
  filter_rules: PayrollSegmentFilterRules;
  is_active: boolean;
}

/** The subset of employee fields a segment filter can evaluate against. */
export interface SegmentableEmployee {
  id: string;
  employee_category?: string | null;
  department_id?: string | null;
  employment_type?: string | null;
  pay_group_id?: string | null;
}

/** True if an employee passes every configured dimension of a segment's rules. */
export function matchesSegment(
  employee: SegmentableEmployee,
  rules: PayrollSegmentFilterRules | null | undefined,
): boolean {
  if (!rules) return true;

  if (rules.exclude_employee_ids?.includes(employee.id)) return false;

  const category = employee.employee_category ?? null;
  if (rules.include_employee_categories?.length) {
    if (!category || !rules.include_employee_categories.includes(category)) return false;
  }
  if (category && rules.exclude_employee_categories?.includes(category)) return false;

  const dept = employee.department_id ?? null;
  if (rules.include_department_ids?.length) {
    if (!dept || !rules.include_department_ids.includes(dept)) return false;
  }
  if (dept && rules.exclude_department_ids?.includes(dept)) return false;

  const empType = employee.employment_type ?? null;
  if (rules.include_employment_types?.length) {
    if (!empType || !rules.include_employment_types.includes(empType)) return false;
  }
  if (empType && rules.exclude_employment_types?.includes(empType)) return false;

  const payGroup = employee.pay_group_id ?? null;
  if (rules.include_pay_group_ids?.length) {
    if (!payGroup || !rules.include_pay_group_ids.includes(payGroup)) return false;
  }
  if (payGroup && rules.exclude_pay_group_ids?.includes(payGroup)) return false;

  return true;
}

/** Filter a list of employees down to those matching a segment's rules. */
export function filterEmployeesForSegment<T extends SegmentableEmployee>(
  employees: T[],
  rules: PayrollSegmentFilterRules | null | undefined,
): T[] {
  if (!rules || Object.keys(rules).length === 0) return employees;
  return employees.filter((e) => matchesSegment(e, rules));
}

/** True if a filter has at least one dimension configured. */
export function isSegmentFilterEmpty(rules: PayrollSegmentFilterRules | null | undefined): boolean {
  if (!rules) return true;
  return Object.values(rules).every((v) => !v || (Array.isArray(v) && v.length === 0));
}

export async function fetchPayrollSegments(): Promise<PayrollSegment[]> {
  const { data, error } = await supabase
    .from('payroll_segments' as any)
    .select('id, name, description, filter_rules, is_active')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return (data || []) as unknown as PayrollSegment[];
}

/** Look up a single segment's filter rules by id. Returns null (= no filter) if not found. */
export async function fetchSegmentRules(
  segmentId: string | null | undefined,
): Promise<PayrollSegmentFilterRules | null> {
  if (!segmentId) return null;
  const { data, error } = await supabase
    .from('payroll_segments' as any)
    .select('filter_rules')
    .eq('id', segmentId)
    .maybeSingle();
  if (error) throw error;
  return (data as any)?.filter_rules ?? null;
}
