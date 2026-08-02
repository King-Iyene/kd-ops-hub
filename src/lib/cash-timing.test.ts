import { describe, it, expect } from 'vitest';
import {
  computeInvoiceAging,
  topCollectionTargets,
  computePaymentTimingRecommendations,
  type AgingInvoice,
  type InvoiceAgingRow,
} from './cash-timing';
import type { ForecastWeek } from './cashflow';

const ASOF = new Date('2026-08-02T00:00:00Z');

function inv(overrides: Partial<AgingInvoice> & { id: string; due_date: string }): AgingInvoice {
  return {
    invoice_number: 'INV-2026-0001',
    client_name: 'Acme Ltd',
    total_ngn: 1_000_000,
    status: 'sent',
    ...overrides,
  };
}

describe('computeInvoiceAging', () => {
  it('excludes draft, paid, and cancelled invoices', () => {
    const report = computeInvoiceAging(
      [
        inv({ id: 'a', due_date: '2026-07-01', status: 'draft' }),
        inv({ id: 'b', due_date: '2026-07-01', status: 'paid' }),
        inv({ id: 'c', due_date: '2026-07-01', status: 'cancelled' }),
        inv({ id: 'd', due_date: '2026-07-01', status: 'sent' }),
      ],
      ASOF,
    );
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].id).toBe('d');
  });

  it('buckets an invoice not yet due as "not_due"', () => {
    const report = computeInvoiceAging([inv({ id: 'a', due_date: '2026-08-10' })], ASOF);
    expect(report.rows[0].bucket).toBe('not_due');
    expect(report.rows[0].days_overdue).toBeLessThan(0);
  });

  it('buckets 15 days overdue as 1-30', () => {
    const report = computeInvoiceAging([inv({ id: 'a', due_date: '2026-07-18' })], ASOF);
    expect(report.rows[0].bucket).toBe('1-30');
    expect(report.rows[0].days_overdue).toBe(15);
  });

  it('buckets exactly on a boundary correctly (30 days -> 1-30, 31 days -> 31-60)', () => {
    const at30 = computeInvoiceAging([inv({ id: 'a', due_date: '2026-07-03' })], ASOF);
    expect(at30.rows[0].days_overdue).toBe(30);
    expect(at30.rows[0].bucket).toBe('1-30');

    const at31 = computeInvoiceAging([inv({ id: 'b', due_date: '2026-07-02' })], ASOF);
    expect(at31.rows[0].days_overdue).toBe(31);
    expect(at31.rows[0].bucket).toBe('31-60');
  });

  it('buckets 95 days overdue as 90+', () => {
    const report = computeInvoiceAging([inv({ id: 'a', due_date: '2026-04-29' })], ASOF);
    expect(report.rows[0].bucket).toBe('90+');
  });

  it('sums total_outstanding_ngn across all outstanding invoices', () => {
    const report = computeInvoiceAging(
      [
        inv({ id: 'a', due_date: '2026-07-01', total_ngn: 500_000 }),
        inv({ id: 'b', due_date: '2026-06-01', total_ngn: 300_000 }),
      ],
      ASOF,
    );
    expect(report.total_outstanding_ngn).toBe(800_000);
  });

  it('produces a bucket summary with counts and totals per bucket', () => {
    const report = computeInvoiceAging(
      [
        inv({ id: 'a', due_date: '2026-07-25', total_ngn: 200_000 }), // 1-30
        inv({ id: 'b', due_date: '2026-07-20', total_ngn: 300_000 }), // 1-30
      ],
      ASOF,
    );
    const bucket = report.buckets.find((b) => b.bucket === '1-30')!;
    expect(bucket.count).toBe(2);
    expect(bucket.total_ngn).toBe(500_000);
  });

  it('sorts rows most-overdue first', () => {
    const report = computeInvoiceAging(
      [
        inv({ id: 'a', due_date: '2026-07-25' }), // less overdue
        inv({ id: 'b', due_date: '2026-05-01' }), // more overdue
      ],
      ASOF,
    );
    expect(report.rows[0].id).toBe('b');
  });
});

function agingRow(overrides: Partial<InvoiceAgingRow> & { id: string }): InvoiceAgingRow {
  return {
    invoice_number: 'INV-1',
    client_name: 'Acme',
    due_date: '2026-06-01',
    total_ngn: 500_000,
    status: 'overdue',
    days_overdue: 60,
    bucket: '31-60',
    ...overrides,
  };
}

describe('topCollectionTargets', () => {
  it('excludes not_due invoices', () => {
    const targets = topCollectionTargets([
      agingRow({ id: 'a', bucket: 'not_due', days_overdue: -5 }),
      agingRow({ id: 'b', bucket: '1-30', days_overdue: 10 }),
    ]);
    expect(targets.map((t) => t.id)).toEqual(['b']);
  });

  it('ranks by bucket severity first, then by amount', () => {
    const targets = topCollectionTargets([
      agingRow({ id: 'small-90', bucket: '90+', total_ngn: 100_000 }),
      agingRow({ id: 'big-1-30', bucket: '1-30', total_ngn: 5_000_000 }),
      agingRow({ id: 'big-90', bucket: '90+', total_ngn: 2_000_000 }),
    ]);
    expect(targets.map((t) => t.id)).toEqual(['big-90', 'small-90', 'big-1-30']);
  });

  it('caps results at n', () => {
    const rows = Array.from({ length: 15 }, (_, i) => agingRow({ id: `r${i}` }));
    expect(topCollectionTargets(rows, 5)).toHaveLength(5);
  });
});

function week(overrides: Partial<ForecastWeek> & { week_start: string }): ForecastWeek {
  return {
    projected_outflows_ngn: 0,
    projected_inflows_ngn: 0,
    projected_balance_ngn: 5_000_000,
    runway_weeks_remaining: 20,
    obligations: { recurring_ngn: 0, batches_ngn: 0, ewa_ngn: 0, external_weekly_ngn: 0 },
    ...overrides,
  };
}

describe('computePaymentTimingRecommendations', () => {
  it('flags a negative projected balance as critical', () => {
    const [rec] = computePaymentTimingRecommendations([week({ week_start: '2026-08-03', projected_balance_ngn: -100_000 })]);
    expect(rec.risk).toBe('critical');
  });

  it('flags runway below the warning threshold as tight', () => {
    const [rec] = computePaymentTimingRecommendations([
      week({ week_start: '2026-08-03', projected_balance_ngn: 1_000_000, runway_weeks_remaining: 8 }),
    ]);
    expect(rec.risk).toBe('tight');
  });

  it('marks a healthy week as safe', () => {
    const [rec] = computePaymentTimingRecommendations([
      week({ week_start: '2026-08-03', projected_balance_ngn: 10_000_000, runway_weeks_remaining: 30 }),
    ]);
    expect(rec.risk).toBe('safe');
  });

  it('treats a null runway with positive balance as safe (unknown runway isn\'t itself a risk signal)', () => {
    const [rec] = computePaymentTimingRecommendations([
      week({ week_start: '2026-08-03', projected_balance_ngn: 1_000_000, runway_weeks_remaining: null }),
    ]);
    expect(rec.risk).toBe('safe');
  });

  it('preserves week order and count', () => {
    const recs = computePaymentTimingRecommendations([
      week({ week_start: '2026-08-03' }),
      week({ week_start: '2026-08-10' }),
    ]);
    expect(recs.map((r) => r.week_start)).toEqual(['2026-08-03', '2026-08-10']);
  });
});
