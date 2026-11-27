import { describe, expect, it } from 'vitest';
import { seenAgo, seenLabel } from '../lastSeen';

const now = Date.parse('2026-11-24T12:00:00Z');
const ago = (ms: number) => new Date(now - ms).toISOString();
const MIN = 60_000;

describe('last seen', () => {
  it('says how long ago in plain words', () => {
    expect(seenAgo(ago(30_000), now)).toBe('Just now');
    expect(seenAgo(ago(10 * MIN), now)).toBe('10 min ago');
    expect(seenAgo(ago(60 * MIN), now)).toBe('1 hour ago');
    expect(seenAgo(ago(2 * 60 * MIN), now)).toBe('2 hours ago');
    expect(seenAgo(ago(26 * 60 * MIN), now)).toBe('Yesterday');
    expect(seenAgo(ago(3 * 24 * 60 * MIN), now)).toBe('3 days ago');
    expect(seenAgo(ago(40 * 24 * 60 * MIN), now)).toBe('Over a month ago');
  });
  it('copes with nothing recorded', () => {
    expect(seenAgo(null, now)).toBe('Not seen yet');
    expect(seenAgo('nonsense', now)).toBe('Not seen yet');
  });
  it('says Active for the last day and Last seen after that', () => {
    expect(seenLabel(ago(30_000), now)).toBe('Active just now');
    expect(seenLabel(ago(3 * 60 * MIN), now)).toBe('Active 3 hours ago');
    expect(seenLabel(ago(26 * 60 * MIN), now)).toBe('Last seen yesterday');
    expect(seenLabel(ago(5 * 24 * 60 * MIN), now)).toBe('Last seen 5 days ago');
    expect(seenLabel(null, now)).toBe('Not seen yet');
  });
});

import { isActiveRecently } from '../lastSeen';
import { shortName } from '../personName';

describe('who counts as active in the app', () => {
  const now = Date.parse('2026-11-27T12:00:00Z');
  it('is anyone seen in the last five minutes, wherever they were in the app', () => {
    expect(isActiveRecently('2026-11-27T11:57:00Z', now)).toBe(true);
    expect(isActiveRecently('2026-11-27T11:50:00Z', now)).toBe(false);
    expect(isActiveRecently(null, now)).toBe(false);
    expect(isActiveRecently('nonsense', now)).toBe(false);
  });
});

describe('names in the lists', () => {
  it('uses the full name, then the email, and only then says Someone', () => {
    expect(shortName('King  Iyene')).toBe('King Iyene');
    expect(shortName('', 'king.iyene@kdsquares.com')).toBe('King Iyene');
    expect(shortName(null, 'nina_okari2@kdsquares.com')).toBe('Nina Okari');
    expect(shortName(null, null)).toBe('Team member');
    expect(shortName('  ', '@x.com')).toBe('Team member');
  });
});
