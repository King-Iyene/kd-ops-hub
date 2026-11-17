import { useMemo } from 'react';
import { useActiveEmployees as useAllActiveEmployees } from '@/queries/useEmployees';
import { useCompany } from './company';

/**
 * Drop-in replacement for useActiveEmployees inside the Time Tracking module: same shape,
 * but narrowed to the company chosen in the page header (saved until changed back).
 */
export function useActiveEmployees() {
  const q = useAllActiveEmployees();
  const [company] = useCompany();
  const data = useMemo(
    () => (company === 'all' ? q.data : (q.data ?? []).filter((e) => (company === 'none' ? !e.department_id : e.department_id === company))),
    [q.data, company],
  );
  return { ...q, data };
}

/** Ids of the people in the chosen company, or null when no company filter is on. */
export function useCompanyEmployeeIds(): Set<string> | null {
  const q = useAllActiveEmployees();
  const [company] = useCompany();
  return useMemo(
    () => (company === 'all' ? null : new Set((q.data ?? []).filter((e) => (company === 'none' ? !e.department_id : e.department_id === company)).map((e) => e.id))),
    [q.data, company],
  );
}
