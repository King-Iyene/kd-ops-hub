import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useActiveEmployees } from '@/queries/useEmployees';
import { fetchAllProjects, fetchAllTags } from '../lib/queries';
import type { ReportFilters } from './useReportFilters';

export interface ReportEntry {
  id: string;
  employee_id: string;
  employee_name: string;
  project_id: string;
  project_name: string;
  project_is_archived: boolean;
  task_id: string;
  task_name: string;
  start_time: string;
  end_time: string | null;
  duration_minutes: number;
  is_billable: boolean;
  invoiced: boolean;
  notes: string | null;
  tag_ids: string[];
  tag_names: string[];
}

/** Lookups used to populate the filter dropdowns (People / Projects / Tags). */
export function useReportLookups() {
  const employees = useActiveEmployees();
  const projects = useQuery({ queryKey: ['timetrack', 'all-projects'], queryFn: fetchAllProjects, staleTime: 60_000 });
  const tags = useQuery({ queryKey: ['timetrack', 'all-tags'], queryFn: fetchAllTags, staleTime: 60_000 });
  return { employees, projects, tags };
}

/** Every time entry matching the shared filter bar, joined to employee name,
 * project/task name, and tags. Shared by every report page so each one
 * only has to decide how to group/aggregate, not how to fetch. */
export function useReportEntries(filters: ReportFilters) {
  return useQuery({
    queryKey: ['timetrack', 'report-entries', filters],
    queryFn: async (): Promise<ReportEntry[]> => {
      let query = supabase
        .from('time_entries')
        .select(
          `id, employee_id, project_id, task_id, start_time, end_time, duration_minutes,
           is_billable, invoiced, notes,
           time_tasks!inner(id, name, time_projects!inner(id, name, is_archived)),
           time_entry_tags(tag_id, time_tags(id, name))`,
        )
        .gte('start_time', `${filters.start}T00:00:00`)
        .lt('start_time', `${filters.end}T23:59:59`)
        .not('end_time', 'is', null)
        .order('start_time', { ascending: false });

      if (filters.employeeIds.length) query = query.in('employee_id', filters.employeeIds);
      if (filters.projectIds.length) query = query.in('project_id', filters.projectIds);
      if (filters.invoicedStatus !== 'all') query = query.eq('invoiced', filters.invoicedStatus === 'invoiced');
      if (filters.billableStatus !== 'all') query = query.eq('is_billable', filters.billableStatus === 'billable');
      if (filters.notes.trim()) query = query.ilike('notes', `%${filters.notes.trim()}%`);
      if (filters.activeArchived !== 'all') {
        query = query.eq('time_tasks.time_projects.is_archived', filters.activeArchived === 'archived');
      }

      const { data, error } = await query;
      if (error) throw error;

      const { data: employeesRaw } = await supabase.from('profiles_directory').select('id, full_name');
      const nameMap = new Map((employeesRaw ?? []).map((e) => [e.id, e.full_name ?? e.id]));

      let rows: ReportEntry[] = (data ?? []).map((e) => {
        const task = e.time_tasks as unknown as { id: string; name: string; time_projects: { id: string; name: string; is_archived: boolean } | null } | null;
        const entryTags = (e.time_entry_tags ?? []) as unknown as { tag_id: string; time_tags: { id: string; name: string } | null }[];
        return {
          id: e.id,
          employee_id: e.employee_id,
          employee_name: nameMap.get(e.employee_id) ?? e.employee_id,
          project_id: e.project_id,
          project_name: task?.time_projects?.name ?? '—',
          project_is_archived: task?.time_projects?.is_archived ?? false,
          task_id: e.task_id,
          task_name: task?.name ?? '—',
          start_time: e.start_time,
          end_time: e.end_time,
          duration_minutes: e.duration_minutes ?? 0,
          is_billable: e.is_billable,
          invoiced: e.invoiced,
          notes: e.notes,
          tag_ids: entryTags.map((t) => t.tag_id),
          tag_names: entryTags.map((t) => t.time_tags?.name).filter((n): n is string => Boolean(n)),
        };
      });

      if (filters.tagIds.length) {
        rows = rows.filter((r) => r.tag_ids.some((id) => filters.tagIds.includes(id)));
      }
      return rows;
    },
  });
}

export function hoursOf(entry: Pick<ReportEntry, 'duration_minutes'>) {
  return (entry.duration_minutes ?? 0) / 60;
}

export function formatHours(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}
