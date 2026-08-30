/**
 * Vendor Spend Intelligence — aggregates all outflows by vendor/payee.
 *
 * Combines expenses (by category or description as vendor proxy) and
 * subscriptions (by vendor field) to surface:
 *   1. Top vendors by total spend
 *   2. Month-over-month spend trend per vendor
 *   3. Consolidation opportunities (multiple subscriptions in the same
 *      category that could potentially be consolidated)
 *
 * Pure functions are independently tested in vendor-spend.test.ts.
 */

import { supabase } from '@/lib/supabase';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface VendorSpendRow {
  vendor: string;
  source: 'subscription' | 'expense';
  total_ngn: number;
  transaction_count: number;
  months_active: number;
  avg_monthly_ngn: number;
}

export interface VendorMonthlyPoint {
  month: string;
  total_ngn: number;
}

export interface VendorTrend {
  vendor: string;
  months: VendorMonthlyPoint[];
}

export interface ConsolidationOpportunity {
  category: string;
  vendors: string[];
  combined_monthly_ngn: number;
}

export interface VendorSpendBoard {
  topVendors: VendorSpendRow[];
  trends: VendorTrend[];
  consolidation: ConsolidationOpportunity[];
  total_spend_ngn: number;
  vendor_count: number;
}

// ─── Pure functions ────────────────────────────────────────────────────────

export interface RawExpenseRow {
  category: string;
  amount_ngn: number;
  date: string;
  description: string | null;
}

export interface RawSubscriptionRow {
  name: string;
  vendor: string | null;
  category: string;
  amount_ngn: number;
  billing_cycle: string;
  status: string;
}

export function computeVendorSpend(
  expenses: RawExpenseRow[],
  subscriptions: RawSubscriptionRow[],
  trailingMonths = 12,
): VendorSpendBoard {
  const vendorMap = new Map<string, {
    source: VendorSpendRow['source'];
    total: number;
    count: number;
    monthSet: Set<string>;
    category: string;
  }>();
  const monthlyMap = new Map<string, Map<string, number>>();

  for (const e of expenses) {
    const vendor = (e.description || e.category).trim().toLowerCase();
    const displayVendor = e.description || e.category;
    const month = e.date.slice(0, 7);
    const key = vendor;

    if (!vendorMap.has(key)) {
      vendorMap.set(key, { source: 'expense', total: 0, count: 0, monthSet: new Set(), category: e.category });
    }
    const v = vendorMap.get(key)!;
    v.total += Number(e.amount_ngn || 0);
    v.count += 1;
    v.monthSet.add(month);

    if (!monthlyMap.has(key)) monthlyMap.set(key, new Map());
    const mm = monthlyMap.get(key)!;
    mm.set(month, (mm.get(month) ?? 0) + Number(e.amount_ngn || 0));
  }

  const subCategoryVendors = new Map<string, { vendors: string[]; totalMonthly: number }>();
  for (const s of subscriptions) {
    if (s.status !== 'active') continue;
    const vendor = (s.vendor || s.name).trim().toLowerCase();
    const displayVendor = s.vendor || s.name;
    const monthlyAmount = s.billing_cycle === 'yearly' ? Number(s.amount_ngn) / 12
      : s.billing_cycle === 'quarterly' ? Number(s.amount_ngn) / 3
      : Number(s.amount_ngn);

    if (!vendorMap.has(vendor)) {
      vendorMap.set(vendor, { source: 'subscription', total: 0, count: 0, monthSet: new Set(), category: s.category });
    }
    const v = vendorMap.get(vendor)!;
    v.total += monthlyAmount * trailingMonths;
    v.count += 1;
    for (let i = 0; i < trailingMonths; i++) {
      const now = new Date();
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = d.toISOString().slice(0, 7);
      v.monthSet.add(m);
      if (!monthlyMap.has(vendor)) monthlyMap.set(vendor, new Map());
      const mm = monthlyMap.get(vendor)!;
      mm.set(m, (mm.get(m) ?? 0) + monthlyAmount);
    }

    if (!subCategoryVendors.has(s.category)) {
      subCategoryVendors.set(s.category, { vendors: [], totalMonthly: 0 });
    }
    const sc = subCategoryVendors.get(s.category)!;
    sc.vendors.push(displayVendor);
    sc.totalMonthly += monthlyAmount;
  }

  const topVendors: VendorSpendRow[] = Array.from(vendorMap.entries())
    .map(([vendor, v]) => ({
      vendor: vendor.charAt(0).toUpperCase() + vendor.slice(1),
      source: v.source,
      total_ngn: v.total,
      transaction_count: v.count,
      months_active: v.monthSet.size,
      avg_monthly_ngn: v.monthSet.size > 0 ? v.total / v.monthSet.size : v.total,
    }))
    .sort((a, b) => b.total_ngn - a.total_ngn);

  const topKeys = topVendors.slice(0, 10).map((v) => v.vendor.toLowerCase());
  const trends: VendorTrend[] = topKeys.map((key) => {
    const mm = monthlyMap.get(key) || new Map<string, number>();
    const months = Array.from(mm.entries())
      .map(([month, total_ngn]) => ({ month, total_ngn }))
      .sort((a, b) => a.month.localeCompare(b.month));
    return { vendor: key.charAt(0).toUpperCase() + key.slice(1), months };
  });

  const consolidation: ConsolidationOpportunity[] = Array.from(subCategoryVendors.entries())
    .filter(([_, v]) => v.vendors.length >= 2)
    .map(([category, v]) => ({
      category,
      vendors: v.vendors,
      combined_monthly_ngn: v.totalMonthly,
    }))
    .sort((a, b) => b.combined_monthly_ngn - a.combined_monthly_ngn);

  return {
    topVendors: topVendors.slice(0, 20),
    trends,
    consolidation,
    total_spend_ngn: topVendors.reduce((s, v) => s + v.total_ngn, 0),
    vendor_count: topVendors.length,
  };
}

// ─── Fetch ─────────────────────────────────────────────────────────────────

export async function fetchVendorSpendBoard(trailingMonths = 12): Promise<VendorSpendBoard> {
  const since = new Date();
  since.setMonth(since.getMonth() - trailingMonths);
  const sinceStr = since.toISOString().slice(0, 10);

  const [expensesRes, subsRes] = await Promise.all([
    supabase
      .from('expenses')
      .select('category, amount_ngn, date, description')
      .in('status', ['approved', 'paid'])
      .is('deleted_at', null)
      .gte('date', sinceStr),
    supabase
      .from('subscriptions')
      .select('name, vendor, category, amount_ngn, billing_cycle, status'),
  ]);
  if (expensesRes.error) throw expensesRes.error;
  if (subsRes.error) throw subsRes.error;

  return computeVendorSpend(
    (expensesRes.data || []) as RawExpenseRow[],
    (subsRes.data || []) as RawSubscriptionRow[],
    trailingMonths,
  );
}
