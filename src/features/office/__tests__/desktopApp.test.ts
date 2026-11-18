import { describe, expect, it } from 'vitest';
import { DESKTOP_RELEASE_PAGE, desktopDownload } from '../desktopApp';

describe('desktop app download', () => {
  it('picks the installer for the computer', () => {
    expect(desktopDownload('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Win32').label).toBe('Windows');
    expect(desktopDownload('Mozilla/5.0 (Windows NT 10.0) Win32').url).toMatch(/KD-Office-Setup-.*\.exe$/);
    expect(desktopDownload('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) MacIntel').url).toMatch(/\.dmg$/);
    expect(desktopDownload('Mozilla/5.0 (X11; Linux x86_64) Linux x86_64').url).toMatch(/\.AppImage$/);
  });
  it('sends phones and unknown systems to the release page', () => {
    expect(desktopDownload('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)').url).toBe(DESKTOP_RELEASE_PAGE);
    expect(desktopDownload('something odd').url).toBe(DESKTOP_RELEASE_PAGE);
  });
});
