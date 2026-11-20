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
  /** Who is expected to track today: the team minus placement, leave, non-work days and anyone exempt from time tracking. Missing on an older database. */
  tracking_expected?: number;
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
  /** Can the sender that pushes messages to connections run? Missing on an older database. */
  dispatch_ready?: boolean;
}

export type SiteCategory = 'unproductive' | 'unknown' | 'approved';
export interface SiteVisit { domain: string; seconds: number; category: SiteCategory }

export type FlagEvidence = Record<string, unknown> & {
  tracked_minutes_today?: number; last_tracked_at?: string | null; window?: string;
  running_hours?: number; started_at?: string | null;
  /** ES01 and ES02 point at the item they chase. */
  flag_id?: string; rule?: string; open_for?: string; handled_for?: string; original_severity?: string;
  sites?: SiteVisit[]; total_seconds?: number;
  task_title?: string; by_name?: string; to?: string; from?: string; due_date?: string; days_overdue?: number; assignee_name?: string;
  day?: string; deadline?: string;
};

/** A flag row as the screens read it: the usual fields plus the evidence the rule attached. */
export type LiveFlag = AgentFlag & { evidence?: FlagEvidence | null };

export type FlagCategory = 'not_tracking' | 'sites' | 'reports' | 'tasks' | 'money' | 'people_hr' | 'escalations' | 'system' | 'other';

export const CATEGORIES: { key: FlagCategory; label: string }[] = [
  { key: 'not_tracking', label: 'Not tracking' },
  { key: 'sites', label: 'Sites' },
  { key: 'reports', label: 'Reports' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'money', label: 'Money' },
  { key: 'people_hr', label: 'People & HR' },
  { key: 'escalations', label: 'Escalations' },
  { key: 'system', label: 'System' },
  { key: 'other', label: 'Other' },
];

/** Rules about the sensitive modules (payroll, banking, loans, disciplinary, performance, HR letters, contractors). They only count things. */
const MONEY_PREFIXES = ['PY', 'BK', 'LN'];
const PEOPLE_PREFIXES = ['DC', 'PF', 'HL', 'CT'];
export const isSensitiveRule = (ruleCode: string | null | undefined) => {
  const p = (ruleCode ?? '').toUpperCase().slice(0, 2);
  return /^[A-Z]{2}[0-9]{2}$/.test((ruleCode ?? '').toUpperCase()) && (MONEY_PREFIXES.includes(p) || PEOPLE_PREFIXES.includes(p));
};

/** ES01 (Not attended to) and ES02 (Still happening) chase another item. */
export const isEscalationRule = (ruleCode: string | null | undefined) => ['ES01', 'ES02'].includes((ruleCode ?? '').toUpperCase());

/** Items about the system rather than a person: sensitive-module counts, escalations and the agent's own health checks. No person block, no drafted message. */
export const isSystemLevel = (ruleCode: string | null | undefined) =>
  isSensitiveRule(ruleCode) || isEscalationRule(ruleCode) || /^SY[0-9]{2}$/.test((ruleCode ?? '').toUpperCase());

/** TR01 to TR03 are about time not being tracked, TR05 about sites, RP about reports, TK about tasks, PY/BK/LN money, DC/PF/HL/CT people and HR. */
export function categoryOf(ruleCode: string | null | undefined): FlagCategory {
  const c = (ruleCode ?? '').toUpperCase();
  if (c === 'TR01' || c === 'TR02' || c === 'TR03') return 'not_tracking';
  if (c === 'TR05') return 'sites';
  if (c.startsWith('RP')) return 'reports';
  if (c.startsWith('TK')) return 'tasks';
  if (c === 'ES01' || c === 'ES02') return 'escalations';
  if (c === 'SY01' || c === 'SY02' || c === 'SY04') return 'system';
  if (isSensitiveRule(c)) return MONEY_PREFIXES.includes(c.slice(0, 2)) ? 'money' : 'people_hr';
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
