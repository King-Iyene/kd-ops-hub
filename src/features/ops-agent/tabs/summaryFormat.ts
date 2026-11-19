// Helpers for the Summaries tab: labels for a period, grouping by month, and the remembered show/hide choice.
import type { AgentSummary, SummaryMetrics } from '../agentDb';
import type { SummaryKind } from '@/queries/useOpsAgentV4';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** A plain date such as "2026-11-19" has no zone: it is read as written (the database already made it Eastern). */
function parse(d: string): { y: number; m: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? '');
  return m ? { y: Number(m[1]), m: Number(m[2]) - 1, day: Number(m[3]) } : null;
}

const short = (d: string) => { const p = parse(d); return p ? `${MONTHS[p.m].slice(0, 3)} ${p.day}` : d; };

export const KIND_LABEL: Record<SummaryKind, string> = { day: 'Daily', week: 'Weekly', month: 'Monthly' };

/** "Thursday, Nov 19" for a day, "Nov 9 to Nov 15" for a week, "November 2026" for a month. */
export function periodLabel(kind: string, start: string, end: string): string {
  const s = parse(start);
  const e = parse(end);
  if (kind === 'day' && s) return `${DAYS[new Date(Date.UTC(s.y, s.m, s.day)).getUTCDay()]}, ${short(start)}`;
  if (kind === 'month' && e) return `${MONTHS[e.m]} ${e.y}`;
  return `${short(start)} to ${short(end)}`;
}

/** The month a summary belongs under: the month its period ends in. */
export function monthKey(s: Pick<AgentSummary, 'period_end'>): string {
  const e = parse(s.period_end);
  return e ? `${e.y}-${String(e.m + 1).padStart(2, '0')}` : 'unknown';
}

export function monthHeading(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : 'Other';
}

/** Newest period first, then newest made first. */
export function byNewest(a: AgentSummary, b: AgentSummary): number {
  return b.period_end.localeCompare(a.period_end) || b.created_at.localeCompare(a.created_at);
}

export function groupByMonth(rows: AgentSummary[]): { key: string; heading: string; rows: AgentSummary[] }[] {
  const groups = new Map<string, AgentSummary[]>();
  for (const r of [...rows].sort(byNewest)) {
    const k = monthKey(r);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.entries()].map(([key, list]) => ({ key, heading: monthHeading(key), rows: list }));
}

export type KindsShown = Record<SummaryKind, boolean>;
export const DEFAULT_KINDS: KindsShown = { day: true, week: false, month: false };
const STORAGE_KEY = 'kd-agent-summary-kinds';

/** Remembered per browser. Any failure (private window, blocked storage, bad value) falls back to Daily only. */
export function loadKinds(): KindsShown {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_KINDS;
    const v = JSON.parse(raw) as Partial<KindsShown>;
    return { day: v.day !== false, week: v.week === true, month: v.month === true };
  } catch { return DEFAULT_KINDS; }
}

export function saveKinds(k: KindsShown): void {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(k)); } catch { /* not remembered, still works */ }
}

/** The look-ahead in a daily summary: `tomorrow` since the 6:30 PM schedule, `today` on older rows. */
export function outlookOf(m: SummaryMetrics | null | undefined): { label: string; due: number; leave: number } | null {
  if (m?.tomorrow) return { label: 'Tomorrow', due: m.tomorrow.due_tomorrow ?? 0, leave: m.tomorrow.on_leave ?? 0 };
  if (m?.today) return { label: 'Today', due: m.today.due_today ?? 0, leave: m.today.on_leave ?? 0 };
  return null;
}
