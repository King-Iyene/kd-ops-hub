import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { NUDGE_FIRST_MS, desktopVersionFromUa, isOlder, shouldNudge, useDesktopUpdateNudge } from '../desktopNudge';

const DAY = 24 * 60 * 60 * 1000;

describe('which version is the app', () => {
  it('reads it from the app\'s user-agent text, and is null in a normal browser', () => {
    expect(desktopVersionFromUa('Mozilla/5.0 Chrome/130 KDOfficeDesktop/0.3.8 KDOpsDesktop/0.3.8')).toBe('0.3.8');
    expect(desktopVersionFromUa('Mozilla/5.0 Chrome/130')).toBeNull();
    expect(desktopVersionFromUa('KDOfficeDesktop/0.2.1')).toBeNull(); // the very old Office-only app has no KD Ops tab
  });
  it('compares by number, not by letter', () => {
    expect(isOlder('0.3.8', '0.3.9')).toBe(true);
    expect(isOlder('0.3.9', '0.3.10')).toBe(true);
    expect(isOlder('0.10.0', '0.9.9')).toBe(false);
    expect(isOlder('1.0.0', '1.0.0')).toBe(false);
    expect(isOlder('0.3.9', '0.3.8')).toBe(false);
  });
});

describe('when to tell somebody', () => {
  const base = { current: '0.3.8', latest: '0.3.9', updateWaiting: false, lastShownAt: null, now: 10 * DAY };
  it('tells an app that is behind', () => expect(shouldNudge(base)).toBe(true));
  it('says nothing when the app is up to date or ahead, or either version is unknown', () => {
    expect(shouldNudge({ ...base, current: '0.3.9' })).toBe(false);
    expect(shouldNudge({ ...base, current: '0.4.0' })).toBe(false);
    expect(shouldNudge({ ...base, current: null })).toBe(false);
    expect(shouldNudge({ ...base, latest: null })).toBe(false);
  });
  it('says nothing when the app has already downloaded the update itself (it shows "restart to update")', () => {
    expect(shouldNudge({ ...base, updateWaiting: true })).toBe(false);
  });
  it('never nags: once a day at most, per version', () => {
    expect(shouldNudge({ ...base, lastShownAt: base.now - 1000 })).toBe(false);
    expect(shouldNudge({ ...base, lastShownAt: base.now - DAY - 1 })).toBe(true);
  });
});

const feed = vi.hoisted(() => ({ result: null as null | { url: string; file: string; version: string | null } }));
vi.mock('../desktopApp', async (orig) => ({ ...(await orig<typeof import('../desktopApp')>()), feedDownload: async () => feed.result, inDesktopApp: () => true, feedOsFor: () => 'windows' as const }));

describe('inside the desktop app', () => {
  beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); feed.result = { url: 'https://x/KD-Ops-Setup-0.3.9.exe', file: 'KD-Ops-Setup-0.3.9.exe', version: '0.3.9' }; Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 KDOpsDesktop/0.3.8', configurable: true }); });
  afterEach(() => { vi.useRealTimers(); });

  it('shows the message once, with a Download that saves the newest installer', async () => {
    const show = vi.fn();
    renderHook(() => useDesktopUpdateNudge(show));
    await vi.advanceTimersByTimeAsync(NUDGE_FIRST_MS + 1000);
    expect(show).toHaveBeenCalledTimes(1);
    expect(show.mock.calls[0][0]).toMatchObject({ current: '0.3.8', latest: '0.3.9' });
    await vi.advanceTimersByTimeAsync(5 * 60 * 60 * 1000); // checks again later, but not twice in a day
    expect(show).toHaveBeenCalledTimes(1);
  });
  it('does not speak before the app\'s own updater has had its time (and stays quiet if that update turned up)', async () => {
    const show = vi.fn();
    renderHook(() => useDesktopUpdateNudge(show));
    await vi.advanceTimersByTimeAsync(NUDGE_FIRST_MS - 5000);
    expect(show).not.toHaveBeenCalled();
  });
  it('says nothing when the feed has nothing yet, or the app is already up to date', async () => {
    feed.result = null;
    const a = vi.fn();
    renderHook(() => useDesktopUpdateNudge(a));
    await vi.advanceTimersByTimeAsync(NUDGE_FIRST_MS + 1000);
    expect(a).not.toHaveBeenCalled();
    feed.result = { url: 'u', file: 'f.exe', version: '0.3.8' };
    const b = vi.fn();
    renderHook(() => useDesktopUpdateNudge(b));
    await vi.advanceTimersByTimeAsync(NUDGE_FIRST_MS + 1000);
    expect(b).not.toHaveBeenCalled();
  });
});
