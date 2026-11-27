import { afterEach, describe, expect, it, vi } from 'vitest';
import { desktopLabel, feedDownload, feedOsFor, feedUrl, installDesktopUpdate, onDesktopUpdate, readFeed, startDesktopDownload } from '../desktopApp';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.innerHTML = ''; });

const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Win32';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) MacIntel';
const LIN = 'Mozilla/5.0 (X11; Linux x86_64) Linux x86_64';

describe('which computer is this', () => {
  it('knows Windows, Mac and Linux, and nothing for a phone or an odd system', () => {
    expect(feedOsFor(WIN)).toBe('windows');
    expect(feedOsFor(MAC)).toBe('mac');
    expect(feedOsFor(LIN)).toBe('linux');
    expect(feedOsFor('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBeNull();
    expect(feedOsFor('something odd')).toBeNull();
    expect(desktopLabel(WIN)).toBe('Windows');
    expect(desktopLabel('something odd')).toBe('computer');
  });
});

describe('reading the update feed', () => {
  const win = "version: 0.3.9\nfiles:\n  - url: KD-Ops-Setup-0.3.9.exe\n    sha512: abc\n    size: 123\npath: KD-Ops-Setup-0.3.9.exe\nsha512: abc\nreleaseDate: '2026-11-27T10:00:00.000Z'\n";
  const mac = "version: 0.3.9\nfiles:\n  - url: KD-Ops-0.3.9-arm64-mac.zip\n    sha512: a\n  - url: KD-Ops-0.3.9.dmg\n    sha512: b\npath: KD-Ops-0.3.9-arm64-mac.zip\n";
  it('reads the version and the files', () => {
    expect(readFeed(win)).toEqual({ version: '0.3.9', files: ['KD-Ops-Setup-0.3.9.exe'] });
    expect(readFeed(mac).files).toEqual(['KD-Ops-0.3.9-arm64-mac.zip', 'KD-Ops-0.3.9.dmg']);
    expect(readFeed("version: '1.0.29'\npath: \"A-1.0.29.exe\"\n")).toEqual({ version: '1.0.29', files: ['A-1.0.29.exe'] });
    expect(readFeed('nothing useful')).toEqual({ version: null, files: [] });
  });
  it('finds the newest installer for each system, on our own storage, never GitHub', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => ({ ok: true, text: async () => (String(u).endsWith('latest-mac.yml') ? mac : win) })));
    const w = await feedDownload('office', 'windows');
    expect(w).toMatchObject({ file: 'KD-Ops-Setup-0.3.9.exe', version: '0.3.9' });
    expect(w!.url).toContain('/storage/v1/object/public/desktop-app/updates/office/KD-Ops-Setup-0.3.9.exe?download=KD-Ops-Setup-0.3.9.exe');
    const m = await feedDownload('office', 'mac'); // the mac feed lists a zip (for updates) and a dmg (for people): people get the dmg
    expect(m!.file).toBe('KD-Ops-0.3.9.dmg');
    expect(`${w!.url}${m!.url}`.toLowerCase()).not.toContain('github');
    expect(feedUrl('tracker')).toContain('/updates/tracker');
  });
  it('says nothing is ready when the feed is missing, broken or has no installer for the system', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    expect(await feedDownload('office', 'windows')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await feedDownload('office', 'windows')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => 'version: 1.0.0\nfiles: []\n' })));
    expect(await feedDownload('office', 'linux')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => 'version: 1.0.0\npath: ../../evil.exe\n' })));
    expect(await feedDownload('office', 'windows')).toBeNull(); // a name that tries to leave the folder is refused
  });
});

describe('the Download button', () => {
  it('starts the download in place, says phone on a phone, and not-ready when the feed has nothing', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => 'version: 0.3.9\npath: KD-Ops-Setup-0.3.9.exe\n' })));
    expect(await startDesktopDownload(WIN)).toBe('started');
    expect(click).toHaveBeenCalledTimes(1);
    expect(await startDesktopDownload('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('phone');
    click.mockClear();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    expect(await startDesktopDownload(WIN)).toBe('not-ready');
    expect(click).not.toHaveBeenCalled();
  });
});

describe('desktop app update bridge', () => {
  it('does nothing in a browser (no desktop app around)', () => {
    let called = false;
    const off = onDesktopUpdate(() => { called = true; });
    installDesktopUpdate();
    off();
    expect(called).toBe(false);
  });
  it('passes the waiting version on, and null when there is none', () => {
    const seen: Array<string | null> = [];
    (globalThis as unknown as { window: unknown }).window = {
      kdDesktop: { onUpdate: (cb: (v: unknown) => void) => { cb('0.3.7'); cb(null); cb(42); return () => undefined; }, installUpdate: () => { seen.push('install'); } },
    };
    try {
      onDesktopUpdate((v) => seen.push(v));
      installDesktopUpdate();
      expect(seen).toEqual(['0.3.7', null, null, 'install']);
    } finally {
      delete (globalThis as unknown as { window?: unknown }).window;
    }
  });
});
