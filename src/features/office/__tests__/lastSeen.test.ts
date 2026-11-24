import { describe, expect, it } from 'vitest';
import { seenAgo } from '../lastSeen';

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
});
