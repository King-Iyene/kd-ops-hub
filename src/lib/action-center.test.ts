import { describe, it, expect } from 'vitest';
import { buildActionSummary, type PendingApproval } from './action-center';
import type { PaymentTimingWeek } from './cash-timing';
import type { ComplianceAlert } from './cfo-dashboard';

const approval: PendingApproval = {
  id: 'run-1',
  kind: 'payroll_run',
  label: 'Payroll run — 2026-08',
  amount_ngn: 5_000_000,
  created_at: '2026-08-01T00:00:00Z',
  created_by: 'user-1',
  href: '/payroll',
};

const safeWeek: PaymentTimingWeek = {
  week_start: '2026-08-03',
  projected_balance_ngn: 4_000_000,
  runway_weeks_remaining: 20,
  risk: 'safe',
  advice: 'Healthy buffer.',
};

const tightWeek: PaymentTimingWeek = {
  ...safeWeek,
  week_start: '2026-08-10',
  risk: 'tight',
  advice: 'Runway drops below threshold.',
};

const criticalWeek: PaymentTimingWeek = {
  ...safeWeek,
  week_start: '2026-08-17',
  projected_balance_ngn: -500_000,
  risk: 'critical',
  advice: 'Balance goes negative.',
};

const overdueFiling: ComplianceAlert = {
  id: 'filing-1',
  kind: 'paye',
  period: '2026-07',
  due_date: '2026-07-31',
  amount_ngn: 1_200_000,
  status: 'pending',
};

describe('buildActionSummary', () => {
  it('returns an empty list when everything is clean', () => {
    expect(buildActionSummary([], [safeWeek], [], { total: 0, critical: 0, high: 0 })).toEqual([]);
  });

  it('surfaces a pending approval as a warning', () => {
    const items = buildActionSummary([approval], [], [], { total: 0, critical: 0, high: 0 });
    expect(items).toHaveLength(1);
    expect(items[0].severity).toBe('warning');
    expect(items[0].amount_ngn).toBe(5_000_000);
  });

  it('ignores safe weeks and surfaces tight/critical weeks with matching severity', () => {
    const items = buildActionSummary([], [safeWeek, tightWeek, criticalWeek], [], { total: 0, critical: 0, high: 0 });
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.id.includes('2026-08-10'))?.severity).toBe('warning');
    expect(items.find((i) => i.id.includes('2026-08-17'))?.severity).toBe('critical');
  });

  it('treats overdue compliance as critical', () => {
    const items = buildActionSummary([], [], [overdueFiling], { total: 0, critical: 0, high: 0 });
    expect(items).toHaveLength(1);
    expect(items[0].severity).toBe('critical');
    expect(items[0].title).toContain('PAYE');
  });

  it('surfaces critical anomalies over high, and only the highest tier present', () => {
    const criticalItems = buildActionSummary([], [], [], { total: 3, critical: 2, high: 1 });
    expect(criticalItems).toHaveLength(1);
    expect(criticalItems[0].severity).toBe('critical');
    expect(criticalItems[0].title).toContain('2 critical');

    const highOnlyItems = buildActionSummary([], [], [], { total: 1, critical: 0, high: 1 });
    expect(highOnlyItems).toHaveLength(1);
    expect(highOnlyItems[0].severity).toBe('warning');
  });

  it('ranks critical items before warning items regardless of input order', () => {
    const items = buildActionSummary([approval], [criticalWeek], [], { total: 0, critical: 0, high: 0 });
    expect(items.map((i) => i.severity)).toEqual(['critical', 'warning']);
  });

  it('combines every signal into one ranked feed', () => {
    const items = buildActionSummary(
      [approval],
      [tightWeek, criticalWeek],
      [overdueFiling],
      { total: 2, critical: 1, high: 1 },
    );
    expect(items).toHaveLength(5);
    // critical items (cash-critical, compliance, anomalies-critical) all sort ahead of the warnings.
    const criticalCount = items.filter((i) => i.severity === 'critical').length;
    expect(items.slice(0, criticalCount).every((i) => i.severity === 'critical')).toBe(true);
  });
});
