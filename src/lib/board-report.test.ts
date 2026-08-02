import { describe, it, expect } from 'vitest';
import { computeBoardHighlights, type BoardHighlightInput } from './board-report';
import type { FinancialPulse, PayrollTrendPoint, ComplianceAlert } from './cfo-dashboard';

function pulse(overrides: Partial<FinancialPulse> = {}): FinancialPulse {
  return {
    cash_on_hand_ngn: 10_000_000,
    cash_updated_at: '2026-08-01T00:00:00Z',
    cash_is_stale: false,
    net_monthly_burn_ngn: 2_000_000,
    runway_weeks: 20,
    runway_band: 'healthy',
    total_headcount: 10,
    monthly_revenue_estimate_ngn: 5_000_000,
    revenue_per_employee_ngn: 500_000,
    latest_payroll_burn_ngn: 2_000_000,
    payroll_pct_of_revenue: 40,
    ...overrides,
  };
}

function input(overrides: Partial<BoardHighlightInput> = {}): BoardHighlightInput {
  return { pulse: pulse(), trend: [], overdueCompliance: [], ...overrides };
}

describe('computeBoardHighlights', () => {
  it('flags critical runway with a critical tone', () => {
    const highlights = computeBoardHighlights(input({ pulse: pulse({ runway_band: 'critical', runway_weeks: 2 }) }));
    const runwayHighlight = highlights.find((h) => h.label.includes('Runway is critical'));
    expect(runwayHighlight?.tone).toBe('critical');
  });

  it('marks a healthy runway as positive', () => {
    const highlights = computeBoardHighlights(input({ pulse: pulse({ runway_band: 'healthy', runway_weeks: 30 }) }));
    const runwayHighlight = highlights.find((h) => h.label.includes('Runway is healthy'));
    expect(runwayHighlight?.tone).toBe('positive');
  });

  it('handles a null runway without crashing', () => {
    const highlights = computeBoardHighlights(input({ pulse: pulse({ runway_weeks: null, runway_band: 'unknown' }) }));
    expect(highlights.some((h) => h.label.includes('not calculable'))).toBe(true);
  });

  it('flags stale cash data', () => {
    const highlights = computeBoardHighlights(input({ pulse: pulse({ cash_is_stale: true }) }));
    expect(highlights.some((h) => h.label.includes('not been updated'))).toBe(true);
  });

  it('reports a payroll cost increase from the latest trend point', () => {
    const trend: PayrollTrendPoint[] = [
      { period: '2026-06', total_burn_ngn: 1_000_000, total_employee_ngn: 0, employee_count: null, delta_ngn: null, delta_pct: null },
      { period: '2026-07', total_burn_ngn: 1_200_000, total_employee_ngn: 0, employee_count: null, delta_ngn: 200_000, delta_pct: 20 },
    ];
    const highlights = computeBoardHighlights(input({ trend }));
    const trendHighlight = highlights.find((h) => h.label.includes('increased'));
    expect(trendHighlight).toBeDefined();
    expect(trendHighlight?.tone).toBe('warning'); // 20% swing >= 15% threshold
  });

  it('reports a payroll cost decrease with neutral tone for a small swing', () => {
    const trend: PayrollTrendPoint[] = [
      { period: '2026-07', total_burn_ngn: 980_000, total_employee_ngn: 0, employee_count: null, delta_ngn: -20_000, delta_pct: -2 },
    ];
    const highlights = computeBoardHighlights(input({ trend }));
    const trendHighlight = highlights.find((h) => h.label.includes('decreased'));
    expect(trendHighlight?.tone).toBe('neutral');
  });

  it('flags overdue compliance filings as critical with a total amount', () => {
    const overdueCompliance: ComplianceAlert[] = [
      { id: 'a', kind: 'paye', period: '2026-06', due_date: '2026-07-01', amount_ngn: 500_000, status: 'overdue' },
      { id: 'b', kind: 'vat', period: '2026-06', due_date: '2026-07-01', amount_ngn: 300_000, status: 'overdue' },
    ];
    const highlights = computeBoardHighlights(input({ overdueCompliance }));
    const complianceHighlight = highlights.find((h) => h.label.includes('overdue'));
    expect(complianceHighlight?.tone).toBe('critical');
    expect(complianceHighlight?.label).toContain('2 overdue');
  });

  it('marks compliance as current when nothing is overdue', () => {
    const highlights = computeBoardHighlights(input());
    expect(highlights.some((h) => h.label === 'All compliance filings are current.')).toBe(true);
  });

  it('flags payroll above 60% of revenue as a warning', () => {
    const highlights = computeBoardHighlights(input({ pulse: pulse({ payroll_pct_of_revenue: 75 }) }));
    expect(highlights.some((h) => h.label.includes('above the typical'))).toBe(true);
  });

  it('does not flag payroll-to-revenue when within the healthy range', () => {
    const highlights = computeBoardHighlights(input({ pulse: pulse({ payroll_pct_of_revenue: 45 }) }));
    expect(highlights.some((h) => h.label.includes('above the typical'))).toBe(false);
  });
});
