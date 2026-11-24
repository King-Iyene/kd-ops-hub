// Daily report to Cliq: looks up how many hours a person tracked on a day and how productive they were (see tm-day-activity-core.ts),
// and gives back the line "Hours Worked: X Hours; Productive: X%; Unproductive: X%". It only reads; a failure gives null, so a
// problem here can never stop a report from being sent.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { activityLine, dayActivity, dayInZone, zonedDayEnd, zonedDayStart, type DayEntry, type DayLog, type DayRule } from './tm-day-activity-core.ts';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The day a report is about: the table's report-date field when the entry has one, otherwise the day it was sent (in the office time zone). */
export function reportDay(dateValue: unknown, createdAt: string, tz: string): string {
  const v = typeof dateValue === 'string' ? dateValue.slice(0, 10) : '';
  return DAY_RE.test(v) ? v : dayInZone(createdAt, tz);
}

export async function reportActivityLine(db: SupabaseClient, personId: string, day: string, tz: string): Promise<string | null> {
  try {
    const from = new Date(zonedDayStart(day, tz)).toISOString();
    const to = new Date(zonedDayEnd(day, tz)).toISOString();
    const [entries, logs, rules, cfg] = await Promise.all([
      db.from('time_entries').select('start_time, end_time').eq('employee_id', personId).gte('start_time', from).lt('start_time', to).limit(2000),
      db.from('time_activity_logs').select('captured_at, app_name, window_title, url, productivity_category').eq('employee_id', personId).gte('captured_at', from).lt('captured_at', to).order('captured_at', { ascending: true }).limit(5000),
      db.from('time_productivity_rules').select('app_name_contains, title_contains, category, priority'),
      db.from('time_agent_settings').select('capture_interval_minutes').eq('employee_id', personId).maybeSingle(),
    ]);
    if (entries.error || logs.error) return null;
    return activityLine(dayActivity({
      entries: (entries.data ?? []) as DayEntry[],
      logs: (logs.data ?? []) as DayLog[],
      rules: (rules.data ?? []) as DayRule[],
      configuredMinutes: (cfg.data as { capture_interval_minutes?: number } | null)?.capture_interval_minutes ?? null,
    }));
  } catch (e) {
    console.error('report activity line failed', e instanceof Error ? e.message : e);
    return null;
  }
}
