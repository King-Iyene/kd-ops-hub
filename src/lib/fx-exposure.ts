/**
 * FX Exposure Command Center — Phase 5 of the CFO Finance Module.
 *
 * Models the company's total USD exposure from two sources:
 *   1. Partner/contractor pay (from contractors table + company_settings)
 *   2. USD-denominated subscriptions (from subscriptions table, currency='USD')
 *
 * The FX rate ledger (fx_rates) provides an authoritative rate trend and
 * volatility analysis. Sensitivity tables show what a rate swing does to
 * the total NGN cost of all USD obligations before it happens.
 *
 * Pure functions are independently tested in fx-exposure.test.ts; `fetch*`
 * wrappers only do I/O.
 */

import { supabase } from '@/lib/supabase';
import { usdMinorToNgnMinor, toMajor, toMinor } from '@/lib/money';

const COMPANY_SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

// ─── FX rate trend & volatility ─────────────────────────────────────────────

export interface FxRatePoint {
  id: string;
  rate: number;
  status: string;
  source: string;
  valid_from: string;
  deviation_pct: number | null;
}

export async function fetchFxRateHistory(days = 90): Promise<FxRatePoint[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('fx_rates')
    .select('id, rate, status, source, valid_from, deviation_pct')
    .eq('base', 'USD')
    .eq('quote', 'NGN')
    .in('status', ['active', 'superseded'])
    .gte('valid_from', since)
    .order('valid_from', { ascending: true });
  if (error) throw error;
  return ((data || []) as any[]).map((r) => ({
    id: r.id,
    rate: Number(r.rate),
    status: r.status,
    source: r.source,
    valid_from: r.valid_from,
    deviation_pct: r.deviation_pct == null ? null : Number(r.deviation_pct),
  }));
}

export interface FxVolatilitySummary {
  current_rate: number | null;
  min_rate: number | null;
  max_rate: number | null;
  avg_rate: number | null;
  /** (max - min) / avg, as a percentage — simple range-based volatility indicator. */
  range_volatility_pct: number | null;
  largest_single_move_pct: number | null;
}

/** Summarizes rate history into a volatility snapshot. Empty history -> all nulls. */
export function computeFxVolatility(history: FxRatePoint[]): FxVolatilitySummary {
  if (history.length === 0) {
    return {
      current_rate: null, min_rate: null, max_rate: null, avg_rate: null,
      range_volatility_pct: null, largest_single_move_pct: null,
    };
  }
  const rates = history.map((h) => h.rate);
  const min_rate = Math.min(...rates);
  const max_rate = Math.max(...rates);
  const avg_rate = rates.reduce((s, r) => s + r, 0) / rates.length;
  const largest_single_move_pct = history.reduce<number | null>((max, h) => {
    if (h.deviation_pct == null) return max;
    return max == null ? h.deviation_pct : Math.max(max, h.deviation_pct);
  }, null);

  return {
    current_rate: rates[rates.length - 1],
    min_rate,
    max_rate,
    avg_rate,
    range_volatility_pct: avg_rate > 0 ? ((max_rate - min_rate) / avg_rate) * 100 : null,
    largest_single_move_pct,
  };
}

// ─── USD obligation exposure ────────────────────────────────────────────────

export interface UsdExposureSensitivity {
  rate_change_pct: number;
  implied_rate: number;
  monthly_ngn: number;
  delta_ngn: number;
}

export interface UsdExposureSource {
  label: string;
  count: number;
  monthly_usd_minor: number;
  monthly_ngn: number;
}

export interface UsdExposureSummary {
  active_partner_count: number;
  monthly_usd_minor: number;
  current_rate: number;
  monthly_ngn_at_current_rate: number;
  sensitivity: UsdExposureSensitivity[];
  sources: UsdExposureSource[];
}

const SENSITIVITY_SHOCKS_PCT = [-10, -5, 0, 5, 10];

/**
 * Models the NGN cost of all recurring USD obligations under a range of
 * rate shocks, so a rate move shows up as a cost number before it happens
 * rather than as a surprise on the next payment run.
 *
 * Sources are broken down so the UI can show where USD exposure comes from
 * (contractor pay vs. USD subscriptions vs. future sources).
 */
export function computeUsdExposure(
  activePartnerCount: number,
  totalMonthlyUsdMinor: number,
  currentRate: number,
  sources: UsdExposureSource[] = [],
): UsdExposureSummary {
  const baselineNgnMinor = currentRate > 0 ? usdMinorToNgnMinor(totalMonthlyUsdMinor, currentRate) : 0;
  const baselineNgn = toMajor(baselineNgnMinor);

  const sensitivity: UsdExposureSensitivity[] = SENSITIVITY_SHOCKS_PCT.map((shockPct) => {
    const impliedRate = currentRate * (1 + shockPct / 100);
    const ngnMinor = impliedRate > 0 ? usdMinorToNgnMinor(totalMonthlyUsdMinor, impliedRate) : 0;
    const monthly_ngn = toMajor(ngnMinor);
    return {
      rate_change_pct: shockPct,
      implied_rate: impliedRate,
      monthly_ngn,
      delta_ngn: monthly_ngn - baselineNgn,
    };
  });

  return {
    active_partner_count: activePartnerCount,
    monthly_usd_minor: totalMonthlyUsdMinor,
    current_rate: currentRate,
    monthly_ngn_at_current_rate: baselineNgn,
    sensitivity,
    sources,
  };
}

// ─── Combined board fetch ───────────────────────────────────────────────────

export interface FxExposureBoard {
  history: FxRatePoint[];
  volatility: FxVolatilitySummary;
  usdExposure: UsdExposureSummary;
  deviationThresholdPct: number;
}

export async function fetchFxExposureBoard(days = 90): Promise<FxExposureBoard> {
  const [history, contractorsRes, settingsRes, rateRes, usdSubsRes] = await Promise.all([
    fetchFxRateHistory(days),
    supabase.from('contractors').select('id, pay_amount_usd_minor').eq('status', 'active'),
    supabase.from('company_settings').select('partner_pay_usd_minor, fx_deviation_threshold_pct').eq('id', COMPANY_SETTINGS_ID).maybeSingle(),
    supabase.rpc('get_current_rate', { p_base: 'USD', p_quote: 'NGN' }),
    supabase.from('subscriptions').select('id, amount_usd, billing_cycle').eq('status', 'active').eq('currency', 'USD'),
  ]);
  if (contractorsRes.error) throw contractorsRes.error;

  const globalUsdMinor = Number((settingsRes.data as any)?.partner_pay_usd_minor || 0);
  const currentRate = Number(rateRes.data || 0);
  const contractors = (contractorsRes.data || []) as Array<{ id: string; pay_amount_usd_minor: number | null }>;

  const contractorMonthlyUsdMinor = contractors.reduce(
    (s, c) => s + (c.pay_amount_usd_minor != null ? Number(c.pay_amount_usd_minor) : globalUsdMinor),
    0,
  );

  const usdSubs = (usdSubsRes.data || []) as Array<{ id: string; amount_usd: number | null; billing_cycle: string }>;
  const subMonthlyUsd = usdSubs.reduce((s, sub) => {
    const amt = Number(sub.amount_usd || 0);
    if (sub.billing_cycle === 'yearly') return s + amt / 12;
    if (sub.billing_cycle === 'quarterly') return s + amt / 3;
    return s + amt;
  }, 0);
  const subMonthlyUsdMinor = toMinor(subMonthlyUsd);

  const totalMonthlyUsdMinor = contractorMonthlyUsdMinor + subMonthlyUsdMinor;

  const sources: UsdExposureSource[] = [];
  if (contractors.length > 0) {
    sources.push({
      label: 'Contractor pay',
      count: contractors.length,
      monthly_usd_minor: contractorMonthlyUsdMinor,
      monthly_ngn: currentRate > 0 ? toMajor(usdMinorToNgnMinor(contractorMonthlyUsdMinor, currentRate)) : 0,
    });
  }
  if (usdSubs.length > 0) {
    sources.push({
      label: 'USD subscriptions',
      count: usdSubs.length,
      monthly_usd_minor: subMonthlyUsdMinor,
      monthly_ngn: currentRate > 0 ? toMajor(usdMinorToNgnMinor(subMonthlyUsdMinor, currentRate)) : 0,
    });
  }

  return {
    history,
    volatility: computeFxVolatility(history),
    usdExposure: computeUsdExposure(contractors.length + usdSubs.length, totalMonthlyUsdMinor, currentRate, sources),
    deviationThresholdPct: Number((settingsRes.data as any)?.fx_deviation_threshold_pct ?? 5),
  };
}
