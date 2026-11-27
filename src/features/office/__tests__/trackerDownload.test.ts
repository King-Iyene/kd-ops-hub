import { afterEach, describe, expect, it, vi } from 'vitest';
import { TRACKER_OSES, fetchTrackerVersion, startTrackerDownload, trackerFeedFolder, trackerOsFor } from '@/features/timetrack/lib/trackerDownload';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.innerHTML = ''; });

const WIN_YML = 'version: 1.0.29\nfiles:\n  - url: KD-Ops-Time-Tracker-Setup-1.0.29.exe\n    sha512: a\npath: KD-Ops-Time-Tracker-Setup-1.0.29.exe\n';

describe('Time Tracker download', () => {
  it('reads the feed on our own storage, never GitHub', () => {
    expect(trackerFeedFolder()).toContain('/storage/v1/object/public/desktop-app/updates/tracker');
    expect(trackerFeedFolder().toLowerCase()).not.toContain('github');
    expect(TRACKER_OSES.map((o) => o.os)).toEqual(['windows', 'mac', 'linux']);
  });
  it('knows which system this computer runs, and nothing for a phone', () => {
    expect(trackerOsFor('Mozilla/5.0 (Windows NT 10.0; Win64) Win32')).toBe('windows');
    expect(trackerOsFor('Mozilla/5.0 (iPhone; CPU iPhone OS 17) iPhone')).toBeNull();
  });
  it('reads the version from the feed and ignores a missing or broken one', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => WIN_YML })));
    expect(await fetchTrackerVersion()).toBe('1.0.29');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    expect(await fetchTrackerVersion()).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await fetchTrackerVersion()).toBeNull();
  });
  it('starts the download in place when the feed has the file, and says not-ready (opening nothing) when it does not', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => WIN_YML })));
    expect(await startTrackerDownload('windows')).toBe('started');
    expect(click).toHaveBeenCalledTimes(1);
    click.mockClear();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    expect(await startTrackerDownload('mac')).toBe('not-ready');
    expect(click).not.toHaveBeenCalled();
  });
});
