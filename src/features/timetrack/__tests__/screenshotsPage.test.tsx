import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ calls: [] as { gte?: string; lte?: string; limit?: number }[], total: 250, days: ['2026-11-27', '2026-11-26'] }));

vi.mock('@/lib/supabase', () => {
  const shots = () => {
    const call: { gte?: string; lte?: string; limit?: number } = {};
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.order = () => q;
    q.eq = () => q;
    q.gte = (_c: string, v: string) => { call.gte = v; return q; };
    q.lte = (_c: string, v: string) => { call.lte = v; return q; };
    q.limit = (n: number) => {
      call.limit = n; h.calls.push(call);
      const rows = Array.from({ length: Math.min(h.total, n) }, (_, i) => ({ id: `s${i}`, employee_id: 'u1', storage_path: `p${i}.png`, captured_at: `${h.days[i % 2]}T1${i % 10}:00:00`, time_activity_logs: { app_name: 'Chrome', url: null } }));
      return Promise.resolve({ data: rows, error: null, count: h.total });
    };
    return q;
  };
  return {
    supabase: {
      from: (t: string) => (t === 'time_screenshots' ? shots() : { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { retention_days: 30 } }) }) }) }),
      storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://x/y.png' } }), remove: async () => ({ error: null }) }) },
    },
  };
});
vi.mock('@/features/timetrack/lib/trackerEmployees', () => ({
  useActiveEmployees: () => ({ data: [{ id: 'u1', full_name: 'Ann Assigned' }] }),
  useFieldTeamIds: () => new Set<string>(),
}));
vi.mock('../lib/capabilities', () => ({ useTimetrackCapabilities: () => ({ has: () => true }) }));

import ScreenshotsPage from '../pages/activity/ScreenshotsPage';

const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><ScreenshotsPage /></MemoryRouter></QueryClientProvider>);

describe('Screenshots page', () => {
  beforeEach(() => { h.calls.length = 0; h.total = 250; });

  it('loads the newest 100 first and says how many there are in all', async () => {
    mount();
    await waitFor(() => expect(screen.getByText(/Showing the newest 100 of 250/)).toBeTruthy());
    expect(h.calls[0].limit).toBe(100);
    expect(screen.getAllByLabelText('Select screenshot')).toHaveLength(100);
  });

  it('"Show more" loads the next 100', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Show 100 more/ }));
    await waitFor(() => expect(h.calls.some((c) => c.limit === 200)).toBe(true));
    await waitFor(() => expect(screen.getByText(/Showing the newest 200 of 250/)).toBeTruthy());
  });

  it('with nothing in the range, says so in words', async () => {
    h.total = 0;
    mount();
    await waitFor(() => expect(screen.getByText(/No screenshots for/)).toBeTruthy());
    expect(screen.queryByText(/Show .* more/)).toBeNull();
  });

  it('has the previous and next arrows, and next is off while looking at today', async () => {
    mount();
    await screen.findByText(/Showing the newest/);
    expect((screen.getByLabelText('Next day or period') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Previous day or period') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByLabelText('Previous day or period'));
    await waitFor(() => expect((screen.getByLabelText('Next day or period') as HTMLButtonElement).disabled).toBe(false));
  });
});
