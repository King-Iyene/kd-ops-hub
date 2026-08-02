/**
 * Financial Health Score — a composite 0–100 rating.
 *
 * Synthesises six dimensions the CFO dashboard already tracks into a
 * single, board-ready number that answers "how healthy is this company
 * financially, right now?"
 *
 * Each dimension scores 0–100 independently, then the composite is a
 * weighted average. Weights reflect what matters most for a Nigerian
 * SME / growth-stage company:
 *
 *   Runway           30%   — existential: can you pay next month?
 *   Cash staleness    5%   — data freshness (garbage-in guard)
 *   CCC              15%   — cash efficiency
 *   Revenue conc.    15%   — client dependency risk
 *   Compliance       20%   — regulatory exposure
 *   Payroll ratio    15%   — cost structure health
 *
 * Pure function — independently tested in financial-health.test.ts.
 */

import { supabase } from '@/lib/supabase';
import type { CccBand } from '@/lib/cash-conversion';
import type { ConcentrationBand } from '@/lib/revenue-concentration';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface HealthDimension {
  key: string;
  label: string;
  score: number;
  weight: number;
  weighted: number;
  status: 'excellent' | 'good' | 'fair' | 'poor';
  detail: string;
}

export type HealthGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface HealthScoreResult {
  score: number;
  grade: HealthGrade;
  dimensions: HealthDimension[];
}

export interface HealthScoreInput {
  runway_weeks: number | null;
  runway_band: string;
  cash_is_stale: boolean;
  ccc_days: number | null;
  ccc_band: CccBand;
  hhi: number;
  concentration_band: ConcentrationBand;
  overdue_compliance_count: number;
  payroll_pct_of_revenue: number | null;
}

// ─── Scoring logic ─────────────────────────────────────────────────────────

function statusFor(score: number): HealthDimension['status'] {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  return 'poor';
}

function gradeFor(score: number): HealthGrade {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function scoreRunway(weeks: number | null, band: string): { score: number; detail: string } {
  if (weeks == null) return { score: 30, detail: 'Cash runway is not calculable — set cash on hand.' };
  if (band === 'critical') return { score: 10, detail: `Critical: only ${weeks.toFixed(1)} weeks of runway.` };
  if (band === 'warning') return { score: 40, detail: `Tightening: ${weeks.toFixed(1)} weeks remaining.` };
  if (band === 'caution') return { score: 60, detail: `Adequate: ${weeks.toFixed(1)} weeks, but monitor closely.` };
  if (weeks >= 26) return { score: 100, detail: `Strong: ${weeks.toFixed(1)} weeks of runway.` };
  return { score: 80, detail: `Healthy: ${weeks.toFixed(1)} weeks of runway.` };
}

function scoreCashStaleness(isStale: boolean): { score: number; detail: string } {
  if (isStale) return { score: 20, detail: 'Cash position has not been updated in 7+ days.' };
  return { score: 100, detail: 'Cash data is current.' };
}

function scoreCcc(days: number | null, band: CccBand): { score: number; detail: string } {
  if (days == null) return { score: 50, detail: 'Not enough data to compute cash conversion cycle.' };
  if (band === 'excellent') return { score: 100, detail: `CCC is ${days.toFixed(0)} days — you collect before you pay.` };
  if (band === 'good') return { score: 80, detail: `CCC is ${days.toFixed(0)} days — cash cycles quickly.` };
  if (band === 'fair') return { score: 50, detail: `CCC is ${days.toFixed(0)} days — room to improve.` };
  return { score: 20, detail: `CCC is ${days.toFixed(0)} days — cash is tied up too long.` };
}

function scoreConcentration(hhi: number, band: ConcentrationBand): { score: number; detail: string } {
  if (band === 'diversified') return { score: 100, detail: `HHI ${hhi} — revenue is well diversified.` };
  if (band === 'moderate') return { score: 55, detail: `HHI ${hhi} — moderate client dependency.` };
  return { score: 20, detail: `HHI ${hhi} — highly concentrated, losing one client would hurt.` };
}

function scoreCompliance(overdueCount: number): { score: number; detail: string } {
  if (overdueCount === 0) return { score: 100, detail: 'All compliance filings are current.' };
  if (overdueCount <= 2) return { score: 40, detail: `${overdueCount} overdue filing${overdueCount > 1 ? 's' : ''} — penalties accumulating.` };
  return { score: 10, detail: `${overdueCount} overdue filings — significant regulatory exposure.` };
}

function scorePayrollRatio(pct: number | null): { score: number; detail: string } {
  if (pct == null) return { score: 50, detail: 'No revenue data to compute payroll ratio.' };
  if (pct <= 40) return { score: 100, detail: `Payroll is ${pct.toFixed(0)}% of revenue — lean cost structure.` };
  if (pct <= 60) return { score: 75, detail: `Payroll is ${pct.toFixed(0)}% of revenue — within healthy range.` };
  if (pct <= 80) return { score: 40, detail: `Payroll is ${pct.toFixed(0)}% of revenue — above the 40–60% healthy range.` };
  return { score: 15, detail: `Payroll is ${pct.toFixed(0)}% of revenue — unsustainable cost structure.` };
}

const WEIGHTS = {
  runway: 0.30,
  cash_staleness: 0.05,
  ccc: 0.15,
  concentration: 0.15,
  compliance: 0.20,
  payroll_ratio: 0.15,
};

export function computeHealthScore(input: HealthScoreInput): HealthScoreResult {
  const runway = scoreRunway(input.runway_weeks, input.runway_band);
  const staleness = scoreCashStaleness(input.cash_is_stale);
  const ccc = scoreCcc(input.ccc_days, input.ccc_band);
  const concentration = scoreConcentration(input.hhi, input.concentration_band);
  const compliance = scoreCompliance(input.overdue_compliance_count);
  const payrollRatio = scorePayrollRatio(input.payroll_pct_of_revenue);

  const dims: HealthDimension[] = [
    { key: 'runway', label: 'Cash runway', score: runway.score, weight: WEIGHTS.runway, weighted: runway.score * WEIGHTS.runway, status: statusFor(runway.score), detail: runway.detail },
    { key: 'compliance', label: 'Compliance', score: compliance.score, weight: WEIGHTS.compliance, weighted: compliance.score * WEIGHTS.compliance, status: statusFor(compliance.score), detail: compliance.detail },
    { key: 'ccc', label: 'Cash cycle (CCC)', score: ccc.score, weight: WEIGHTS.ccc, weighted: ccc.score * WEIGHTS.ccc, status: statusFor(ccc.score), detail: ccc.detail },
    { key: 'concentration', label: 'Revenue diversity', score: concentration.score, weight: WEIGHTS.concentration, weighted: concentration.score * WEIGHTS.concentration, status: statusFor(concentration.score), detail: concentration.detail },
    { key: 'payroll_ratio', label: 'Cost structure', score: payrollRatio.score, weight: WEIGHTS.payroll_ratio, weighted: payrollRatio.score * WEIGHTS.payroll_ratio, status: statusFor(payrollRatio.score), detail: payrollRatio.detail },
    { key: 'cash_staleness', label: 'Data freshness', score: staleness.score, weight: WEIGHTS.cash_staleness, weighted: staleness.score * WEIGHTS.cash_staleness, status: statusFor(staleness.score), detail: staleness.detail },
  ];

  const compositeScore = Math.round(dims.reduce((s, d) => s + d.weighted, 0));

  return { score: compositeScore, grade: gradeFor(compositeScore), dimensions: dims };
}

// ─── Fetch ─────────────────────────────────────────────────────────────────

export async function fetchHealthScoreInput(): Promise<HealthScoreInput> {
  const { fetchFinancialPulse, fetchOverdueCompliance } = await import('@/lib/cfo-dashboard');
  const { fetchCashConversionData } = await import('@/lib/cash-conversion');
  const { fetchRevenueConcentration } = await import('@/lib/revenue-concentration');

  const [pulse, overdueCompliance, ccc, concentration] = await Promise.all([
    fetchFinancialPulse(),
    fetchOverdueCompliance(),
    fetchCashConversionData(90).catch(() => ({ ccc_days: null as number | null, band: 'fair' as const })),
    fetchRevenueConcentration(12).catch(() => ({ hhi: 0, band: 'diversified' as const })),
  ]);

  return {
    runway_weeks: pulse.runway_weeks,
    runway_band: pulse.runway_band,
    cash_is_stale: pulse.cash_is_stale,
    ccc_days: ccc.ccc_days,
    ccc_band: ccc.band,
    hhi: concentration.hhi,
    concentration_band: concentration.band,
    overdue_compliance_count: overdueCompliance.length,
    payroll_pct_of_revenue: pulse.payroll_pct_of_revenue,
  };
}
