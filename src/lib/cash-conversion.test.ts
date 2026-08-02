import { describe, it, expect } from 'vitest';
import {
  computeDso, computeDpo, computeCashConversion, bandForCcc,
  type DsoInput, type DpoInput,
} from './cash-conversion';

describe('computeDso', () => {
  it('calculates DSO from receivables and trailing revenue', () => {
    const result = computeDso({ outstandingReceivables: 500_000, trailingRevenue: 3_000_000, trailingDays: 90 });
    expect(result.dso_days).toBeCloseTo(15, 0);
  });

  it('returns null DSO when trailing revenue is zero', () => {
    const result = computeDso({ outstandingReceivables: 500_000, trailingRevenue: 0, trailingDays: 90 });
    expect(result.dso_days).toBeNull();
  });

  it('returns null DSO when trailing days is zero', () => {
    const result = computeDso({ outstandingReceivables: 500_000, trailingRevenue: 3_000_000, trailingDays: 0 });
    expect(result.dso_days).toBeNull();
  });

  it('returns zero DSO when no receivables', () => {
    const result = computeDso({ outstandingReceivables: 0, trailingRevenue: 3_000_000, trailingDays: 90 });
    expect(result.dso_days).toBe(0);
  });
});

describe('computeDpo', () => {
  it('calculates DPO from payables and trailing cost', () => {
    const result = computeDpo({ outstandingPayables: 200_000, trailingCost: 1_800_000, trailingDays: 90 });
    expect(result.dpo_days).toBeCloseTo(10, 0);
  });

  it('returns null DPO when trailing cost is zero', () => {
    const result = computeDpo({ outstandingPayables: 200_000, trailingCost: 0, trailingDays: 90 });
    expect(result.dpo_days).toBeNull();
  });

  it('returns zero DPO when no payables', () => {
    const result = computeDpo({ outstandingPayables: 0, trailingCost: 1_800_000, trailingDays: 90 });
    expect(result.dpo_days).toBe(0);
  });
});

describe('bandForCcc', () => {
  it('rates negative CCC as excellent', () => {
    expect(bandForCcc(-5)).toBe('excellent');
  });

  it('rates zero CCC as excellent', () => {
    expect(bandForCcc(0)).toBe('excellent');
  });

  it('rates 15 days as good', () => {
    expect(bandForCcc(15)).toBe('good');
  });

  it('rates 45 days as fair', () => {
    expect(bandForCcc(45)).toBe('fair');
  });

  it('rates 90 days as poor', () => {
    expect(bandForCcc(90)).toBe('poor');
  });

  it('treats null as fair', () => {
    expect(bandForCcc(null)).toBe('fair');
  });
});

describe('computeCashConversion', () => {
  const dsoInput: DsoInput = { outstandingReceivables: 900_000, trailingRevenue: 6_000_000, trailingDays: 90 };
  const dpoInput: DpoInput = { outstandingPayables: 300_000, trailingCost: 2_700_000, trailingDays: 90 };

  it('computes CCC as DSO minus DPO', () => {
    const result = computeCashConversion(dsoInput, dpoInput);
    expect(result.dso.dso_days).toBeCloseTo(13.5, 1);
    expect(result.dpo.dpo_days).toBeCloseTo(10, 1);
    expect(result.ccc_days).toBeCloseTo(3.5, 1);
    expect(result.band).toBe('good');
  });

  it('returns DSO alone when DPO is null', () => {
    const result = computeCashConversion(dsoInput, { outstandingPayables: 0, trailingCost: 0, trailingDays: 90 });
    expect(result.ccc_days).toBeCloseTo(13.5, 1);
  });

  it('returns null CCC when both DSO and DPO are null', () => {
    const result = computeCashConversion(
      { outstandingReceivables: 0, trailingRevenue: 0, trailingDays: 90 },
      { outstandingPayables: 0, trailingCost: 0, trailingDays: 90 },
    );
    expect(result.ccc_days).toBeNull();
    expect(result.band).toBe('fair');
  });

  it('can produce negative CCC (excellent) when DPO exceeds DSO', () => {
    const result = computeCashConversion(
      { outstandingReceivables: 100_000, trailingRevenue: 3_000_000, trailingDays: 90 },
      { outstandingPayables: 600_000, trailingCost: 2_700_000, trailingDays: 90 },
    );
    expect(result.ccc_days!).toBeLessThan(0);
    expect(result.band).toBe('excellent');
  });
});
