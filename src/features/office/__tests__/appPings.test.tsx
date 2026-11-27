import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({
  insert: vi.fn(async (_row: unknown) => ({ error: null as null | { message: string } })),
  handler: null as null | ((p: { new: unknown }) => void),
  removed: vi.fn(),
  profile: { full_name: 'Kelvin Sampson', email: 'k@x.com' },
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (t: string) => t === 'profiles'
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.profile }) }) }) }
      : { insert: h.insert },
    channel: () => { const c = { on: (_e: string, _f: unknown, cb: (p: { new: unknown }) => void) => { h.handler = cb; return c; }, subscribe: () => c }; return c; },
    removeChannel: h.removed,
  },
}));
const sounds = vi.hoisted(() => ({ wave: vi.fn(), ring: vi.fn(), notify: vi.fn() }));
vi.mock('../chime', () => ({ playWave: sounds.wave, playRing: sounds.ring }));
vi.mock('../notify', () => ({ notifyPing: sounds.notify }));

import { parseAppPing, pingMode, sendAppPing, useAppPings } from '../appPings';

const NOW = Date.parse('2026-11-27T12:00:00Z');
const row = (o: Record<string, unknown> = {}) => ({ id: 'p1', from_id: 'kelvin', to_id: 'me', kind: 'wave', created_at: new Date(NOW - 2000).toISOString(), ...o });
const wrap = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

beforeEach(() => { localStorage.clear(); h.handler = null; Object.values(sounds).forEach((f) => f.mockClear()); h.insert.mockClear(); });
afterEach(() => vi.restoreAllMocks());

describe('reading a wave from the network', () => {
  it('accepts a recent wave or ring addressed to me', () => {
    expect(parseAppPing(row(), 'me', NOW)).toEqual({ id: 'p1', from: 'kelvin', kind: 'wave', at: NOW - 2000 });
    expect(parseAppPing(row({ kind: 'ring' }), 'me', NOW)?.kind).toBe('ring');
  });
  it('refuses anything else: other people, myself, stale, odd kinds, junk', () => {
    expect(parseAppPing(row({ to_id: 'someone' }), 'me', NOW)).toBeNull();
    expect(parseAppPing(row({ from_id: 'me' }), 'me', NOW)).toBeNull();
    expect(parseAppPing(row({ created_at: new Date(NOW - 10 * 60_000).toISOString() }), 'me', NOW)).toBeNull();
    expect(parseAppPing(row({ kind: 'delete everything' }), 'me', NOW)).toBeNull();
    expect(parseAppPing(row({ created_at: 'not a date' }), 'me', NOW)).toBeNull();
    expect(parseAppPing(null, 'me', NOW)).toBeNull();
    expect(parseAppPing({ id: 1 }, 'me', NOW)).toBeNull();
  });
});

describe('sending', () => {
  it('saves the wave and says so; a too-quick repeat is "slow"; anything else is "failed"', async () => {
    expect(await sendAppPing('kelvin', 'wave')).toBe('sent');
    expect(h.insert).toHaveBeenCalledWith({ to_id: 'kelvin', kind: 'wave' });
    h.insert.mockResolvedValueOnce({ error: { message: 'Slow down a little' } });
    expect(await sendAppPing('kelvin', 'wave')).toBe('slow');
    h.insert.mockResolvedValueOnce({ error: { message: 'permission denied' } });
    expect(await sendAppPing('kelvin', 'ring')).toBe('failed');
    h.insert.mockRejectedValueOnce(new Error('offline'));
    expect(await sendAppPing('kelvin', 'ring')).toBe('failed');
  });
});

describe('status decides how loud', () => {
  it('reads my own status', () => {
    expect(pingMode()).toBe('normal');
    localStorage.setItem('kd:office:status', 'focus'); expect(pingMode()).toBe('quiet');
    localStorage.setItem('kd:office:status', 'meeting'); expect(pingMode()).toBe('quiet');
    localStorage.setItem('kd:office:status', 'dnd'); expect(pingMode()).toBe('dnd');
  });
});

describe('hearing a wave on any page', () => {
  const live = () => new Date().toISOString();
  it('plays the wave sound, notifies, and shows the sender by name', async () => {
    const show = vi.fn();
    renderHook(() => useAppPings('me', show), { wrapper: wrap });
    expect(h.handler).toBeTruthy();
    h.handler!({ new: row({ created_at: live() }) });
    await waitFor(() => expect(show).toHaveBeenCalledTimes(1));
    expect(show.mock.calls[0][0]).toMatchObject({ kind: 'wave', name: 'Kelvin Sampson' });
    expect(sounds.wave).toHaveBeenCalledTimes(1);
    expect(sounds.notify).toHaveBeenCalledTimes(1);
  });
  it('a ring uses the ring sound; the same row twice is shown once', async () => {
    const show = vi.fn();
    renderHook(() => useAppPings('me', show), { wrapper: wrap });
    h.handler!({ new: row({ id: 'r1', kind: 'ring', created_at: live() }) });
    h.handler!({ new: row({ id: 'r1', kind: 'ring', created_at: live() }) });
    await waitFor(() => expect(show).toHaveBeenCalled());
    expect(show).toHaveBeenCalledTimes(1);
    expect(sounds.ring).toHaveBeenCalledTimes(1);
  });
  it('is silent in a meeting (shown, no sound) and gets nothing on Do not disturb', async () => {
    const show = vi.fn();
    renderHook(() => useAppPings('me', show), { wrapper: wrap });
    localStorage.setItem('kd:office:status', 'meeting');
    h.handler!({ new: row({ id: 'a', created_at: live() }) });
    await waitFor(() => expect(show).toHaveBeenCalledTimes(1));
    expect(sounds.wave).not.toHaveBeenCalled();
    localStorage.setItem('kd:office:status', 'dnd');
    h.handler!({ new: row({ id: 'b', created_at: live() }) });
    await new Promise((r) => setTimeout(r, 30));
    expect(show).toHaveBeenCalledTimes(1);
  });
  it('ignores a wave that is old or for someone else, and stops listening when the page closes', async () => {
    const show = vi.fn();
    const { unmount } = renderHook(() => useAppPings('me', show), { wrapper: wrap });
    h.handler!({ new: row({ id: 'old', created_at: new Date(Date.now() - 600_000).toISOString() }) });
    h.handler!({ new: row({ id: 'other', to_id: 'x', created_at: live() }) });
    await new Promise((r) => setTimeout(r, 30));
    expect(show).not.toHaveBeenCalled();
    unmount();
    expect(h.removed).toHaveBeenCalled();
  });
  it('does not listen at all when nobody is signed in', () => {
    renderHook(() => useAppPings(undefined, vi.fn()), { wrapper: wrap });
    expect(h.handler).toBeNull();
  });
});
