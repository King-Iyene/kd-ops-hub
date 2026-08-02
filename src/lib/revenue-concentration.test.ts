import { describe, it, expect } from 'vitest';
import { computeConcentration, bandForHhi, type ClientRevenue } from './revenue-concentration';

describe('bandForHhi', () => {
  it('classifies low HHI as diversified', () => {
    expect(bandForHhi(800)).toBe('diversified');
  });

  it('classifies moderate HHI', () => {
    expect(bandForHhi(2000)).toBe('moderate');
  });

  it('classifies high HHI as concentrated', () => {
    expect(bandForHhi(5000)).toBe('concentrated');
  });

  it('boundary: 1500 is moderate', () => {
    expect(bandForHhi(1500)).toBe('moderate');
  });

  it('boundary: 2500 is moderate', () => {
    expect(bandForHhi(2500)).toBe('moderate');
  });

  it('boundary: 2501 is concentrated', () => {
    expect(bandForHhi(2501)).toBe('concentrated');
  });
});

describe('computeConcentration', () => {
  it('returns zeroed result for empty client list', () => {
    const result = computeConcentration([]);
    expect(result.hhi).toBe(0);
    expect(result.band).toBe('diversified');
    expect(result.client_count).toBe(0);
    expect(result.top_client_pct).toBeNull();
    expect(result.top3_pct).toBeNull();
  });

  it('returns 10000 HHI for a single client (perfect concentration)', () => {
    const clients: ClientRevenue[] = [
      { client_id: 'a', client_name: 'Acme', total_ngn: 1_000_000 },
    ];
    const result = computeConcentration(clients);
    expect(result.hhi).toBe(10000);
    expect(result.band).toBe('concentrated');
    expect(result.top_client_pct).toBeCloseTo(100, 0);
    expect(result.top3_pct).toBeNull();
  });

  it('returns low HHI for many equal clients', () => {
    const clients: ClientRevenue[] = Array.from({ length: 20 }, (_, i) => ({
      client_id: `c${i}`,
      client_name: `Client ${i}`,
      total_ngn: 100_000,
    }));
    const result = computeConcentration(clients);
    expect(result.hhi).toBe(500);
    expect(result.band).toBe('diversified');
    expect(result.top_client_pct).toBeCloseTo(5, 0);
    expect(result.top3_pct).toBeCloseTo(15, 0);
  });

  it('sorts clients by share descending', () => {
    const clients: ClientRevenue[] = [
      { client_id: 'a', client_name: 'Small', total_ngn: 10_000 },
      { client_id: 'b', client_name: 'Big', total_ngn: 90_000 },
    ];
    const result = computeConcentration(clients);
    expect(result.clients[0].client_name).toBe('Big');
    expect(result.clients[1].client_name).toBe('Small');
  });

  it('computes correct HHI for two unequal clients', () => {
    const clients: ClientRevenue[] = [
      { client_id: 'a', client_name: 'A', total_ngn: 700_000 },
      { client_id: 'b', client_name: 'B', total_ngn: 300_000 },
    ];
    const result = computeConcentration(clients);
    expect(result.hhi).toBe(5800);
    expect(result.band).toBe('concentrated');
    expect(result.top_client_pct).toBeCloseTo(70, 0);
  });

  it('handles zero-revenue clients gracefully', () => {
    const clients: ClientRevenue[] = [
      { client_id: 'a', client_name: 'A', total_ngn: 0 },
    ];
    const result = computeConcentration(clients);
    expect(result.hhi).toBe(0);
    expect(result.client_count).toBe(0);
  });

  it('includes total_revenue_ngn in result', () => {
    const clients: ClientRevenue[] = [
      { client_id: 'a', client_name: 'A', total_ngn: 500_000 },
      { client_id: 'b', client_name: 'B', total_ngn: 500_000 },
    ];
    const result = computeConcentration(clients);
    expect(result.total_revenue_ngn).toBe(1_000_000);
  });

  it('top3_pct is null when fewer than 3 clients', () => {
    const clients: ClientRevenue[] = [
      { client_id: 'a', client_name: 'A', total_ngn: 500_000 },
      { client_id: 'b', client_name: 'B', total_ngn: 500_000 },
    ];
    const result = computeConcentration(clients);
    expect(result.top3_pct).toBeNull();
  });
});
