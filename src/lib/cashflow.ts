/**
 * Cash-flow forecasting client wrappers.
 *
 * The heavy lifting lives in the `forecast_cashflow` RPC and
 * `cash_balance_snapshots` table. This module is a thin, typed surface that
 * keeps page code free of `any` and centralises the runway thresholds.
 */

import { supabase } from '@/lib/supabase';

// Runway thresholds — matched 1:1 to the SQL anomaly rules so the dashboard
// and the alerts page tell the same story.
export const RUNWAY_CRITICAL_WEEKS = 4;
export const RUNWAY_WARNING_WEEKS = 12;
export const RUNWAY_HEALTHY_WEEKS = 26;

export type RunwayBand = 'critical' | 'warning' | 'caution' | 'healthy' | 'unknown';

export function bandForRunwayWeeks(weeks: number | null | undefined): RunwayBand {
  if (weeks === null || weeks === undefined || Number.isNaN(weeks)) return 'unknown';
  if (weeks < RUNWAY_CRITICAL_WEEKS) return 'critical';
  if (weeks < RUNWAY_WARNING_WEEKS) return 'warning';
  if (weeks < RUNWAY_HEALTHY_WEEKS) return 'caution';
  return 'healthy';
}

// ─── Snapshots ────────────────────────────────────────────────────────────

export interface CashSnapshot {
  id: string;
  taken_on: string;                    // YYYY-MM-DD
  cash_on_hand_ngn: number;
  in_platform_30d_burn_ngn: number;
  external_monthly_burn_ngn: number;
  monthly_revenue_estimate_ngn: number;
  net_monthly_burn_ngn: number;
  runway_months_estimate: number | null;
  source: 'cron' | 'manual' | 'settings_update';
  created_at: string;
}

/** Last N days of snapshots, ordered oldest → newest for charting. */
export async function fetchSnapshotHistory(days = 90): Promise<CashSnapshot[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('cash_balance_snapshots')
    .select('*')
    .gte('taken_on', since)
    .order('taken_on', { ascending: true });
  if (error) throw error;
  return (data || []) as CashSnapshot[];
}

/** Force-take a snapshot now. Used after the user updates cash on hand. */
export async function takeSnapshot(): Promise<CashSnapshot | null> {
  const { data, error } = await supabase.rpc('snapshot_cash_balance', {
    p_source: 'manual',
  });
  if (error) throw error;
  return (data as CashSnapshot) || null;
}

// ─── Forecast ─────────────────────────────────────────────────────────────

export interface ForecastWeek {
  week_start: string;                  // YYYY-MM-DD (Monday)
  projected_outflows_ngn: number;
  projected_inflows_ngn: number;
  projected_balance_ngn: number;
  runway_weeks_remaining: number | null;
  obligations: {
    recurring_ngn: number;
    batches_ngn: number;
    ewa_ngn: number;
    external_weekly_ngn: number;
  };
}

/** 12-week (default) forward forecast from the SQL RPC. */
export async function fetchForecast(weeks = 12): Promise<ForecastWeek[]> {
  const { data, error } = await supabase.rpc('forecast_cashflow', { p_weeks: weeks });
  if (error) throw error;
  return (data as any[] || []).map((row) => ({
    week_start: row.week_start,
    projected_outflows_ngn: Number(row.projected_outflows_ngn || 0),
    projected_inflows_ngn: Number(row.projected_inflows_ngn || 0),
    projected_balance_ngn: Number(row.projected_balance_ngn || 0),
    runway_weeks_remaining: row.runway_weeks_remaining === null
      ? null
      : Number(row.runway_weeks_remaining),
    obligations: {
      recurring_ngn: Number(row.obligations?.recurring_ngn || 0),
      batches_ngn: Number(row.obligations?.batches_ngn || 0),
      ewa_ngn: Number(row.obligations?.ewa_ngn || 0),
      external_weekly_ngn: Number(row.obligations?.external_weekly_ngn || 0),
    },
  }));
}

/** Convenience: convert ForecastWeek[] into the shape recharts expects. */
export function forecastChartData(weeks: ForecastWeek[]) {
  return weeks.map((w) => ({
    label: w.week_start.slice(5), // MM-DD
    balance: Math.max(0, Math.round(w.projected_balance_ngn)),
    outflow: Math.round(w.projected_outflows_ngn),
  }));
}

/** Top-N upcoming obligations across the whole forecast window. */
export interface UpcomingObligation {
  week_start: string;
  category: 'recurring' | 'batches' | 'ewa' | 'external';
  amount_ngn: number;
}

export function topObligations(
  weeks: ForecastWeek[],
  n = 10,
): UpcomingObligation[] {
  const items: UpcomingObligation[] = [];
  for (const w of weeks) {
    const o = w.obligations;
    if (o.recurring_ngn > 0)
      items.push({ week_start: w.week_start, category: 'recurring', amount_ngn: o.recurring_ngn });
    if (o.batches_ngn > 0)
      items.push({ week_start: w.week_start, category: 'batches', amount_ngn: o.batches_ngn });
    if (o.ewa_ngn > 0)
      items.push({ week_start: w.week_start, category: 'ewa', amount_ngn: o.ewa_ngn });
  }
  return items.sort((a, b) => b.amount_ngn - a.amount_ngn).slice(0, n);
}
