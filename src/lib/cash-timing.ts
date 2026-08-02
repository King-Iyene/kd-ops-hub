/**
 * Cash Timing Engine — Phase 4 of the CFO Finance Module.
 *
 * Doesn't reinvent forecasting: `forecast_cashflow` (via fetchForecast in
 * cashflow.ts) already projects weekly balance up to 52 weeks out. This
 * module adds the two things that turn a balance forecast into a "when do
 * I pay / when do I chase" decision:
 *   1. Invoice aging — how much AR is overdue and by how much.
 *   2. Payment timing recommendations — which upcoming weeks are safe to
 *      release discretionary payments in, and which need collections
 *      accelerated or payments deferred first.
 *
 * Pure functions are independently tested in cash-timing.test.ts; `fetch*`
 * wrappers only do I/O.
 */

import { supabase } from '@/lib/supabase';
import { fetchForecast, RUNWAY_WARNING_WEEKS, type ForecastWeek } from '@/lib/cashflow';

// ─── Invoice aging ──────────────────────────────────────────────────────────

export type AgingBucket = 'not_due' | '1-30' | '31-60' | '61-90' | '90+';

export const AGING_BUCKET_ORDER: AgingBucket[] = ['not_due', '1-30', '31-60', '61-90', '90+'];

export const AGING_BUCKET_LABEL: Record<AgingBucket, string> = {
  not_due: 'Not yet due',
  '1-30': '1–30 days overdue',
  '31-60': '31–60 days overdue',
  '61-90': '61–90 days overdue',
  '90+': '90+ days overdue',
};

export interface AgingInvoice {
  id: string;
  invoice_number: string;
  client_name: string;
  due_date: string;
  total_ngn: number;
  status: string;
}

export interface InvoiceAgingRow extends AgingInvoice {
  days_overdue: number;
  bucket: AgingBucket;
}

export interface InvoiceAgingBucketSummary {
  bucket: AgingBucket;
  count: number;
  total_ngn: number;
}

export interface InvoiceAgingReport {
  rows: InvoiceAgingRow[];
  buckets: InvoiceAgingBucketSummary[];
  total_outstanding_ngn: number;
}

/**
 * Buckets unpaid invoices ('sent' or 'overdue' status — draft/paid/cancelled
 * carry no collection risk and are excluded) by days past due.
 */
export function computeInvoiceAging(invoices: AgingInvoice[], asOf: Date = new Date()): InvoiceAgingReport {
  const outstanding = invoices.filter((i) => i.status === 'sent' || i.status === 'overdue');

  const rows: InvoiceAgingRow[] = outstanding.map((inv) => {
    const due = new Date(inv.due_date).getTime();
    const days_overdue = Math.floor((asOf.getTime() - due) / 86_400_000);
    let bucket: AgingBucket;
    if (days_overdue < 0) bucket = 'not_due';
    else if (days_overdue <= 30) bucket = '1-30';
    else if (days_overdue <= 60) bucket = '31-60';
    else if (days_overdue <= 90) bucket = '61-90';
    else bucket = '90+';
    return { ...inv, days_overdue, bucket };
  });

  const buckets = AGING_BUCKET_ORDER.map((bucket) => {
    const matched = rows.filter((r) => r.bucket === bucket);
    return {
      bucket,
      count: matched.length,
      total_ngn: matched.reduce((s, r) => s + Number(r.total_ngn || 0), 0),
    };
  });

  return {
    rows: [...rows].sort((a, b) => b.days_overdue - a.days_overdue),
    buckets,
    total_outstanding_ngn: rows.reduce((s, r) => s + Number(r.total_ngn || 0), 0),
  };
}

export async function fetchInvoiceAging(): Promise<InvoiceAgingReport> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, client_name, due_date, total_ngn, status')
    .in('status', ['sent', 'overdue']);
  if (error) throw error;
  return computeInvoiceAging((data || []) as AgingInvoice[]);
}

const AGING_SEVERITY: Record<AgingBucket, number> = { not_due: 0, '1-30': 1, '31-60': 2, '61-90': 3, '90+': 4 };

/** Worst-aged, largest-balance invoices first — who to chase when cash is tight. */
export function topCollectionTargets(rows: InvoiceAgingRow[], n = 10): InvoiceAgingRow[] {
  return [...rows]
    .filter((r) => r.bucket !== 'not_due')
    .sort((a, b) => AGING_SEVERITY[b.bucket] - AGING_SEVERITY[a.bucket] || b.total_ngn - a.total_ngn)
    .slice(0, n);
}

// ─── Payment timing recommendations ────────────────────────────────────────

export type TimingRisk = 'safe' | 'tight' | 'critical';

export interface PaymentTimingWeek {
  week_start: string;
  projected_balance_ngn: number;
  runway_weeks_remaining: number | null;
  risk: TimingRisk;
  advice: string;
}

/**
 * Turns the raw weekly balance forecast into a pay/hold signal per week.
 *   critical — balance goes negative: defer discretionary payments.
 *   tight    — runway dips under the warning threshold: review before releasing.
 *   safe     — normal schedule.
 */
export function computePaymentTimingRecommendations(weeks: ForecastWeek[]): PaymentTimingWeek[] {
  return weeks.map((w) => {
    let risk: TimingRisk = 'safe';
    let advice = 'Healthy buffer — normal payment schedule is fine this week.';
    if (w.projected_balance_ngn < 0) {
      risk = 'critical';
      advice = 'Projected balance goes negative — delay discretionary payments or accelerate collections before this week.';
    } else if (w.runway_weeks_remaining != null && w.runway_weeks_remaining < RUNWAY_WARNING_WEEKS) {
      risk = 'tight';
      advice = `Runway drops below ${RUNWAY_WARNING_WEEKS} weeks here — review non-essential batches before releasing payment.`;
    }
    return {
      week_start: w.week_start,
      projected_balance_ngn: w.projected_balance_ngn,
      runway_weeks_remaining: w.runway_weeks_remaining,
      risk,
      advice,
    };
  });
}

// ─── Combined board fetch ───────────────────────────────────────────────────

export interface CashTimingBoard {
  weeks: ForecastWeek[];
  timing: PaymentTimingWeek[];
  aging: InvoiceAgingReport;
}

/** 13-week forecast + payment timing signal + invoice aging, in one call. */
export async function fetchCashTimingBoard(weeks = 13): Promise<CashTimingBoard> {
  const [forecastWeeks, aging] = await Promise.all([fetchForecast(weeks), fetchInvoiceAging()]);
  return {
    weeks: forecastWeeks,
    timing: computePaymentTimingRecommendations(forecastWeeks),
    aging,
  };
}
