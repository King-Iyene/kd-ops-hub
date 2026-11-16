import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useLogsWithIntervals } from '../pages/activity/shared';

export interface TrackedHours {
  /** Hours on a started task timer (time_entries). */
  entryHours: number;
  /** Hours the desktop app captured while no task timer was running (TimeCamp's
   * "unassigned computer activities"). */
  unassignedHours: number;
  /** entryHours + unassignedHours: everything the person was tracked for. */
  total: number;
}

/**
 * One consistent "hours tracked" figure per person for a date range.
 *
 * The dashboard used to count only manual task timers, so a person whose desktop
 * app tracked several hours with no task selected showed 0.17h. TimeCamp counts
 * that time too (it appears as "unassigned computer activities"), so this adds
 * captured computer time that does NOT fall inside a task-timer entry.
 * Each capture counts for the real gap between captures, not a fixed interval.
 */
export function useTrackedHours(start: string, end: string): Map<string, TrackedHours> {
  const { data: logData } = useLogsWithIntervals(start, end);

  const { data: entries } = useQuery({
    queryKey: ['timetrack', 'entries-range', start, end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('employee_id, start_time, end_time')
        .gte('start_time', `${start}T00:00:00`)
        .lte('start_time', `${end}T23:59:59`);
      if (error) throw error;
      return (data ?? []) as { employee_id: string; start_time: string; end_time: string | null }[];
    },
    refetchInterval: 60_000,
  });

  return useMemo(() => {
    const result = new Map<string, TrackedHours>();
    const get = (id: string) => result.get(id) ?? { entryHours: 0, unassignedHours: 0, total: 0 };
    const now = Date.now();

    const intervalsByEmployee = new Map<string, { s: number; e: number }[]>();
    for (const en of entries ?? []) {
      const s = new Date(en.start_time).getTime();
      const e = en.end_time ? new Date(en.end_time).getTime() : now;
      const list = intervalsByEmployee.get(en.employee_id) ?? [];
      list.push({ s, e });
      intervalsByEmployee.set(en.employee_id, list);
      const row = get(en.employee_id);
      row.entryHours += Math.max(0, e - s) / 3_600_000;
      result.set(en.employee_id, row);
    }

    for (const l of logData?.logs ?? []) {
      if (l.productivity_category === 'idle') continue; // away time is not tracked work
      const t = new Date(l.captured_at).getTime();
      const covered = (intervalsByEmployee.get(l.employee_id) ?? []).some((iv) => t >= iv.s && t <= iv.e);
      if (covered) continue;
      const minutes = logData?.intervalByEmployee.get(l.employee_id) ?? 10;
      const row = get(l.employee_id);
      row.unassignedHours += minutes / 60;
      result.set(l.employee_id, row);
    }

    for (const row of result.values()) row.total = row.entryHours + row.unassignedHours;
    return result;
  }, [logData, entries]);
}
