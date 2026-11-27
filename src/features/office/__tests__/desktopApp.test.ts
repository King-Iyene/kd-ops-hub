import { describe, expect, it } from 'vitest';
import { desktopDownload, installDesktopUpdate, onDesktopUpdate } from '../desktopApp';

describe('desktop app download', () => {
  it('picks the installer for the computer', () => {
    expect(desktopDownload('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Win32').label).toBe('Windows');
    expect(desktopDownload('Mozilla/5.0 (Windows NT 10.0) Win32').file).toMatch(/^KD-Ops-Setup-.*\.exe$/);
    expect(desktopDownload('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) MacIntel').file).toMatch(/\.dmg$/);
    expect(desktopDownload('Mozilla/5.0 (X11; Linux x86_64) Linux x86_64').file).toMatch(/\.AppImage$/);
  });
  it('serves the file from our own storage, never from GitHub', () => {
    for (const ua of ['Mozilla/5.0 (Windows NT 10.0) Win32', 'Mozilla/5.0 (Macintosh) MacIntel', 'Mozilla/5.0 (X11; Linux x86_64) Linux x86_64']) {
      const u = desktopDownload(ua).url;
      expect(u).toContain('/storage/v1/object/public/desktop-app/');
      expect(u).toContain('?download=');
      expect(u).not.toMatch(/github\.com/);
    }
  });
  it('has nothing to download on a phone or an unknown system', () => {
    expect(desktopDownload('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)').url).toBe('');
    expect(desktopDownload('something odd').url).toBe('');
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
