/**
 * CFO Action Center — the "what needs a decision today" feed.
 *
 * FinanceDashboard has 12 independent tabs, each a deep lens on one thing.
 * None of them answer the first question a CFO actually asks each morning:
 * what, out of everything in this module, needs MY decision right now?
 * This module answers that by pulling the handful of genuinely actionable
 * signals — pending approvals, near-term cash risk, overdue statutory
 * filings, open payment anomalies — into one ranked feed.
 *
 * Severity assignment and ranking is a pure function (buildActionSummary),
 * independently testable. The fetch wrapper only does I/O and composes
 * already-existing, already-tested modules (cfo-dashboard.ts, cash-timing.ts,
 * financial-health.ts, anomalies.ts) — this module invents no new money math.
 */

import { supabase } from '@/lib/supabase';
import {
  fetchFinancialPulse,
  fetchOverdueCompliance,
  type FinancialPulse,
  type ComplianceAlert,
} from '@/lib/cfo-dashboard';
import { fetchCashTimingBoard, type PaymentTimingWeek } from '@/lib/cash-timing';
import { computeHealthScore, fetchHealthScoreInput, type HealthScoreResult } from '@/lib/financial-health';
import { countOpenAnomalies } from '@/lib/anomalies';

export type ApprovalKind = 'payroll_run' | 'budget' | 'payment_batch';

export interface PendingApproval {
  id: string;
  kind: ApprovalKind;
  label: string;
  amount_ngn: number;
  created_at: string;
  created_by: string | null;
  href: string;
}

export type ActionSeverity = 'critical' | 'warning' | 'info';

export interface ActionItem {
  id: string;
  severity: ActionSeverity;
  title: string;
  detail: string;
  amount_ngn?: number;
  href: string;
}

export interface ActionCenterData {
  pendingApprovals: PendingApproval[];
  cashRiskWeeks: PaymentTimingWeek[];
  overdueCompliance: ComplianceAlert[];
  openAnomalies: { total: number; critical: number; high: number };
  health: HealthScoreResult;
  pulse: FinancialPulse;
  items: ActionItem[];
}

/** Every pending-approval record across the three approval-gated tables, unified. */
export async function fetchPendingApprovals(): Promise<PendingApproval[]> {
  const [runsRes, budgetsRes, batchesRes] = await Promise.all([
    supabase
      .from('payroll_runs')
      .select('id, period, total_burn_ngn, created_at, created_by')
      .eq('status', 'pending_approval'),
    supabase
      .from('budgets')
      .select('id, name, total_amount_ngn, created_at, created_by')
      .eq('status', 'pending_approval'),
    supabase
      .from('payment_batches')
      .select('id, batch_type, total_amount, created_at, created_by')
      .eq('status', 'pending_approval')
      .is('deleted_at', null),
  ]);

  const runs: PendingApproval[] = (runsRes.data || []).map((r: any) => ({
    id: r.id,
    kind: 'payroll_run',
    label: `Payroll run — ${r.period}`,
    amount_ngn: r.total_burn_ngn ?? 0,
    created_at: r.created_at,
    created_by: r.created_by,
    href: '/payroll',
  }));
  const budgets: PendingApproval[] = (budgetsRes.data || []).map((b: any) => ({
    id: b.id,
    kind: 'budget',
    label: `Budget — ${b.name}`,
    amount_ngn: b.total_amount_ngn ?? 0,
    created_at: b.created_at,
    created_by: b.created_by,
    href: '/budgets',
  }));
  const batches: PendingApproval[] = (batchesRes.data || []).map((b: any) => ({
    id: b.id,
    kind: 'payment_batch',
    label: `${b.batch_type === 'contractor' ? 'Contractor' : 'Payment'} batch`,
    amount_ngn: b.total_amount ?? 0,
    created_at: b.created_at,
    created_by: b.created_by,
    href: `/payments/${b.id}`,
  }));

  return [...runs, ...budgets, ...batches].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

const SEVERITY_RANK: Record<ActionSeverity, number> = { critical: 0, warning: 1, info: 2 };

/**
 * Turns the raw signals into one ranked list. Pure — no I/O, no Date.now(),
 * fully deterministic from its inputs, so this is what's unit tested.
 */
export function buildActionSummary(
  pendingApprovals: PendingApproval[],
  cashRiskWeeks: PaymentTimingWeek[],
  overdueCompliance: ComplianceAlert[],
  openAnomalies: { total: number; critical: number; high: number },
): ActionItem[] {
  const items: ActionItem[] = [];

  for (const a of pendingApprovals) {
    items.push({
      id: `approval-${a.kind}-${a.id}`,
      severity: 'warning',
      title: `${a.label} awaiting approval`,
      detail: 'Pending your decision',
      amount_ngn: a.amount_ngn,
      href: a.href,
    });
  }

  for (const w of cashRiskWeeks) {
    if (w.risk === 'safe') continue;
    items.push({
      id: `cash-${w.week_start}`,
      severity: w.risk === 'critical' ? 'critical' : 'warning',
      title: w.risk === 'critical'
        ? `Cash goes negative — week of ${w.week_start}`
        : `Cash runs tight — week of ${w.week_start}`,
      detail: w.advice,
      amount_ngn: w.projected_balance_ngn,
      href: '/finance?tab=cash-timing',
    });
  }

  for (const c of overdueCompliance) {
    items.push({
      id: `compliance-${c.id}`,
      severity: 'critical',
      title: `${c.kind.toUpperCase()} filing overdue — ${c.period}`,
      detail: `Was due ${c.due_date}`,
      amount_ngn: c.amount_ngn ?? undefined,
      href: '/compliance',
    });
  }

  if (openAnomalies.critical > 0) {
    items.push({
      id: 'anomalies-critical',
      severity: 'critical',
      title: `${openAnomalies.critical} critical payment ${openAnomalies.critical === 1 ? 'anomaly' : 'anomalies'} unreviewed`,
      detail: 'Flagged by automatic fraud/error detection',
      href: '/anomalies',
    });
  } else if (openAnomalies.high > 0) {
    items.push({
      id: 'anomalies-high',
      severity: 'warning',
      title: `${openAnomalies.high} high-severity payment ${openAnomalies.high === 1 ? 'anomaly' : 'anomalies'} unreviewed`,
      detail: 'Flagged by automatic fraud/error detection',
      href: '/anomalies',
    });
  }

  return items.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

/** Everything the Action Center tab needs, in one call. */
export async function fetchActionCenterData(): Promise<ActionCenterData> {
  const [pendingApprovals, cashBoard, overdueCompliance, openAnomalies, healthInput, pulse] = await Promise.all([
    fetchPendingApprovals(),
    fetchCashTimingBoard(4),
    fetchOverdueCompliance(),
    countOpenAnomalies(),
    fetchHealthScoreInput(),
    fetchFinancialPulse(),
  ]);

  const health = computeHealthScore(healthInput);
  const cashRiskWeeks = cashBoard.timing;
  const items = buildActionSummary(pendingApprovals, cashRiskWeeks, overdueCompliance, openAnomalies);

  return { pendingApprovals, cashRiskWeeks, overdueCompliance, openAnomalies, health, pulse, items };
}
