import { describe, expect, it } from 'vitest';
import { FAR, NEAR, isInitiator, parseSignal, volumeFor, wantsConnection, type Spot } from '../calls/rules';

const at = (x: number, y: number, room: string | null = null): Spot => ({ x, y, room });

describe('wantsConnection', () => {
  it('connects people who are close in the open', () => {
    expect(wantsConnection(at(0, 0), at(NEAR - 0.1, 0), false)).toBe(true);
  });
  it('does not connect people who are far apart', () => {
    expect(wantsConnection(at(0, 0), at(NEAR + 0.5, 0), false)).toBe(false);
  });
  it('keeps an existing connection a little past the start distance, then drops it', () => {
    expect(wantsConnection(at(0, 0), at(NEAR + 1, 0), true)).toBe(true);
    expect(wantsConnection(at(0, 0), at(FAR + 0.1, 0), true)).toBe(false);
  });
  it('connects everyone inside the same meeting room at any distance', () => {
    expect(wantsConnection(at(0, 0, 'r1'), at(30, 20, 'r1'), false)).toBe(true);
  });
  it('keeps people in a meeting room apart from people outside, even when standing next to them', () => {
    expect(wantsConnection(at(0, 0, 'r1'), at(0.5, 0, null), true)).toBe(false);
    expect(wantsConnection(at(0, 0, null), at(0.5, 0, 'r1'), true)).toBe(false);
  });
  it('keeps two different meeting rooms apart', () => {
    expect(wantsConnection(at(0, 0, 'r1'), at(1, 0, 'r2'), true)).toBe(false);
  });
});

describe('volumeFor', () => {
  it('is full when close and fades with distance to nothing', () => {
    expect(volumeFor(at(0, 0), at(1, 0))).toBe(1);
    const mid = volumeFor(at(0, 0), at(4, 0));
    expect(mid).toBeGreaterThan(0.08);
    expect(mid).toBeLessThan(1);
    expect(volumeFor(at(0, 0), at(FAR, 0))).toBe(0);
  });
  it('is full inside the same room and silent across a room boundary', () => {
    expect(volumeFor(at(0, 0, 'r1'), at(9, 9, 'r1'))).toBe(1);
    expect(volumeFor(at(0, 0, 'r1'), at(0.2, 0))).toBe(0);
  });
});

describe('isInitiator', () => {
  it('picks exactly one side', () => {
    expect(isInitiator('a', 'b')).toBe(true);
    expect(isInitiator('b', 'a')).toBe(false);
  });
});

describe('parseSignal', () => {
  const good = { f: 'a', t: 'me', k: 'sdp', d: { type: 'offer', sdp: 'x' } };
  it('accepts a well-formed message for me', () => {
    expect(parseSignal(good, 'me')?.f).toBe('a');
  });
  it('rejects messages for someone else, from myself, or malformed', () => {
    expect(parseSignal({ ...good, t: 'other' }, 'me')).toBeNull();
    expect(parseSignal({ ...good, f: 'me' }, 'me')).toBeNull();
    expect(parseSignal({ ...good, k: 'x' }, 'me')).toBeNull();
    expect(parseSignal({ ...good, d: null }, 'me')).toBeNull();
    expect(parseSignal(null, 'me')).toBeNull();
    expect(parseSignal({ ...good, f: 'x'.repeat(80) }, 'me')).toBeNull();
  });
});

describe('town hall: one person speaks to the whole office', () => {
  const speaker: Spot = { x: 50, y: 33, room: 'auditorium', live: true };
  it('connects the speaker with someone anywhere in the open, at any distance', () => {
    const far: Spot = { x: 5, y: 60, room: null };
    expect(wantsConnection(speaker, far, false)).toBe(true);
    expect(wantsConnection(far, speaker, false)).toBe(true);
  });
  it('does not reach somebody who switched the town hall off', () => {
    const muted: Spot = { x: 5, y: 60, room: null, townMuted: true };
    expect(wantsConnection(speaker, muted, false)).toBe(false);
    expect(wantsConnection(muted, speaker, false)).toBe(false);
  });
  it('does not break into a private meeting room, but does reach the speaker\'s own room', () => {
    expect(wantsConnection(speaker, { x: 55, y: 15, room: 'meeting-1' }, false)).toBe(false);
    expect(wantsConnection(speaker, { x: 40, y: 40, room: 'auditorium' }, false)).toBe(true);
  });
  it('the audience hears the speaker at full volume wherever they stand, and the speaker hears nobody (no echo)', () => {
    const far: Spot = { x: 5, y: 60, room: null };
    expect(volumeFor(far, speaker)).toBe(1);
    expect(volumeFor(speaker, far)).toBe(0);
    expect(volumeFor(speaker, { x: 51, y: 33, room: 'auditorium' })).toBe(0);
    expect(volumeFor({ x: 5, y: 60, room: null, townMuted: true }, speaker)).toBe(0);
  });
  it('two people speaking at once change nothing: the normal rules apply', () => {
    const a: Spot = { x: 0, y: 0, room: null, live: true };
    const b: Spot = { x: 30, y: 30, room: null, live: true };
    expect(wantsConnection(a, b, false)).toBe(false);
  });
  it('normal talking is unchanged when nobody is speaking', () => {
    expect(wantsConnection(at(0, 0), at(NEAR - 0.1, 0), false)).toBe(true);
    expect(wantsConnection(at(0, 0), at(NEAR + 3, 0), false)).toBe(false);
  });
});
