import type { CrewAgent } from './crewDb';

export interface OrgNode { agent: CrewAgent; reports: OrgNode[] }

/**
 * Turns the flat list of agents into the reporting tree (the owner is above the roots). Agents whose manager is missing or inactive become roots,
 * a cycle can never hang the screen, and people at the same level are ordered department first, then name.
 */
export function buildOrgTree(agents: CrewAgent[]): OrgNode[] {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const children = new Map<string, CrewAgent[]>();
  const roots: CrewAgent[] = [];
  for (const a of agents) {
    if (a.reports_to && byId.has(a.reports_to) && a.reports_to !== a.id) children.set(a.reports_to, [...(children.get(a.reports_to) ?? []), a]);
    else roots.push(a);
  }
  const order = (xs: CrewAgent[]) => [...xs].sort((x, y) => x.department.localeCompare(y.department) || x.name.localeCompare(y.name));
  const seen = new Set<string>();
  const build = (a: CrewAgent): OrgNode => {
    seen.add(a.id);
    return { agent: a, reports: order(children.get(a.id) ?? []).filter((c) => !seen.has(c.id)).map(build) };
  };
  const tree = order(roots).map(build);
  // anything caught in a cycle (never reached from a root) is still shown, flat, rather than silently dropped
  for (const a of order(agents)) if (!seen.has(a.id)) tree.push(build(a));
  return tree;
}

export const STATUS_LABEL: Record<string, string> = {
  offline: 'Offline', idle: 'Idle', working: 'Working', thinking: 'Thinking', waiting_approval: 'Waiting for you', walking: 'Walking', meeting: 'In a meeting',
};

export function riskOrder(r: string): number { return r === 'high' ? 0 : r === 'medium' ? 1 : 2; }

/** What an approve button should say: record actions are applied on approval, the rest are a go-ahead. */
export function approveLabel(action: string): string {
  if (action.startsWith('record.')) return 'Approve and apply';
  if (action.startsWith('advice.')) return 'Accept';
  if (action.startsWith('agent.')) return 'Approve and carry out';
  return 'Approve (go ahead)';
}

export function describeAction(action: string): string {
  const map: Record<string, string> = {
    'record.create': 'Add a record', 'record.update': 'Change a record', 'record.soft_delete': 'Move a record to the trash',
    'draft.batch_payment': 'Draft a batch payment', 'draft.payroll_run': 'Draft a payroll run', 'draft.invoice': 'Prepare an invoice', 'draft.filing': 'Draft a tax filing',
    'external.github': 'GitHub change', 'external.vercel': 'Vercel change', 'external.supabase': 'Supabase change', 'external.other': 'Other outside change',
    'drive.create': 'Create a file in Google Drive', 'drive.update': 'Change a file in Google Drive', 'drive.trash': 'Move a Google Drive file to the trash',
    'advice.knowledge': 'Update the company brain',
    'agent.retire': 'Let a team member go', 'agent.hire': 'Hire a new team member',
  };
  return map[action] ?? (action.startsWith('advice.') ? `Advice: ${action.slice(7).replace(/_/g, ' ')}` : action);
}
