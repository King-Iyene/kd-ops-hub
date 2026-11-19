// Shapes for the live monitoring screens: the team pulse, flag evidence and the filter categories.
import type { AgentFlag } from './agentDb';

/** What the database function `agent_team_pulse()` returns. */
export interface TeamPulse {
  as_of: string;
  tz: string;
  day: string;
  working_day: boolean;
  in_work_window: boolean;
  team_size: number;
  tracking_now: number;
  tracked_today: number;
  reports_in: number;
  reports_expected: number;
  reports_due_at: string;
  overdue_tasks: number;
  open_flags: number;
  high_flags: number;
  last_run_at: string | null;
  last_run_ok: boolean;
  rules_active: number;
}

export type SiteCategory = 'unproductive' | 'unknown' | 'approved';
export interface SiteVisit { domain: string; seconds: number; category: SiteCategory }

export type FlagEvidence = Record<string, unknown> & {
  tracked_minutes_today?: number; last_tracked_at?: string | null; window?: string;
  running_hours?: number; started_at?: string | null;
  sites?: SiteVisit[]; total_seconds?: number;
  task_title?: string; by_name?: string; to?: string; from?: string; due_date?: string; days_overdue?: number; assignee_name?: string;
  day?: string; deadline?: string;
};

/** A flag row as the screens read it: the usual fields plus the evidence the rule attached. */
export type LiveFlag = AgentFlag & { evidence?: FlagEvidence | null };

export type FlagCategory = 'not_tracking' | 'sites' | 'reports' | 'tasks' | 'other';

export const CATEGORIES: { key: FlagCategory; label: string }[] = [
  { key: 'not_tracking', label: 'Not tracking' },
  { key: 'sites', label: 'Sites' },
  { key: 'reports', label: 'Reports' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'other', label: 'Other' },
];

/** TR01 and TR02 are about time not being tracked, TR05 about sites, RP about reports, TK about tasks. */
export function categoryOf(ruleCode: string | null | undefined): FlagCategory {
  const c = (ruleCode ?? '').toUpperCase();
  if (c === 'TR01' || c === 'TR02') return 'not_tracking';
  if (c === 'TR05') return 'sites';
  if (c.startsWith('RP')) return 'reports';
  if (c.startsWith('TK')) return 'tasks';
  return 'other';
}

/** Items that are good news or "please review", not a problem. They get a calm look. */
export const CALM_RULES = new Set(['TK13', 'TK14']);
export const isCalm = (f: Pick<AgentFlag, 'rule_code' | 'severity'>) =>
  CALM_RULES.has((f.rule_code ?? '').toUpperCase()) && (f.severity === 'low' || f.severity === 'info');

/** A site is only ever shown by its domain. Anything that looks like an address is cut down to the host. */
export function cleanDomain(raw: string): string {
  const s = (raw ?? '').trim().toLowerCase();
  const host = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#:]/)[0];
  return host.replace(/^www\./, '');
}

/** "12m", "1h 5m", "40s": time spent on a site. */
export function spent(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 === 0 ? `${h}h` : `${h}h ${m % 60}m`;
}
