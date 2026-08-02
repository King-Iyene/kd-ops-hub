import { describe, it, expect } from 'vitest';
import { computeHealthScore, type HealthScoreInput } from './financial-health';

function base(overrides: Partial<HealthScoreInput> = {}): HealthScoreInput {
  return {
    runway_weeks: 24,
    runway_band: 'healthy',
    cash_is_stale: false,
    ccc_days: 10,
    ccc_band: 'good',
    hhi: 800,
    concentration_band: 'diversified',
    overdue_compliance_count: 0,
    payroll_pct_of_revenue: 45,
    ...overrides,
  };
}

describe('computeHealthScore', () => {
  it('gives a high score for a perfectly healthy company', () => {
    const result = computeHealthScore(base());
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(['A', 'B']).toContain(result.grade);
  });

  it('drops the score sharply when runway is critical', () => {
    const result = computeHealthScore(base({ runway_weeks: 2, runway_band: 'critical' }));
    expect(result.score).toBeLessThan(70);
    const runwayDim = result.dimensions.find((d) => d.key === 'runway');
    expect(runwayDim?.status).toBe('poor');
  });

  it('penalises stale cash data', () => {
    const fresh = computeHealthScore(base({ cash_is_stale: false }));
    const stale = computeHealthScore(base({ cash_is_stale: true }));
    expect(stale.score).toBeLessThan(fresh.score);
  });

  it('penalises poor CCC', () => {
    const good = computeHealthScore(base({ ccc_days: 10, ccc_band: 'good' }));
    const poor = computeHealthScore(base({ ccc_days: 90, ccc_band: 'poor' }));
    expect(poor.score).toBeLessThan(good.score);
  });

  it('penalises high revenue concentration', () => {
    const diversified = computeHealthScore(base({ hhi: 800, concentration_band: 'diversified' }));
    const concentrated = computeHealthScore(base({ hhi: 5000, concentration_band: 'concentrated' }));
    expect(concentrated.score).toBeLessThan(diversified.score);
  });

  it('penalises overdue compliance filings', () => {
    const clean = computeHealthScore(base({ overdue_compliance_count: 0 }));
    const overdue = computeHealthScore(base({ overdue_compliance_count: 5 }));
    expect(overdue.score).toBeLessThan(clean.score);
    const dim = overdue.dimensions.find((d) => d.key === 'compliance');
    expect(dim?.status).toBe('poor');
  });

  it('penalises high payroll ratio', () => {
    const lean = computeHealthScore(base({ payroll_pct_of_revenue: 30 }));
    const heavy = computeHealthScore(base({ payroll_pct_of_revenue: 90 }));
    expect(heavy.score).toBeLessThan(lean.score);
  });

  it('returns grade F for a company in crisis', () => {
    const result = computeHealthScore(base({
      runway_weeks: 1,
      runway_band: 'critical',
      cash_is_stale: true,
      ccc_days: 120,
      ccc_band: 'poor',
      hhi: 8000,
      concentration_band: 'concentrated',
      overdue_compliance_count: 10,
      payroll_pct_of_revenue: 95,
    }));
    expect(result.grade).toBe('F');
    expect(result.score).toBeLessThan(30);
  });

  it('handles null runway gracefully', () => {
    const result = computeHealthScore(base({ runway_weeks: null, runway_band: 'unknown' }));
    expect(result.score).toBeGreaterThan(0);
    expect(result.dimensions.find((d) => d.key === 'runway')?.detail).toContain('not calculable');
  });

  it('handles null payroll pct gracefully', () => {
    const result = computeHealthScore(base({ payroll_pct_of_revenue: null }));
    expect(result.dimensions.find((d) => d.key === 'payroll_ratio')?.score).toBe(50);
  });

  it('returns exactly 6 dimensions', () => {
    const result = computeHealthScore(base());
    expect(result.dimensions).toHaveLength(6);
  });

  it('weighted scores sum to the composite', () => {
    const result = computeHealthScore(base());
    const weightedSum = Math.round(result.dimensions.reduce((s, d) => s + d.weighted, 0));
    expect(result.score).toBe(weightedSum);
  });
});
