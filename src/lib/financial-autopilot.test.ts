import { describe, it, expect } from 'vitest';
import {
  computeComplianceExposure,
  computeSmartPaymentSchedule,
  ZERO_PENALTY_RULE,
  type PenaltyRule,
} from './financial-autopilot';
import type { ComplianceAlert } from './cfo-dashboard';
import type { PaymentTimingWeek } from './cash-timing';

const ASOF = new Date('2026-08-02T00:00:00Z');

function filing(overrides: Partial<ComplianceAlert> = {}): ComplianceAlert {
  return {
    id: 'f1',
    kind: 'paye',
    period: '2026-06',
    due_date: '2026-07-01',
    amount_ngn: 1_000_000,
    status: 'due',
    ...overrides,
  };
}

describe('computeComplianceExposure', () => {
  it('is zero-penalty and unconfigured when no rule exists for the kind', () => {
    const [row] = computeComplianceExposure([filing()], {}, ASOF);
    expect(row.rule_configured).toBe(false);
    expect(row.estimated_penalty_ngn).toBe(0);
    expect(row.rule).toEqual(ZERO_PENALTY_RULE);
  });

  it('applies the flat filing penalty once a filing is overdue', () => {
    const rules: Record<string, PenaltyRule> = { paye: { flat_filing_penalty_ngn: 50_000, pct_per_month: 0 } };
    const [row] = computeComplianceExposure([filing({ due_date: '2026-07-01' })], rules, ASOF);
    expect(row.rule_configured).toBe(true);
    expect(row.estimated_penalty_ngn).toBe(50_000);
  });

  it('accrues the percentage-per-month penalty against the amount owed', () => {
    const rules: Record<string, PenaltyRule> = { vat: { flat_filing_penalty_ngn: 0, pct_per_month: 10 } };
    // due 2026-06-02, asOf 2026-08-02 -> 61 days -> ~2.004 months
    const [row] = computeComplianceExposure([filing({ kind: 'vat', due_date: '2026-06-02', amount_ngn: 1_000_000 })], rules, ASOF);
    expect(row.estimated_penalty_ngn).toBeGreaterThan(190_000);
    expect(row.estimated_penalty_ngn).toBeLessThan(210_000);
  });

  it('produces zero penalty for a filing that is not yet overdue', () => {
    const rules: Record<string, PenaltyRule> = { paye: { flat_filing_penalty_ngn: 50_000, pct_per_month: 10 } };
    const [row] = computeComplianceExposure([filing({ due_date: '2026-09-01' })], rules, ASOF);
    expect(row.days_overdue).toBe(0);
    expect(row.estimated_penalty_ngn).toBe(0);
  });

  it('sorts rows by estimated penalty descending', () => {
    const rules: Record<string, PenaltyRule> = {
      paye: { flat_filing_penalty_ngn: 10_000, pct_per_month: 0 },
      vat: { flat_filing_penalty_ngn: 100_000, pct_per_month: 0 },
    };
    const rows = computeComplianceExposure(
      [filing({ id: 'a', kind: 'paye', due_date: '2026-07-01' }), filing({ id: 'b', kind: 'vat', due_date: '2026-07-01' })],
      rules,
      ASOF,
    );
    expect(rows[0].id).toBe('b');
  });
});

function week(overrides: Partial<PaymentTimingWeek> & { week_start: string }): PaymentTimingWeek {
  return {
    projected_balance_ngn: 5_000_000,
    runway_weeks_remaining: 20,
    risk: 'safe',
    advice: 'Healthy buffer.',
    ...overrides,
  };
}

describe('computeSmartPaymentSchedule', () => {
  const weeks = [
    week({ week_start: '2026-08-03', risk: 'safe' }),
    week({ week_start: '2026-08-10', risk: 'tight' }),
    week({ week_start: '2026-08-17', risk: 'critical' }),
  ];

  it('recommends release for a payment landing in a safe week', () => {
    const [rec] = computeSmartPaymentSchedule([{ id: 'p1', label: 'Vendor A', amount_ngn: 100_000, scheduled_date: '2026-08-05' }], weeks);
    expect(rec.action).toBe('release');
    expect(rec.week_start).toBe('2026-08-03');
  });

  it('recommends review for a payment landing in a tight week', () => {
    const [rec] = computeSmartPaymentSchedule([{ id: 'p1', label: 'Vendor A', amount_ngn: 100_000, scheduled_date: '2026-08-12' }], weeks);
    expect(rec.action).toBe('review');
  });

  it('recommends hold for a payment landing in a critical week', () => {
    const [rec] = computeSmartPaymentSchedule([{ id: 'p1', label: 'Vendor A', amount_ngn: 100_000, scheduled_date: '2026-08-19' }], weeks);
    expect(rec.action).toBe('hold');
  });

  it('flags a payment outside the forecast horizon for manual review, not as safe by default', () => {
    const [rec] = computeSmartPaymentSchedule([{ id: 'p1', label: 'Vendor A', amount_ngn: 100_000, scheduled_date: '2026-12-01' }], weeks);
    expect(rec.risk).toBe('unknown');
    expect(rec.action).toBe('review');
    expect(rec.week_start).toBeNull();
  });

  it('sorts recommendations by scheduled_date ascending', () => {
    const recs = computeSmartPaymentSchedule(
      [
        { id: 'p2', label: 'Later', amount_ngn: 1, scheduled_date: '2026-08-19' },
        { id: 'p1', label: 'Earlier', amount_ngn: 1, scheduled_date: '2026-08-05' },
      ],
      weeks,
    );
    expect(recs.map((r) => r.id)).toEqual(['p1', 'p2']);
  });
});
