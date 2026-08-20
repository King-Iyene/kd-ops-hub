/**
 * Board Reporting — Phase 8 of the CFO Finance Module (scoped).
 *
 * True multi-entity consolidation isn't buildable here without a schema
 * overhaul: the whole database is single-tenant (one `company_settings`
 * row, no `company_id` anywhere, no `companies` table). Rather than fake
 * that with a migration bolted on under time pressure, this delivers the
 * part of "board reporting" that IS safely buildable today — a one-click,
 * investor/board-ready report that pulls together everything the CFO
 * dashboard already tracks (financial pulse, department cost, payroll
 * trend, compliance, talent cost) into a single printable view.
 *
 * `computeBoardHighlights` is the one piece of real logic here (an
 * auto-generated executive-summary bullet list) and is independently
 * tested. Everything else in this module is aggregation — it re-fetches
 * data through the already-tested fetchers in cfo-dashboard.ts and
 * talent-cost.ts rather than re-deriving their math.
 */

import {
  fetchFinancialPulse,
  fetchDepartmentCostBreakdown,
  fetchPayrollTrend,
  fetchOverdueCompliance,
  type FinancialPulse,
  type DepartmentCostRow,
  type PayrollTrendPoint,
  type ComplianceAlert,
} from '@/lib/cfo-dashboard';
import { fetchCostComparison, fetchCompensationBands, type CostComparisonResult, type CompensationBand } from '@/lib/talent-cost';
import { formatNairaCompact } from '@/lib/format';

// ─── Executive summary highlights ──────────────────────────────────────────

export type HighlightTone = 'positive' | 'neutral' | 'warning' | 'critical';

export interface BoardHighlight {
  label: string;
  tone: HighlightTone;
}

export interface BoardHighlightInput {
  pulse: FinancialPulse;
  trend: PayrollTrendPoint[];
  overdueCompliance: ComplianceAlert[];
}

/** Auto-generated executive-summary bullets from the same numbers shown in the report body. */
export function computeBoardHighlights(input: BoardHighlightInput): BoardHighlight[] {
  const { pulse, trend, overdueCompliance } = input;
  const highlights: BoardHighlight[] = [];

  if (pulse.runway_weeks == null) {
    highlights.push({ label: 'Cash runway is not calculable — set cash on hand in Settings.', tone: 'neutral' });
  } else if (pulse.runway_band === 'critical') {
    highlights.push({ label: `Runway is critical at ${pulse.runway_weeks.toFixed(1)} weeks.`, tone: 'critical' });
  } else if (pulse.runway_band === 'warning') {
    highlights.push({ label: `Runway is tightening — ${pulse.runway_weeks.toFixed(1)} weeks remaining.`, tone: 'warning' });
  } else {
    highlights.push({ label: `Runway is healthy at ${pulse.runway_weeks.toFixed(1)} weeks.`, tone: 'positive' });
  }

  if (pulse.cash_is_stale) {
    highlights.push({ label: 'Cash on hand has not been updated in over 7 days — figures above may be stale.', tone: 'warning' });
  }

  const latestTrend = trend.length > 0 ? trend[trend.length - 1] : null;
  if (latestTrend?.delta_pct != null) {
    const pct = latestTrend.delta_pct;
    const direction = pct >= 0 ? 'increased' : 'decreased';
    const tone: HighlightTone = Math.abs(pct) >= 15 ? 'warning' : 'neutral';
    highlights.push({ label: `Payroll cost ${direction} ${Math.abs(pct).toFixed(1)}% vs the prior run.`, tone });
  }

  if (overdueCompliance.length > 0) {
    const totalAmount = overdueCompliance.reduce((s, c) => s + (c.amount_ngn || 0), 0);
    highlights.push({
      label: `${overdueCompliance.length} overdue compliance filing${overdueCompliance.length === 1 ? '' : 's'}` +
        (totalAmount > 0 ? `, totalling ${formatNairaCompact(totalAmount)}.` : '.'),
      tone: 'critical',
    });
  } else {
    highlights.push({ label: 'All compliance filings are current.', tone: 'positive' });
  }

  if (pulse.payroll_pct_of_revenue != null && pulse.payroll_pct_of_revenue > 60) {
    highlights.push({ label: `Payroll is ${pulse.payroll_pct_of_revenue.toFixed(0)}% of monthly revenue — above the typical 40–60% healthy range.`, tone: 'warning' });
  }

  return highlights;
}

// ─── Report data aggregation ────────────────────────────────────────────────

export interface BoardReportData {
  generated_at: string;
  pulse: FinancialPulse;
  departments: DepartmentCostRow[];
  trend: PayrollTrendPoint[];
  overdueCompliance: ComplianceAlert[];
  talentComparison: CostComparisonResult;
  compBands: CompensationBand[];
  highlights: BoardHighlight[];
}

export async function fetchBoardReportData(): Promise<BoardReportData> {
  const [pulse, departments, trend, overdueCompliance, talentComparison, compBands] = await Promise.all([
    fetchFinancialPulse(),
    fetchDepartmentCostBreakdown(),
    fetchPayrollTrend(12),
    fetchOverdueCompliance(),
    fetchCostComparison(),
    fetchCompensationBands(),
  ]);

  return {
    generated_at: new Date().toISOString(),
    pulse,
    departments,
    trend,
    overdueCompliance,
    talentComparison,
    compBands,
    highlights: computeBoardHighlights({ pulse, trend, overdueCompliance }),
  };
}
