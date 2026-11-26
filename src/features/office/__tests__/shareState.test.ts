import { describe, expect, it } from 'vitest';
import { cleanShare, describeShare, screenVisible, shareMeta, sharingBarText } from '../calls/shareState';

describe('screen share announcements', () => {
  it('round-trips through presence and rejects junk', () => {
    const info = { sid: 'abc', pid: 'def', label: 'Budget.xlsx - Excel', surface: 'window' as const, audio: true };
    expect(cleanShare(shareMeta(info))).toEqual(info);
    expect(cleanShare(shareMeta(null))).toBeNull();
    expect(cleanShare(null)).toBeNull();
    expect(cleanShare({ s: '' })).toBeNull();
    expect(cleanShare({ s: 'x'.repeat(200) })).toBeNull();
    expect(cleanShare({ s: 'ok', k: 'weird' })?.surface).toBe('unknown');
  });
  it('says what is being shared in words', () => {
    expect(describeShare({ surface: 'monitor', label: 'screen:0:0' }).text).toBe('Entire screen');
    expect(describeShare({ surface: 'window', label: 'Budget - Excel' }).text).toBe('A window: Budget - Excel');
    expect(describeShare({ surface: 'browser', label: 'Ops hub' }).text).toBe('A browser tab: Ops hub');
    expect(describeShare({ surface: 'unknown', label: '' }).text).toBe('Their screen');
    // Chrome names windows and tabs with codes, not titles
    expect(describeShare({ surface: 'window', label: 'window:5441:0' }).text).toBe('A window');
    expect(describeShare({ surface: 'browser', label: 'web-contents-media-stream://3:1' }).text).toBe('A browser tab');
  });
});

describe('when a shared screen stays on view', () => {
  const base = { announced: false, everAnnounced: false, live: true, muted: false, mutedForMs: 0 };
  it('stays up while announced, even when a still screen sends nothing for a long time', () => {
    expect(screenVisible({ ...base, announced: true, everAnnounced: true, muted: true, mutedForMs: 60_000 })).toBe(true);
  });
  it('is gone as soon as the presenter stops, even if the last picture lingers', () => {
    expect(screenVisible({ ...base, announced: false, everAnnounced: true })).toBe(false);
  });
  it('is never shown for an ended picture', () => {
    expect(screenVisible({ ...base, announced: true, live: false })).toBe(false);
  });
  it('without an announcement, gives a still screen time before giving up', () => {
    expect(screenVisible({ ...base, muted: true, mutedForMs: 5_000 })).toBe(true);
    expect(screenVisible({ ...base, muted: true, mutedForMs: 20_000 })).toBe(false);
  });
});

describe('the bar the presenter sees', () => {
  it('names what is shared and who can see it', () => {
    const a = sharingBarText({ surface: 'monitor', label: '' }, ['Ada', 'Tunde']);
    expect(a.headline).toBe('You are sharing your entire screen');
    expect(a.detail).toBe('Seen by Ada, Tunde.');
    expect(sharingBarText({ surface: 'window', label: 'Notes' }, []).detail).toMatch(/Nobody is connected yet/);
    expect(sharingBarText({ surface: 'browser', label: '', audio: true }, ['Ada']).detail).toBe('Seen by Ada. Its sound is shared too.');
    expect(sharingBarText({ surface: 'window', label: 'Notes' }, ['a', 'b', 'c', 'd', 'e']).detail).toBe('Seen by a, b, c and 2 more.');
  });
});
