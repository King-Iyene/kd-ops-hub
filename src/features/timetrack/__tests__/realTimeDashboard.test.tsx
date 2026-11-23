import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ calls: [] as { gte?: string; lt?: string; from?: number }[], total: 1500 }));

vi.mock('@/lib/supabase', () => {
  const entriesQuery = () => {
    const call: { gte?: string; lt?: string; from?: number } = {};
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.order = () => q;
    q.gte = (_c: string, v: string) => { call.gte = v; return q; };
    q.lt = (_c: string, v: string) => { call.lt = v; return q; };
    q.range = (from: number, to: number) => {
      call.from = from; h.calls.push(call);
      const rows = Array.from({ length: Math.max(0, Math.min(h.total, to + 1) - from) }, (_, i) => ({
        id: `e${from + i}`, employee_id: 'u1', start_time: '2026-11-10T10:00:00', end_time: '2026-11-10T11:00:00', duration_minutes: 60, is_billable: true,
        time_tasks: { time_projects: { name: 'Proj' } },
      }));
      return Promise.resolve({ data: rows, error: null });
    };
    return q;
  };
  return {
    supabase: {
      from: (t: string) => (t === 'time_entries' ? entriesQuery() : { select: () => Promise.resolve({ data: [{ id: 'u1', full_name: 'Ann Assigned' }], error: null }) }),
    },
  };
});
vi.mock('@/features/timetrack/lib/trackerEmployees', () => ({ useCompanyEmployeeIds: () => null }));
vi.mock('@/features/timetrack/ui/charts', () => ({ RankedBars: () => <div />, TrendLine: ({ data }: { data: unknown[] }) => <div data-testid="trend">{data.length}</div> }));
vi.mock('@/features/timetrack/ui/TrackerPageHeader', () => ({ PageHeader: ({ title, description }: { title: string; description: string }) => <div><h1>{title}</h1><p data-testid="desc">{description}</p></div> }));

import RealTimeDashboardPage from '../pages/reports/RealTimeDashboardPage';

const renderPage = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><RealTimeDashboardPage /></MemoryRouter>
  </QueryClientProvider>,
);

describe('Real-time Dashboard', () => {
  beforeEach(() => { h.calls = []; h.total = 1500; });

  it('offers the six quick ranges and a custom one, not a list of months', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('combobox'));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['This month', 'Last month', 'This week', 'Last week', 'This year', 'Last year', 'Custom range…']);
  });

  it('reads every entry in the range, not only the first 1000', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByText('1500h').length).toBeGreaterThan(0)); // 1,500 entries of one hour: all of them, not the first 1000
    expect(h.calls.map((c) => c.from)).toEqual([0, 1000]);
  });

  it('changing the range reads that range', async () => {
    renderPage();
    await waitFor(() => expect(h.calls.length).toBeGreaterThan(0));
    h.calls = [];
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Last year' }));
    await waitFor(() => expect(h.calls.length).toBeGreaterThan(0));
    const year = new Date().getFullYear() - 1;
    expect(h.calls[0].gte).toBe(`${year}-01-01T00:00:00`);
    expect(h.calls[0].lt).toBe(`${year + 1}-01-01T00:00:00`);
    expect(screen.getByTestId('desc')).toHaveTextContent(`1 Jan ${year} to 31 Dec ${year}`);
  });
});
