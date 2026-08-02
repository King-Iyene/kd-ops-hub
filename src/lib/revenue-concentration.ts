/**
 * Client Revenue Concentration — Herfindahl-Hirschman Index (HHI) analysis.
 *
 * Measures how dependent the company's revenue is on a small number of
 * clients. A concentrated revenue base is a risk: losing one large client
 * could destabilise cash flow.
 *
 * HHI = sum of (market share %)². Ranges from 0 (infinite equal clients)
 * to 10,000 (one client = 100%). SEC/DOJ thresholds:
 *   < 1,500 = diversified (low concentration)
 *   1,500–2,500 = moderate concentration
 *   > 2,500 = high concentration
 *
 * Pure functions are independently tested in revenue-concentration.test.ts.
 */

import { supabase } from '@/lib/supabase';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ClientRevenue {
  client_id: string;
  client_name: string;
  total_ngn: number;
}

export type ConcentrationBand = 'diversified' | 'moderate' | 'concentrated';

export interface ConcentrationResult {
  hhi: number;
  band: ConcentrationBand;
  top_client_pct: number | null;
  top3_pct: number | null;
  client_count: number;
  total_revenue_ngn: number;
  clients: ClientRevenueShare[];
}

export interface ClientRevenueShare extends ClientRevenue {
  share_pct: number;
}

// ─── Pure functions ────────────────────────────────────────────────────────

export function bandForHhi(hhi: number): ConcentrationBand {
  if (hhi < 1500) return 'diversified';
  if (hhi <= 2500) return 'moderate';
  return 'concentrated';
}

export function computeConcentration(clients: ClientRevenue[]): ConcentrationResult {
  const totalRevenue = clients.reduce((s, c) => s + c.total_ngn, 0);
  if (totalRevenue <= 0 || clients.length === 0) {
    return {
      hhi: 0,
      band: 'diversified',
      top_client_pct: null,
      top3_pct: null,
      client_count: 0,
      total_revenue_ngn: 0,
      clients: [],
    };
  }

  const withShare: ClientRevenueShare[] = clients
    .map((c) => ({ ...c, share_pct: (c.total_ngn / totalRevenue) * 100 }))
    .sort((a, b) => b.share_pct - a.share_pct);

  const hhi = withShare.reduce((s, c) => s + c.share_pct * c.share_pct, 0);
  const top_client_pct = withShare[0]?.share_pct ?? null;
  const top3_pct = withShare.slice(0, 3).reduce((s, c) => s + c.share_pct, 0);

  return {
    hhi: Math.round(hhi),
    band: bandForHhi(hhi),
    top_client_pct,
    top3_pct: withShare.length >= 3 ? top3_pct : null,
    client_count: withShare.length,
    total_revenue_ngn: totalRevenue,
    clients: withShare,
  };
}

// ─── Fetch ─────────────────────────────────────────────────────────────────

export async function fetchRevenueConcentration(months = 12): Promise<ConcentrationResult> {
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceStr = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('invoices')
    .select('client_id, client_name, total_ngn, status')
    .in('status', ['sent', 'paid', 'overdue'])
    .is('deleted_at', null)
    .gte('issue_date', sinceStr);
  if (error) throw error;

  const byClient = new Map<string, ClientRevenue>();
  for (const row of (data || []) as Array<{ client_id: string | null; client_name: string; total_ngn: number }>) {
    const key = row.client_id ?? `__name__${row.client_name}`;
    const name = row.client_name;
    if (!byClient.has(key)) {
      byClient.set(key, { client_id: key, client_name: name, total_ngn: 0 });
    }
    byClient.get(key)!.total_ngn += Number(row.total_ngn || 0);
  }

  return computeConcentration(Array.from(byClient.values()));
}
