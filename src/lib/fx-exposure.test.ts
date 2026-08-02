import { describe, it, expect } from 'vitest';
import { computeFxVolatility, computeUsdExposure, type FxRatePoint } from './fx-exposure';

function point(overrides: Partial<FxRatePoint> & { rate: number; valid_from: string }): FxRatePoint {
  return {
    id: 'r1',
    status: 'active',
    source: 'manual',
    deviation_pct: null,
    ...overrides,
  };
}

describe('computeFxVolatility', () => {
  it('returns all nulls for empty history', () => {
    const summary = computeFxVolatility([]);
    expect(summary.current_rate).toBeNull();
    expect(summary.range_volatility_pct).toBeNull();
  });

  it('treats the last point in history order as current_rate', () => {
    const summary = computeFxVolatility([
      point({ rate: 1500, valid_from: '2026-06-01' }),
      point({ rate: 1550, valid_from: '2026-07-01' }),
    ]);
    expect(summary.current_rate).toBe(1550);
  });

  it('computes min/max/avg across the history', () => {
    const summary = computeFxVolatility([
      point({ rate: 1500, valid_from: '2026-06-01' }),
      point({ rate: 1600, valid_from: '2026-07-01' }),
      point({ rate: 1550, valid_from: '2026-08-01' }),
    ]);
    expect(summary.min_rate).toBe(1500);
    expect(summary.max_rate).toBe(1600);
    expect(summary.avg_rate).toBeCloseTo(1550, 5);
  });

  it('computes range_volatility_pct as (max-min)/avg', () => {
    const summary = computeFxVolatility([
      point({ rate: 1000, valid_from: '2026-06-01' }),
      point({ rate: 1100, valid_from: '2026-07-01' }),
    ]);
    // avg = 1050, range = 100 -> 9.52%
    expect(summary.range_volatility_pct).toBeCloseTo(9.5238, 3);
  });

  it('picks the largest recorded single-move deviation_pct', () => {
    const summary = computeFxVolatility([
      point({ rate: 1000, valid_from: '2026-06-01', deviation_pct: null }),
      point({ rate: 1100, valid_from: '2026-07-01', deviation_pct: 10 }),
      point({ rate: 1080, valid_from: '2026-08-01', deviation_pct: 1.8 }),
    ]);
    expect(summary.largest_single_move_pct).toBe(10);
  });

  it('is null for largest_single_move_pct when no point has a deviation recorded', () => {
    const summary = computeFxVolatility([point({ rate: 1000, valid_from: '2026-06-01', deviation_pct: null })]);
    expect(summary.largest_single_move_pct).toBeNull();
  });
});

describe('computeUsdExposure', () => {
  it('computes baseline monthly NGN cost at the current rate', () => {
    // 3 partners * $500 = $1500 = 150000 minor units; rate 1500 NGN/USD
    const result = computeUsdExposure(3, 150_000, 1500);
    expect(result.monthly_ngn_at_current_rate).toBeCloseTo(2_250_000, 2);
  });

  it('produces a sensitivity table across the standard rate shocks', () => {
    const result = computeUsdExposure(1, 100_000, 1000); // $1000/mo
    expect(result.sensitivity.map((s) => s.rate_change_pct)).toEqual([-10, -5, 0, 5, 10]);
    const zero = result.sensitivity.find((s) => s.rate_change_pct === 0)!;
    expect(zero.monthly_ngn).toBeCloseTo(result.monthly_ngn_at_current_rate, 2);
    expect(zero.delta_ngn).toBeCloseTo(0, 5);
  });

  it('shows a positive delta for a rate increase and negative for a decrease', () => {
    const result = computeUsdExposure(1, 100_000, 1000);
    const up10 = result.sensitivity.find((s) => s.rate_change_pct === 10)!;
    const down10 = result.sensitivity.find((s) => s.rate_change_pct === -10)!;
    expect(up10.delta_ngn).toBeGreaterThan(0);
    expect(down10.delta_ngn).toBeLessThan(0);
  });

  it('handles a zero rate without throwing', () => {
    const result = computeUsdExposure(0, 0, 0);
    expect(result.monthly_ngn_at_current_rate).toBe(0);
    expect(result.sensitivity.every((s) => s.monthly_ngn === 0)).toBe(true);
  });
});
