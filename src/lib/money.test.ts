import { describe, it, expect } from 'vitest';
import {
  toMinor,
  toMajor,
  convertMinor,
  usdMinorToNgnMinor,
  multiplyMinor,
  sumMinor,
  roundHalfAwayFromZero,
  formatUsdMinor,
  formatNgnMinor,
  tieredCommissionMinor,
} from './money';

describe('money: minor-unit conversion', () => {
  it('toMinor handles float noise', () => {
    expect(toMinor(199.99)).toBe(19999);
    expect(toMinor(0.1)).toBe(10);
    expect(toMinor(0.07)).toBe(7);
    expect(toMinor(1500)).toBe(150000);
    expect(toMinor(0)).toBe(0);
  });

  it('toMajor inverts toMinor', () => {
    expect(toMajor(19999)).toBe(199.99);
    expect(toMajor(150000)).toBe(1500);
  });

  it('roundHalfAwayFromZero rounds .5 up for positives', () => {
    expect(roundHalfAwayFromZero(1500.5)).toBe(1501);
    expect(roundHalfAwayFromZero(1500.4)).toBe(1500);
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
  });
});

describe('money: FX conversion (USD→NGN)', () => {
  it('$100 at ₦1500/USD = ₦150,000 exactly', () => {
    // $100 = 10000 cents; → 15,000,000 kobo = ₦150,000.00
    expect(usdMinorToNgnMinor(10000, 1500)).toBe(15000000);
    expect(formatNgnMinor(15000000)).toBe('₦150,000.00');
  });

  it('rounds to the nearest kobo with a fractional rate', () => {
    // 1 cent ($0.01) at 1500.5 → 1500.5 kobo → rounds to 1501 kobo = ₦15.01
    expect(usdMinorToNgnMinor(1, 1500.5)).toBe(1501);
  });

  it('convertMinor returns the rate used for snapshotting', () => {
    const { minor, rate } = convertMinor(25000, 1623.75); // $250 at 1623.75
    expect(minor).toBe(40593750); // 25000 * 1623.75 = 40,593,750 kobo
    expect(rate).toBe(1623.75);
  });

  it('rejects bad inputs', () => {
    expect(() => convertMinor(10000, 0)).toThrow();
    expect(() => convertMinor(10000, -5)).toThrow();
    expect(() => convertMinor(100.5, 1500)).toThrow(); // non-integer minor
  });
});

describe('money: aggregation', () => {
  it('multiplyMinor across active partners is exact', () => {
    // $500/partner = 50000 cents × 37 active = 1,850,000 cents
    expect(multiplyMinor(50000, 37)).toBe(1850000);
    expect(formatUsdMinor(1850000)).toBe('$18,500.00');
  });

  it('multiplyMinor rejects non-integers / negatives', () => {
    expect(() => multiplyMinor(50000.5, 10)).toThrow();
    expect(() => multiplyMinor(50000, -1)).toThrow();
  });

  it('sumMinor adds without drift', () => {
    expect(sumMinor([19999, 1, 0, 150000])).toBe(170000);
  });

  it('end-to-end: 37 partners × $500 → NGN at 1500', () => {
    const perPartnerUsd = toMinor(500);            // 50000 cents
    const totalUsd = multiplyMinor(perPartnerUsd, 37); // 1,850,000 cents
    const totalNgn = usdMinorToNgnMinor(totalUsd, 1500); // 2,775,000,000 kobo
    expect(totalNgn).toBe(2775000000);
    expect(formatNgnMinor(totalNgn)).toBe('₦27,750,000.00');
  });
});

describe('money: tiered affiliate commission', () => {
  // base $2/account = 200 cents; increased $3/account = 300 cents; threshold 50.
  const BASE = 200;
  const TIER2 = 300;
  const T = 50;

  it('below threshold pays base on every account (both modes)', () => {
    expect(tieredCommissionMinor(30, BASE, TIER2, T, 'marginal')).toBe(200 * 30);
    expect(tieredCommissionMinor(30, BASE, TIER2, T, 'whole')).toBe(200 * 30);
  });

  it('exactly at threshold: marginal still all base; whole flips to increased', () => {
    expect(tieredCommissionMinor(50, BASE, TIER2, T, 'marginal')).toBe(200 * 50);
    expect(tieredCommissionMinor(50, BASE, TIER2, T, 'whole')).toBe(300 * 50);
  });

  it('above threshold: marginal splits base + increased on the excess', () => {
    // 60 accounts: 50 × $2 + 10 × $3 = 10000 + 3000 = 13000 cents
    expect(tieredCommissionMinor(60, BASE, TIER2, T, 'marginal')).toBe(200 * 50 + 300 * 10);
  });

  it('above threshold: whole-tier pays increased on all accounts', () => {
    // 60 accounts × $3 = 18000 cents
    expect(tieredCommissionMinor(60, BASE, TIER2, T, 'whole')).toBe(300 * 60);
  });

  it('zero accounts pays nothing', () => {
    expect(tieredCommissionMinor(0, BASE, TIER2, T, 'marginal')).toBe(0);
    expect(tieredCommissionMinor(0, BASE, TIER2, T, 'whole')).toBe(0);
  });

  it('when tier2 equals base (unset increase), result is flat base in both modes', () => {
    expect(tieredCommissionMinor(80, BASE, BASE, T, 'marginal')).toBe(200 * 80);
    expect(tieredCommissionMinor(80, BASE, BASE, T, 'whole')).toBe(200 * 80);
  });

  it('rejects bad inputs', () => {
    expect(() => tieredCommissionMinor(-1, BASE, TIER2, T, 'marginal')).toThrow();
    expect(() => tieredCommissionMinor(10.5, BASE, TIER2, T, 'marginal')).toThrow();
    expect(() => tieredCommissionMinor(10, 200.5, TIER2, T, 'marginal')).toThrow();
    expect(() => tieredCommissionMinor(10, BASE, TIER2, -5, 'marginal')).toThrow();
  });
});
