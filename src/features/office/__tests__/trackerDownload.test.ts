import { afterEach, describe, expect, it, vi } from 'vitest';
import { TRACKER_OSES, fetchTrackerVersion, startTrackerDownload, trackerOsFor, trackerUrl } from '@/features/timetrack/lib/trackerDownload';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('Time Tracker download', () => {
  it('only ever points at our own storage, never at GitHub', () => {
    for (const { os } of TRACKER_OSES) {
      const u = trackerUrl(os, '1.0.28');
      expect(u).toContain('/storage/v1/object/public/desktop-app/');
      expect(u.toLowerCase()).not.toContain('github');
      expect(u).toContain('?download=KD-Ops-Time-Tracker-1.0.28.');
    }
    expect(trackerUrl('windows', null)).toContain('download=KD-Ops-Time-Tracker.exe');
  });

  it('knows which system this computer runs, and nothing for a phone', () => {
    expect(trackerOsFor('Mozilla/5.0 (Windows NT 10.0; Win64) Win32')).toBe('windows');
    expect(trackerOsFor('Mozilla/5.0 (Macintosh; Intel Mac OS X) MacIntel')).toBe('mac');
    expect(trackerOsFor('Mozilla/5.0 (X11; Linux x86_64) Linux')).toBe('linux');
    expect(trackerOsFor('Mozilla/5.0 (iPhone; CPU iPhone OS 17) iPhone')).toBeNull();
  });

  it('reads the version from our storage and ignores anything odd', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ version: '1.0.28' }) })));
    expect(await fetchTrackerVersion()).toBe('1.0.28');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ version: '<script>' }) })));
    expect(await fetchTrackerVersion()).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    expect(await fetchTrackerVersion()).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await fetchTrackerVersion()).toBeNull();
  });

  it('starts the download in place when the file is there, and says not-ready (opening nothing) when it is not', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
    expect(await startTrackerDownload('windows', '1.0.28')).toBe('started');
    expect(click).toHaveBeenCalledTimes(1);
    click.mockClear();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    expect(await startTrackerDownload('mac', '1.0.28')).toBe('not-ready');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('x'); }));
    expect(await startTrackerDownload('linux', null)).toBe('not-ready');
    expect(click).not.toHaveBeenCalled();
  });
});
