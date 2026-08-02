import { describe, it, expect } from 'vitest';
import { computeVendorSpend, type RawExpenseRow, type RawSubscriptionRow } from './vendor-spend';

const expenses: RawExpenseRow[] = [
  { category: 'hosting', amount_ngn: 50_000, date: '2026-07-15', description: 'AWS' },
  { category: 'hosting', amount_ngn: 30_000, date: '2026-07-10', description: 'AWS' },
  { category: 'telecom', amount_ngn: 20_000, date: '2026-06-01', description: 'MTN Airtime' },
  { category: 'office', amount_ngn: 15_000, date: '2026-07-20', description: 'Staples Order' },
];

const subscriptions: RawSubscriptionRow[] = [
  { name: 'GitHub Team', vendor: 'GitHub', category: 'software', amount_ngn: 25_000, billing_cycle: 'monthly', status: 'active' },
  { name: 'Slack Business', vendor: 'Slack', category: 'software', amount_ngn: 45_000, billing_cycle: 'monthly', status: 'active' },
  { name: 'Jira', vendor: null, category: 'software', amount_ngn: 36_000, billing_cycle: 'yearly', status: 'active' },
  { name: 'Old Tool', vendor: 'Legacy', category: 'software', amount_ngn: 10_000, billing_cycle: 'monthly', status: 'cancelled' },
];

describe('computeVendorSpend', () => {
  it('aggregates expenses by vendor (description)', () => {
    const result = computeVendorSpend(expenses, [], 12);
    const aws = result.topVendors.find((v) => v.vendor.toLowerCase() === 'aws');
    expect(aws).toBeDefined();
    expect(aws!.total_ngn).toBe(80_000);
    expect(aws!.transaction_count).toBe(2);
  });

  it('includes active subscriptions annualized', () => {
    const result = computeVendorSpend([], subscriptions, 12);
    const github = result.topVendors.find((v) => v.vendor.toLowerCase() === 'github');
    expect(github).toBeDefined();
    expect(github!.total_ngn).toBe(25_000 * 12);
  });

  it('excludes cancelled subscriptions', () => {
    const result = computeVendorSpend([], subscriptions, 12);
    const legacy = result.topVendors.find((v) => v.vendor.toLowerCase() === 'legacy');
    expect(legacy).toBeUndefined();
  });

  it('normalises yearly subscriptions to monthly', () => {
    const result = computeVendorSpend([], subscriptions, 12);
    const jira = result.topVendors.find((v) => v.vendor.toLowerCase() === 'jira');
    expect(jira).toBeDefined();
    expect(jira!.avg_monthly_ngn).toBeCloseTo(3_000, 0);
  });

  it('detects consolidation opportunities (multiple vendors in same category)', () => {
    const result = computeVendorSpend([], subscriptions, 12);
    const softwareConsolidation = result.consolidation.find((c) => c.category === 'software');
    expect(softwareConsolidation).toBeDefined();
    expect(softwareConsolidation!.vendors.length).toBeGreaterThanOrEqual(2);
  });

  it('sorts top vendors by total spend descending', () => {
    const result = computeVendorSpend(expenses, subscriptions, 12);
    for (let i = 1; i < result.topVendors.length; i++) {
      expect(result.topVendors[i - 1].total_ngn).toBeGreaterThanOrEqual(result.topVendors[i].total_ngn);
    }
  });

  it('returns trends for top 10 vendors', () => {
    const result = computeVendorSpend(expenses, subscriptions, 12);
    expect(result.trends.length).toBeLessThanOrEqual(10);
    expect(result.trends.length).toBeGreaterThan(0);
  });

  it('handles empty inputs', () => {
    const result = computeVendorSpend([], [], 12);
    expect(result.topVendors).toHaveLength(0);
    expect(result.total_spend_ngn).toBe(0);
    expect(result.vendor_count).toBe(0);
  });

  it('counts total vendors', () => {
    const result = computeVendorSpend(expenses, subscriptions, 12);
    expect(result.vendor_count).toBeGreaterThan(0);
  });
});
