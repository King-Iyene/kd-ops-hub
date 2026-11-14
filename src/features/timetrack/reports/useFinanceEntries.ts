import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ReportFilters } from './useReportFilters';

export interface FinanceEntry {
  id: string;
  employee_id: string; employee_name: string;
  project_id: string; project_name: string;
  task_id: string; task_name: string;
  start_time: string; duration_minutes: number;
  revenue_rate_per_hour: number; cost_rate_per_hour: number;
  revenue: number; cost: number; margin: number;
  is_billable: boolean; invoiced: boolean; notes: string | null;
}

/** Entry-level revenue/cost/margin, rate-resolved server-side by
 * time_finance_entries_report. Shared by every Reports > Finance page;
 * each page applies the rest of the shared filter bar (people/projects/
 * invoiced/billable/notes) client-side since the RPC is date-scoped only. */
export function useFinanceEntries(filters: ReportFilters) {
  return useQuery({
    queryKey: ['timetrack', 'finance-entries', filters.start, filters.end],
    queryFn: async (): Promise<FinanceEntry[]> => {
      const { data, error } = await supabase.rpc('time_finance_entries_report', {
        p_start_date: filters.start, p_end_date: filters.end,
      });
      if (error) throw error;
      return data as FinanceEntry[];
    },
    select: (rows) => rows.filter((r) => {
      if (filters.employeeIds.length && !filters.employeeIds.includes(r.employee_id)) return false;
      if (filters.projectIds.length && !filters.projectIds.includes(r.project_id)) return false;
      if (filters.invoicedStatus !== 'all' && r.invoiced !== (filters.invoicedStatus === 'invoiced')) return false;
      if (filters.billableStatus !== 'all' && r.is_billable !== (filters.billableStatus === 'billable')) return false;
      if (filters.notes.trim() && !(r.notes ?? '').toLowerCase().includes(filters.notes.trim().toLowerCase())) return false;
      return true;
    }),
  });
}
