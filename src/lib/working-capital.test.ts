import { describe, it, expect } from 'vitest';
import {
  computeWorkingCapital, computeWaterfall, bandForCurrentRatio,
  type WorkingCapitalInput, type WaterfallInput,
} from './working-capital';

describe('computeWorkingCapital', () => {
  const input: WorkingCapitalInput = {
    cashOnHand: 5_000_000,
    accountsReceivable: 2_000_000,
    accountsPayable: 1_500_000,
    upcomingPayroll: 3_000_000,
  };

  it('computes current assets as cash + AR', () => {
    const result = computeWorkingCapital(input);
    expect(result.current_assets_ngn).toBe(7_000_000);
  });

  it('computes current liabilities as AP + payroll', () => {
    const result = computeWorkingCapital(input);
    expect(result.current_liabilities_ngn).toBe(4_500_000);
  });

  it('computes working capital as assets minus liabilities', () => {
    const result = computeWorkingCapital(input);
    expect(result.working_capital_ngn).toBe(2_500_000);
  });

  it('computes current ratio correctly', () => {
    const result = computeWorkingCapital(input);
    expect(result.current_ratio).toBeCloseTo(7_000_000 / 4_500_000, 2);
  });

  it('returns null ratios when liabilities are zero', () => {
    const result = computeWorkingCapital({ ...input, accountsPayable: 0, upcomingPayroll: 0 });
    expect(result.current_ratio).toBeNull();
    expect(result.quick_ratio).toBeNull();
  });

  it('can produce negative working capital', () => {
    const result = computeWorkingCapital({ cashOnHand: 500_000, accountsReceivable: 0, accountsPayable: 1_000_000, upcomingPayroll: 2_000_000 });
    expect(result.working_capital_ngn).toBeLessThan(0);
  });
});

describe('bandForCurrentRatio', () => {
  it('rates >= 2.0 as strong', () => {
    expect(bandForCurrentRatio(2.5)).toBe('strong');
  });

  it('rates 1.5-2.0 as adequate', () => {
    expect(bandForCurrentRatio(1.7)).toBe('adequate');
  });

  it('rates 1.0-1.5 as tight', () => {
    expect(bandForCurrentRatio(1.2)).toBe('tight');
  });

  it('rates below 1.0 as negative', () => {
    expect(bandForCurrentRatio(0.6)).toBe('negative');
  });

  it('treats null as tight', () => {
    expect(bandForCurrentRatio(null)).toBe('tight');
  });
});

describe('computeWaterfall', () => {
  const waterfallInput: WaterfallInput = {
    startingWc: 1_000_000,
    weeklyInflows: [200_000, 300_000, 0, 500_000],
    weeklyOutflows: [400_000, 300_000, 200_000, 100_000],
    startDate: new Date('2026-08-03'),
  };

  it('produces one entry per week', () => {
    const result = computeWaterfall(waterfallInput);
    expect(result).toHaveLength(4);
  });

  it('tracks running working capital correctly', () => {
    const result = computeWaterfall(waterfallInput);
    expect(result[0].running_wc_ngn).toBe(1_000_000 + (200_000 - 400_000));
    expect(result[1].running_wc_ngn).toBe(result[0].running_wc_ngn + (300_000 - 300_000));
  });

  it('labels the first week as "This week"', () => {
    const result = computeWaterfall(waterfallInput);
    expect(result[0].label).toBe('This week');
    expect(result[1].label).toBe('Week 2');
  });

  it('computes net as inflows minus outflows', () => {
    const result = computeWaterfall(waterfallInput);
    expect(result[0].net_ngn).toBe(-200_000);
    expect(result[3].net_ngn).toBe(400_000);
  });

  it('handles empty arrays', () => {
    const result = computeWaterfall({ startingWc: 0, weeklyInflows: [], weeklyOutflows: [], startDate: new Date() });
    expect(result).toHaveLength(0);
  });
});
