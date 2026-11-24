import { describe, expect, it } from 'vitest';
import { clientHours, sharedWindow, spell } from '../world/clientHours';

// 2026-03-04 is a Wednesday (no daylight-saving change that week in either hemisphere)
const at = (iso: string) => Date.parse(iso);

describe('clientHours', () => {
  it('is open in the middle of a client weekday', () => {
    expect(clientHours('America/New_York', at('2026-03-04T17:00:00Z')).state).toBe('open'); // 12:00 in New York
  });
  it('is closing in the last hour and opening in the hour before', () => {
    const c = clientHours('America/New_York', at('2026-03-04T21:30:00Z')); // 16:30
    expect(c.state).toBe('closing');
    expect(c.minutes).toBe(30);
    expect(clientHours('America/New_York', at('2026-03-04T13:30:00Z')).state).toBe('opening'); // 08:30
  });
  it('is closed at night and on weekends', () => {
    expect(clientHours('America/New_York', at('2026-03-05T03:00:00Z')).state).toBe('closed'); // 22:00 Wednesday
    expect(clientHours('America/New_York', at('2026-03-07T17:00:00Z')).state).toBe('weekend'); // Saturday noon
  });
  it('Australia is already into tomorrow while it is still Wednesday evening in Lagos', () => {
    expect(clientHours('Australia/Sydney', at('2026-03-04T22:00:00Z')).state).toBe('open'); // 09:00 Thursday in Sydney
  });
});

describe('sharedWindow', () => {
  it('finds when Lagos (8-18) and New York (9-17) are both at work', () => {
    const w = sharedWindow('America/New_York', at('2026-03-04T05:00:00Z'));
    expect(w).not.toBeNull();
    // 14:00 UTC = 15:00 Lagos and 09:00 New York, until 17:00 Lagos = 16:00 UTC
    expect(new Date(w!.start).toISOString()).toBe('2026-03-04T14:00:00.000Z');
    expect(new Date(w!.end).toISOString()).toBe('2026-03-04T17:00:00.000Z');
  });
  it('Sydney and Lagos barely meet, if at all, but never crash', () => {
    const w = sharedWindow('Australia/Sydney', at('2026-03-04T05:00:00Z'));
    if (w) expect(w.end).toBeGreaterThan(w.start);
  });
});

describe('spell', () => {
  it('writes minutes', () => {
    expect(spell(45)).toBe('45 min');
    expect(spell(120)).toBe('2 h');
    expect(spell(150)).toBe('2 h 30 min');
  });
});
